package handlers

import (
	"crypto/hmac"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/go-openapi/runtime/middleware"
	"github.com/go-openapi/swag"
	"github.com/google/uuid"
	"github.com/markbates/goth"
	"gitlab.com/comentario/comentario/internal/api/exmodels"
	"gitlab.com/comentario/comentario/internal/api/models"
	"gitlab.com/comentario/comentario/internal/api/restapi/operations/api_general"
	"gitlab.com/comentario/comentario/internal/config"
	"gitlab.com/comentario/comentario/internal/data"
	"gitlab.com/comentario/comentario/internal/svc"
	"gitlab.com/comentario/comentario/internal/util"
	"net/http"
	"net/url"
)

type ssoPayload struct {
	Token string `json:"token"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Photo string `json:"photo"`
	Link  string `json:"link"`
	Role  string `json:"role"`
}

func AuthOauthCallback(params api_general.AuthOauthCallbackParams) middleware.Responder {
	// SSO authentication is a special case
	var provider goth.Provider
	var r middleware.Responder
	var idpID string
	if params.Provider != "sso" {
		idpID = params.Provider

		// It's a goth provider: find it
		if provider, r = Verifier.FederatedIdProvider(models.FederatedIdpID(idpID)); r != nil {
			return r
		}
	}

	// Obtain the auth session ID from the cookie
	var authSession *data.AuthSession
	if cookie, err := params.HTTPRequest.Cookie(util.CookieNameAuthSession); err != nil {
		logger.Debugf("Auth session cookie error: %v", err)
		return oauthFailure(false, "auth session cookie missing", err)

		// Parse the session ID
	} else if authSessID, err := uuid.Parse(cookie.Value); err != nil {
		return oauthFailure(false, "invalid auth session ID", err)

		// Find and delete the session
	} else if authSession, err = svc.TheAuthSessionService.TakeByID(&authSessID); errors.Is(err, svc.ErrNotFound) {
		return oauthFailure(false, "auth session not found", fmt.Errorf("no auth session found with ID=%v: %w", authSessID, err))

	} else if err != nil {
		// Any other DB-related error
		return oauthFailureInternal(false, err)
	}

	// Obtain the token
	token, err := svc.TheTokenService.FindByValue(authSession.TokenValue, false)
	if err != nil {
		return oauthFailureInternal(false, err)

		// Make sure the token is still anonymous
	} else if !token.IsAnonymous() {
		return oauthFailure(false, exmodels.ErrorBadToken.Message, fmt.Errorf("token isn't anonymous but belongs to user %v", &token.Owner))
	}

	// If it's a commenter login/signup, find the domain the user is authenticating on
	var domain *data.Domain
	if authSession.Host != "" {
		domain, err = svc.TheDomainService.FindByHost(authSession.Host)
		if err != nil {
			return oauthFailureInternal(false, err)
		}

	} else if provider == nil {
		// Host is mandatory for SSO
		return oauthFailure(false, "host is missing in request", nil)
	}

	reqParams := params.HTTPRequest.URL.Query()
	var fedUser goth.User
	var userWebsiteURL string
	var userRole models.DomainUserRole

	// SSO auth
	nonIntSSO := false
	if provider == nil {
		// Validate domain SSO config
		if r := Verifier.DomainSSOConfig(domain); r != nil {
			return r
		}

		nonIntSSO = domain.SSONonInteractive

		// Verify the payload
		payload := ssoPayload{}
		var payloadBytes []byte
		if s := reqParams.Get("payload"); s == "" {
			return oauthFailure(nonIntSSO, "payload is missing", nil)
		} else if payloadBytes, err = hex.DecodeString(s); err != nil {
			return oauthFailure(nonIntSSO, "payload: invalid hex encoding", err)
		} else if err = json.Unmarshal(payloadBytes, &payload); err != nil {
			return oauthFailureInternal(nonIntSSO, fmt.Errorf("payload: failed to unmarshal: %w", err))
		} else if payload.Token != token.Value {
			return oauthFailure(nonIntSSO, "payload: invalid token", nil)
		}

		// Verify the HMAC signature
		if s := reqParams.Get("hmac"); s == "" {
			return oauthFailure(nonIntSSO, "hmac is missing", nil)
		} else if signature, err := hex.DecodeString(s); err != nil {
			return oauthFailure(nonIntSSO, "hmac: invalid hex encoding", err)
		} else if secBytes, err := domain.SSOSecretBytes(); err != nil {
			return oauthFailure(nonIntSSO, "domain SSO secret: invalid hex encoding", err)
		} else if secBytes == nil {
			return oauthFailure(nonIntSSO, "domain SSO secret not set", nil)
		} else if !hmac.Equal(signature, util.HMACSign(payloadBytes, secBytes)) {
			return oauthFailure(nonIntSSO, "hmac: signature verification failed", nil)
		}

		// Prepare a federated user, using email as the ID (until #100 is implemented)
		fedUser = goth.User{
			Email:  payload.Email,
			Name:   payload.Name,
			UserID: payload.Email,
		}

		// If a valid avatar link is provided, store it as the user's avatar URL
		if util.IsValidURL(payload.Photo, true) {
			fedUser.AvatarURL = payload.Photo
		}

		// If a valid profile link is provided, store it as the user's website URL
		if util.IsValidURL(payload.Link, true) {
			userWebsiteURL = payload.Link
		}

		// Take over the user role, if any
		userRole = models.DomainUserRole(payload.Role)

		// Non-SSO auth
	} else {
		// Recover the original provider session
		sess, err := provider.UnmarshalSession(authSession.Data)
		if err != nil {
			return oauthFailureInternal(false, fmt.Errorf("failed to unmarshal auth session: %w", err))
		}

		// Validate the session state
		if msg, err := validateAuthSessionState(sess, params.HTTPRequest); err != nil {
			return oauthFailure(false, msg, err)
		}

		// Obtain the OAuth tokens
		_, err = sess.Authorize(provider, reqParams)
		if err != nil {
			return oauthFailure(false, "auth session unauthorised", err)
		}

		// Fetch the federated user
		fedUser, err = provider.FetchUser(sess)
		if err != nil {
			return oauthFailure(false, "fetching user failed", err)
		}
	}

	// Validate the federated user
	// -- UserID
	if fedUser.UserID == "" {
		return oauthFailure(nonIntSSO, "user ID missing", nil)
	}
	// -- Email
	if fedUser.Email == "" {
		return oauthFailure(nonIntSSO, "user email missing", nil)
	}
	// -- Name. Fall back to NickName should the Name prove empty
	fedUserName := fedUser.Name
	if fedUserName == "" {
		fedUserName = fedUser.NickName
	}
	if fedUserName == "" {
		return oauthFailure(nonIntSSO, "user name missing", nil)
	}

	// Try to find an existing user by their federated ID
	user, err := svc.TheUserService.FindUserByFederatedID(idpID, fedUser.UserID)
	if errors.Is(err, svc.ErrNotFound) {
		// If the ID wasn't found, also try to look the user up by email, because historically federated/SSO users were
		// created without an ID; the same also applies to imported users
		if user, err = svc.TheUserService.FindUserByEmail(fedUser.Email); errors.Is(err, svc.ErrNotFound) {
			// No such user
			user = nil
			err = nil
		}
	}

	// Any DB error other than "not found"
	if err != nil {
		return oauthFailureInternal(nonIntSSO, err)
	}

	// If no such user, it's a signup
	if user == nil {
		var cfgItem *data.DynConfigItem
		if domain == nil {
			// Frontend signup
			cfgItem, err = svc.TheDynConfigService.Get(data.ConfigKeyAuthSignupEnabled)

		} else if provider != nil {
			// Federated embed signup
			cfgItem, err = svc.TheDomainConfigService.Get(&domain.ID, data.DomainConfigKeyFederatedSignupEnabled)

		} else {
			// SSO embed signup
			cfgItem, err = svc.TheDomainConfigService.Get(&domain.ID, data.DomainConfigKeySsoSignupEnabled)
		}

		// Check for setting fetching error
		if err != nil {
			return oauthFailureInternal(nonIntSSO, err)
		}

		// Check if the setting enables signup
		if !cfgItem.AsBool() {
			return oauthFailure(nonIntSSO, exmodels.ErrorSignupsForbidden.Message, nil)
		}

		// Make sure the email isn't in use yet
		if errm, _ := Verifier.UserCanSignupWithEmail(fedUser.Email); errm != nil {
			return oauthFailure(nonIntSSO, errm.String(), nil)
		}

		// Insert a new user
		user = data.NewUser(fedUser.Email, fedUserName).
			WithConfirmed(true). // Confirm the user right away as we trust the IdP
			WithLangFromReq(params.HTTPRequest).
			WithSignup(params.HTTPRequest, authSession.Host, !config.ServerConfig.LogFullIPs).
			WithFederated(fedUser.UserID, idpID).
			WithWebsiteURL(userWebsiteURL)
		if err := svc.TheUserService.Create(user); err != nil {
			return oauthFailureInternal(nonIntSSO, err)
		}

		// User is found. If a local account exists
	} else if user.IsLocal() {
		return oauthFailure(nonIntSSO, exmodels.ErrorLoginLocally.Message, nil)

		// Existing account is a federated one. Make sure the user isn't changing their IdP
	} else if provider != nil && user.FederatedIdP.String != idpID {
		return oauthFailure(nonIntSSO, exmodels.ErrorLoginUsingIdP.WithDetails(user.FederatedIdP.String).String(), nil)

		// If user is authenticating via SSO, it must stay that way
	} else if provider == nil && !user.FederatedSSO {
		return oauthFailure(nonIntSSO, exmodels.ErrorLoginUsingSSO.Message, nil)

		// If the federated ID is available, it must match the one coming from the provider; otherwise it means the
		// email belongs to a different user
	} else if user.FederatedID != "" && user.FederatedID != fedUser.UserID {
		return oauthFailure(
			nonIntSSO,
			exmodels.ErrorEmailAlreadyExists.Message,
			fmt.Errorf("federated ID from IdP (%q) didn't match one user has (%q)", fedUser.UserID, user.FederatedID))

		// Verify they're allowed to log in
	} else if errm := svc.TheAuthService.UserCanAuthenticate(user, true); errm != nil {
		return respUnauthorized(errm)

	} else {
		// If the user's email is changing, make sure no such email exists
		if user.Email != fedUser.Email {
			if _, err := svc.TheUserService.FindUserByEmail(fedUser.Email); !errors.Is(err, svc.ErrNotFound) {
				return oauthFailure(nonIntSSO, exmodels.ErrorEmailAlreadyExists.Message, nil)
			}
			user.WithEmail(fedUser.Email)
		}

		// Update user details
		user.
			WithName(fedUserName).
			WithFederated(fedUser.UserID, idpID).
			WithWebsiteURL(userWebsiteURL)
		if err := svc.TheUserService.Update(user); err != nil {
			return oauthFailureInternal(nonIntSSO, err)
		}
	}

	// If there's an avatar URL and the avatar isn't customised, fetch and update the avatar
	if fedUser.AvatarURL != "" {
		// Give the process a while to complete, and proceed if it times out
		util.GoTimeout(util.AvatarFetchTimeout, func() { _ = svc.TheAvatarService.DownloadAndUpdateByUserID(&user.ID, fedUser.AvatarURL, false) })

		// Otherwise, try to fetch an image from Gravatar, if enabled
	} else if svc.TheDynConfigService.GetBool(data.ConfigKeyIntegrationsUseGravatar) {
		svc.TheAvatarService.SetFromGravatarAsync(&user.ID, user.Email, false)
	}

	// Update the token by binding it to the authenticated user
	token.Owner = user.ID
	if err := svc.TheTokenService.Update(token); err != nil {
		return oauthFailureInternal(nonIntSSO, err)
	}

	// If there's a domain, make sure a domain user exists for this user
	if domain != nil {
		_, du, err := svc.TheDomainService.FindDomainUserByID(&domain.ID, &user.ID, true)
		if err != nil {
			return oauthFailureInternal(nonIntSSO, err)
		}

		// If a role was returned by the (SSO) provider and it's changing, update the domain user
		if userRole != "" && userRole != du.Role() {
			if err := svc.TheDomainService.UserModify(du.WithRole(userRole)); err != nil {
				return oauthFailureInternal(nonIntSSO, err)
			}
		}
	}

	// Auth successful. If it's non-interactive SSO
	var resp middleware.Responder
	if nonIntSSO {
		// Send a success message to the parent window
		resp = postNonInteractiveLoginResponse("")
	} else {
		// Interactive auth: close the login popup
		resp = closeParentWindowResponse()
	}

	// Succeeded: post the response, removing the auth session cookie
	return NewCookieResponder(resp).WithoutCookie(util.CookieNameAuthSession, "/")
}

// AuthOauthInit initiates a federated authentication process
func AuthOauthInit(params api_general.AuthOauthInitParams) middleware.Responder {
	// SSO authentication is a special case
	var provider goth.Provider
	var r middleware.Responder
	host := swag.StringValue(params.Host)
	if params.Provider == "sso" {
		// Verify there's a host specified
		if host == "" {
			return oauthFailure(false, exmodels.ErrorInvalidPropertyValue.WithDetails("host").String(), nil)
		}

		// Otherwise it's a goth provider: find it
	} else if provider, r = Verifier.FederatedIdProvider(models.FederatedIdpID(params.Provider)); r != nil {
		return r
	}

	// Try to find the passed anonymous token
	token, err := svc.TheTokenService.FindByValue(params.Token, false)
	if errors.Is(err, svc.ErrNotFound) {
		// Token not found
		return oauthFailure(false, exmodels.ErrorBadToken.Message, nil)
	} else if err != nil {
		// Any other database error
		return oauthFailureInternal(false, err)
		// Make sure the token is anonymous
	} else if !token.IsAnonymous() {
		return oauthFailure(false, exmodels.ErrorBadToken.Message, fmt.Errorf("token isn't anonymous but belongs to user %v", &token.Owner))
	}

	// SSO auth
	var authURL, sessionData string
	nonIntSSO := false
	if provider == nil {
		// Find the domain the user is authenticating on
		domain, err := svc.TheDomainService.FindByHost(host)
		if err != nil {
			return oauthFailureInternal(false, err)
		}

		// Validate domain SSO config
		if r := Verifier.DomainSSOConfig(domain); r != nil {
			return r
		}

		nonIntSSO = domain.SSONonInteractive

		// Parse the SSO URL
		ssoURL, err := util.ParseAbsoluteURL(domain.SSOURL, true, false)
		if err != nil {
			return oauthFailure(nonIntSSO, "failed to parse SSO URL", err)
		}

		// Add the token and its HMAC signature to the SSO URL
		q := ssoURL.Query()
		q.Set("token", token.Value)
		if tokenBytes, err := token.ValueBytes(); err != nil {
			return oauthFailure(false, "failed to parse token value", err)
		} else if secBytes, err := domain.SSOSecretBytes(); err != nil {
			return oauthFailure(false, "failed to parse domain SSO secret", err)
		} else if secBytes == nil {
			return oauthFailure(false, "domain SSO secret not set", nil)
		} else {
			q.Set("hmac", hex.EncodeToString(util.HMACSign(tokenBytes, secBytes)))
		}
		ssoURL.RawQuery = q.Encode()
		authURL = ssoURL.String()

		// Non-SSO auth
	} else {
		// Generate a random base64-encoded nonce to use as the state on the auth URL
		var state string
		if b, err := util.RandomBytes(64); err != nil {
			return oauthFailureInternal(false, fmt.Errorf("AuthOauthInit: RandomBytes() failed: %w", err))
		} else {
			state = base64.URLEncoding.EncodeToString(b)
		}

		// Initiate an authentication session
		sess, err := provider.BeginAuth(state)
		if err != nil {
			return oauthFailureInternal(false, fmt.Errorf("AuthOauthInit: provider.BeginAuth() failed: %w", err))
		}

		// Fetch the URL for authenticating with the provider
		authURL, err = sess.GetAuthURL()
		if err != nil {
			return oauthFailureInternal(false, fmt.Errorf("AuthOauthInit: sess.GetAuthURL() failed: %w", err))
		}

		// Serialise the session for persisting
		sessionData = sess.Marshal()
	}

	// Store the session in the cookie/DB
	authSession, err := svc.TheAuthSessionService.Create(sessionData, host, token.Value)
	if err != nil {
		return oauthFailureInternal(nonIntSSO, fmt.Errorf("AuthOauthInit: failed to create auth session: %w", err))
	}

	// Succeeded: redirect the user to the federated identity provider, setting the state cookie
	return NewCookieResponder(api_general.NewAuthOauthInitTemporaryRedirect().WithLocation(authURL)).
		WithCookie(
			util.CookieNameAuthSession,
			authSession.ID.String(),
			"/",
			util.AuthSessionDuration,
			true,
			// Allow sending it cross-origin, but only via HTTPS as only a secure cookie can use SameSite=None
			util.If(config.ServerConfig.UseHTTPS(), http.SameSiteNoneMode, http.SameSiteLaxMode))
}

// oauthFailure returns either a generic "Unauthorized" responder (in case of interactive authentication), with the
// given message in the details, or a postMessage responder (for non-interactive auth), and logs the passed error.
// The reason it's handled this way is that logging may expose actual (confidential) error details, whereas the response
// is kept generic. If err == nil, a new error is constructed using the message; this use case assumes there are no
// additional details available to be logged.
// Also, wipes out any auth session cookie
func oauthFailure(nonInteractive bool, message string, err error) middleware.Responder {
	if err == nil {
		err = errors.New(message)
	}
	logger.Warningf("%s OAuth failed: %s: %v", util.If(nonInteractive, "Non-interactive", "Interactive"), message, err)
	var r middleware.Responder
	if nonInteractive {
		r = postNonInteractiveLoginResponse(message)
	} else {
		r = api_general.NewAuthOauthInitUnauthorized().
			WithPayload(fmt.Sprintf(
				`<html lang="en">
				<head>
					<title>401 Unauthorized</title>
				</head>
				<body>
					<h1>Unauthorized</h1>
					<p>Federated authentication failed with the error: <strong>%s</strong></p>
				</body>
				</html>`,
				message))
	}

	// Respond wiping the auth session cookie
	return NewCookieResponder(r).WithoutCookie(util.CookieNameAuthSession, "/")
}

// oauthFailureInternal calls oauthFailure for an internal error
func oauthFailureInternal(nonInteractive bool, err error) middleware.Responder {
	return oauthFailure(nonInteractive, "internal error", err)
}

// validateAuthSessionState verifies the session token initially submitted, if any, is matching the one returned with
// the given callback request
func validateAuthSessionState(sess goth.Session, req *http.Request) (string, error) {
	// Fetch the original session's URL
	rawAuthURL, err := sess.GetAuthURL()
	if err != nil {
		return "failed to get auth URL from session", err
	}

	// Parse it
	authURL, err := url.Parse(rawAuthURL)
	if err != nil {
		return "failed to parse auth URL", err
	}

	// If there was a state initially, the value returned with the request must be the same
	if originalState := authURL.Query().Get("state"); originalState != "" {
		if reqState := req.URL.Query().Get("state"); reqState != originalState {
			return "auth session state mismatch", fmt.Errorf("want '%s', got '%s'", originalState, reqState)
		}
	}
	return "", nil
}
