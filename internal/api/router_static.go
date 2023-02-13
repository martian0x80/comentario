package api

import (
	"github.com/gorilla/mux"
	"gitlab.com/comentario/comentario/internal/config"
	"gitlab.com/comentario/comentario/internal/util"
	"mime"
	"net/http"
	"os"
	"path"
	"strings"
)

func redirectLogin(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, os.Getenv("ORIGIN")+"/login", 301)
}

var asset = make(map[string][]byte)
var contentType = make(map[string]string)
var footer string
var compress bool

func fileDetemplate(f string) ([]byte, error) {
	contents, err := os.ReadFile(f)
	if err != nil {
		logger.Errorf("cannot read file %s: %v", f, err)
		return []byte{}, err
	}

	x := string(contents)
	x = strings.Replace(x, "[[[.Origin]]]", os.Getenv("ORIGIN"), -1)
	x = strings.Replace(x, "[[[.CdnPrefix]]]", os.Getenv("CDN_PREFIX"), -1)
	x = strings.Replace(x, "[[[.Footer]]]", footer, -1)
	x = strings.Replace(x, "[[[.Version]]]", config.Version, -1)

	return []byte(x), nil
}

func footerInit() error {
	contents, err := fileDetemplate(os.Getenv("STATIC") + "/html/footer.html")
	if err != nil {
		logger.Errorf("cannot init footer: %v", err)
		return err
	}

	footer = string(contents)
	return nil
}

func fileLoad(f string) ([]byte, error) {
	b, err := fileDetemplate(f)
	if err != nil {
		logger.Errorf("cannot load file %s: %v", f, err)
		return []byte{}, err
	}

	if !compress {
		return b, nil
	}

	return util.GzipStatic(b)
}

func staticRouterInit(router *mux.Router) error {
	var err error

	subdir := pathStrip(os.Getenv("ORIGIN"))

	if err = footerInit(); err != nil {
		logger.Errorf("error initialising static router: %v", err)
		return err
	}

	for _, dir := range []string{"/js", "/css", "/images", "/fonts"} {
		files, err := os.ReadDir(os.Getenv("STATIC") + dir)
		if err != nil {
			logger.Errorf("cannot read directory %s%s: %v", os.Getenv("STATIC"), dir, err)
			return err
		}

		for _, file := range files {
			f := dir + "/" + file.Name()
			asset[subdir+f], err = fileLoad(os.Getenv("STATIC") + f)
			if err != nil {
				logger.Errorf("cannot un-template %s%s: %v", os.Getenv("STATIC"), f, err)
				return err
			}
		}
	}

	pages := []string{
		"/login",
		"/forgot",
		"/reset",
		"/signup",
		"/confirm-email",
		"/unsubscribe",
		"/dashboard",
		"/settings",
		"/logout",
		"/profile",
	}

	for _, page := range pages {
		f := page + ".html"
		asset[subdir+page], err = fileLoad(os.Getenv("STATIC") + "/html" + f)
		if err != nil {
			logger.Errorf("cannot detemplate %s/html%s: %v", os.Getenv("STATIC"), f, err)
			return err
		}
	}

	for p := range asset {
		if path.Ext(p) != "" {
			contentType[p] = mime.TypeByExtension(path.Ext(p))
		} else {
			contentType[p] = "text/html; charset=utf-8"
		}

		router.HandleFunc(p, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", contentType[r.URL.Path])
			if compress {
				w.Header().Set("Content-Encoding", "gzip")
			}
			_, _ = w.Write(asset[r.URL.Path])
		})
	}

	router.HandleFunc("/", redirectLogin)

	return nil
}
