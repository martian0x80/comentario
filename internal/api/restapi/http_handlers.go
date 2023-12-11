package restapi

import (
	"fmt"
	"github.com/go-openapi/errors"
	"github.com/go-openapi/runtime"
	"github.com/gorilla/csrf"
	"github.com/gorilla/handlers"
	"github.com/justinas/alice"
	rh "gitlab.com/comentario/comentario/internal/api/restapi/handlers"
	"gitlab.com/comentario/comentario/internal/api/restapi/operations/api_general"
	"gitlab.com/comentario/comentario/internal/config"
	"gitlab.com/comentario/comentario/internal/util"
	"net/http"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
)

// notFoundBypassWriter is an object that pretends to be a ResponseWriter but refrains from writing a 404 response
type notFoundBypassWriter struct {
	http.ResponseWriter
	status int
}

func (w *notFoundBypassWriter) WriteHeader(status int) {
	// Store the status for our own use
	w.status = status

	// Pass through unless it's a NotFound response
	if status != http.StatusNotFound {
		w.ResponseWriter.WriteHeader(status)
	}
}

func (w *notFoundBypassWriter) Write(p []byte) (int, error) {
	// Do not write anything on a NotFound response, but pretend the write has been successful
	if w.status == http.StatusNotFound {
		return len(p), nil
	}

	// Pass through to the real writer
	return w.ResponseWriter.Write(p)
}

// corsHandler returns a middleware that adds CORS headers to responses
func corsHandler(next http.Handler) http.Handler {
	return handlers.CORS(
		// Add a dummy origin validator, which will cause the Access-Control-Allow-Origin header to be the return
		// origin. This is necessary because otherwise XMLHttpRequest having withCredentials == true (which is the case
		// for the embed API client) won't work
		handlers.AllowedOriginValidator(func(string) bool { return true }),
		// This is also required to allow XHR with credentials
		handlers.AllowCredentials(),
		handlers.AllowedHeaders([]string{
			"Accept-Encoding", "Authorization", "Content-Type", "Content-Length", "X-Requested-With",
			util.HeaderUserSession, util.HeaderXSRFToken}),
		handlers.AllowedMethods([]string{"GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"}),
	)(next)
}

// fallbackHandler returns a middleware that is called in case all other handlers failed
func fallbackHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only serve 404's on GET requests
		if r.Method == http.MethodGet {
			http.NotFoundHandler().ServeHTTP(w, r)

		} else {
			// Any other method
			w.WriteHeader(http.StatusMethodNotAllowed)
			w.Header().Set("Content-Type", "text/plain")
			_, _ = w.Write([]byte("Method not allowed"))
		}
	})
}

// makeAPIHandler returns a constructor function for the provided API handler
func makeAPIHandler(apiHandler http.Handler) alice.Constructor {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Verify the URL is a correct one
			if ok, p := config.PathOfBaseURL(r.URL.Path); ok {
				// If it's an API call. Also check whether the Swagger UI is enabled (because it's also served by the API)
				isAPIPath := strings.HasPrefix(p, util.APIPath)
				isSwaggerPath := p == "swagger.json" || strings.HasPrefix(p, util.SwaggerUIPath)
				if !isSwaggerPath && isAPIPath || isSwaggerPath && config.CLIFlags.EnableSwaggerUI {
					r.URL.Path = "/" + p
					apiHandler.ServeHTTP(w, r)
					return
				}
			}

			// Pass on to the next handler otherwise
			next.ServeHTTP(w, r)
		})
	}
}

// redirectToLangRootHandler returns a middleware that redirects the user from the site root or an "incomplete" language
// root (such as "/en") to the complete/appropriate language root (such as "/en/")
func redirectToLangRootHandler(next http.Handler) http.Handler {
	// Replace the path in the provided URL and return the whole URL as a string
	replacePath := func(u *url.URL, p string) string {
		// Clone the URL
		cu := *u
		// Wipe out any user info
		cu.User = nil
		// Replace the path
		cu.Path = p
		return cu.String()
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// If it's 'GET <path-under-root>'
		if ok, p := config.PathOfBaseURL(r.URL.Path); ok && r.Method == http.MethodGet {
			switch len(p) {
			// Site root: redirect to the most appropriate language root
			case 0:
				// Redirect with 302 and not "Moved Permanently" to avoid caching by browsers
				http.Redirect(
					w,
					r,
					replacePath(r.URL, fmt.Sprintf("/%s/", config.GuessUserLanguage(r))),
					http.StatusFound)
				return

			// If it's an "incomplete" language root, redirect to the full root, permanently
			case 2:
				if util.IsUILang(p) {
					http.Redirect(
						w,
						r,
						replacePath(r.URL, fmt.Sprintf("/%s/", p)), http.StatusMovedPermanently)
					return
				}
			}
		}

		// Otherwise, hand over to the next handler
		next.ServeHTTP(w, r)
	})
}

// securityHeadersHandler returns a middleware that adds security-related headers to the response
func securityHeadersHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Add the headers
		h := w.Header()
		h.Set("Strict-Transport-Security", "max-age=31536000")
		h.Set("X-Frame-Options", "SAMEORIGIN")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "origin")

		// Hand over to the next handler
		next.ServeHTTP(w, r)
	})
}

// serveFileWithPlaceholders serves out files that contain placeholders, i.e. HTML, CSS, and JS files
func serveFileWithPlaceholders(filePath string, w http.ResponseWriter, r *http.Request) {
	logger.Debugf("Serving file '/%s' replacing placeholders", filePath)

	// Read in the file
	filename := path.Join(config.CLIFlags.StaticPath, filePath)
	b, err := os.ReadFile(filename)

	// If file doesn't exist, respond with 404 Not Found
	if os.IsNotExist(err) {
		logger.Warningf("File doesn't exist: %s", filename)
		errors.ServeError(w, r, errors.NotFound(""))
		return
	} else if err != nil {
		// Any other error
		logger.Warningf("Failed to read %s: %v", filename, err)
		errors.ServeError(w, r, err)
		return
	}

	// Pass the file through the replacements, if there's a placeholder found
	s := string(b)
	if strings.Contains(s, "[[[.") {
		b = []byte(
			strings.Replace(strings.Replace(s,
				"[[[.Origin]]]", strings.TrimSuffix(config.BaseURL.String(), "/"), -1),
				"[[[.CdnPrefix]]]", strings.TrimSuffix(config.CDNURL.String(), "/"), -1))
	}

	// Determine content type
	ctype := "text/plain"
	if strings.HasSuffix(filePath, ".html") {
		ctype = "text/html; charset=utf-8"
	} else if strings.HasSuffix(filePath, ".js") {
		ctype = "text/javascript; charset=utf-8"
	} else if strings.HasSuffix(filePath, ".css") {
		ctype = "text/css; charset=utf-8"
	}

	// Serve the final result out
	h := w.Header()
	h.Set("Content-Length", strconv.Itoa(len(b)))
	h.Set("Content-Type", ctype)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(b)
}

// staticHandler returns a middleware that serves the static content of the app, which includes:
// - stuff listed in UIStaticPaths[] (favicon and such)
// - paths starting from a language root ('/en/', '/ru/' etc.)
func staticHandler(next http.Handler) http.Handler {
	// Instantiate a file server for static content
	fileHandler := http.FileServer(http.Dir(config.CLIFlags.StaticPath))

	// Make a middleware handler
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Resources are only served out via GET
		if r.Method == http.MethodGet {
			// If it's a path under the base URL
			if ok, p := config.PathOfBaseURL(r.URL.Path); ok {
				// Check if it's a static resource or a path on/under a language root
				repl, static := util.UIStaticPaths[p]
				hasLang := !static && len(p) >= 3 && p[2] == '/' && util.IsUILang(p[0:2])
				langRoot := hasLang && len(p) == 3 // If the path looks like 'xx/', it's a language root

				// If under a language root, set a language cookie
				if hasLang {
					http.SetCookie(w, &http.Cookie{
						Name:   "lang",
						Value:  p[0:2],
						Path:   "/",
						MaxAge: int(util.LangCookieDuration.Seconds()),
					})
				}

				// If it's a static file with placeholders, serve it with replacements
				if static && repl {
					serveFileWithPlaceholders(p, w, r)
					return
				}

				// Non-replaceable static stuff and content under language root
				if static || hasLang {
					// Do not allow directory browsing (any path ending with a '/', which isn't a language root)
					if !langRoot && !strings.HasSuffix(p, "/") {
						// Make a "fake" (bypassing) response writer
						bypassWriter := &notFoundBypassWriter{ResponseWriter: w}

						// Try to serve the requested static content
						fileHandler.ServeHTTP(bypassWriter, r)

						// If the content was found, we're done
						if bypassWriter.status != http.StatusNotFound {
							return
						}
					}

					// Language root or file wasn't found: serve the main application script for the given language
					if hasLang {
						serveFileWithPlaceholders(fmt.Sprintf("%s/index.html", p[0:2]), w, r)
						return
					}

					// Remove any existing content type to allow automatic MIME type detection
					delete(w.Header(), "Content-Type")
				}
			}
		}

		// Pass on to the next handler otherwise
		next.ServeHTTP(w, r)
	})
}

// xsrfErrorHandler handles XSRF related errors
func xsrfErrorHandler(w http.ResponseWriter, r *http.Request) {
	// Respond with 403, with an XSRF error as a payload
	w.Header().Set("Content-type", "application/json")
	api_general.NewGenericForbidden().
		WithPayload(rh.ErrorXSRFTokenInvalid.WithDetails(csrf.FailureReason(r).Error())).
		WriteResponse(w, runtime.JSONProducer())
}

// xsrfProtectHandler returns a middleware that protects the application against XSRF attacks
func xsrfProtectHandler(next http.Handler) http.Handler {
	// Instantiate a CSRF handler (chained to the "next")
	handler := csrf.Protect(
		config.XSRFKey,
		csrf.ErrorHandler(http.HandlerFunc(xsrfErrorHandler)),
		// Since the presence of this cookie also controls the appearance of the "XSRF-TOKEN" cookie, they must share
		// the same path
		csrf.Path("/"),
		csrf.Secure(config.UseHTTPS),
		csrf.HttpOnly(true),
		csrf.CookieName(util.CookieNameXSRFSession),
		csrf.RequestHeader(util.HeaderXSRFToken))(next)

	// Make a new handler that either calls XSRF of passes control on directly to "next"
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Bypass the XSRF handler if it's a known "safe" path
		if util.XSRFSafePaths.Has(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		// Protect any "unsafe" path
		handler.ServeHTTP(w, r)
	})
}

// xsrfCookieHandler returns a middleware that adds an XSRF cookie to the response
func xsrfCookieHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set a cookie with the generated token whenever Gorilla's session cookie is not present or the config is
		// requested
		_, err := r.Cookie(util.CookieNameXSRFSession)
		if err != nil || r.URL.Path == "/"+util.APIPath+"config" {
			http.SetCookie(w, &http.Cookie{
				Name:     util.CookieNameXSRFToken,
				Value:    csrf.Token(r),
				Path:     "/",
				MaxAge:   int(util.UserSessionDuration.Seconds()),
				Secure:   config.UseHTTPS,
				HttpOnly: false,
			})
		}

		// Pass on to the next handler
		next.ServeHTTP(w, r)
	})
}
