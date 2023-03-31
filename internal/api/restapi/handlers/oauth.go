package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/go-openapi/runtime/middleware"
	"github.com/markbates/goth"
	"github.com/pkg/errors"
	"gitlab.com/comentario/comentario/internal/api/models"
	"gitlab.com/comentario/comentario/internal/api/restapi/operations/api_commenter"
	"gitlab.com/comentario/comentario/internal/data"
	"gitlab.com/comentario/comentario/internal/svc"
	"gitlab.com/comentario/comentario/internal/util"
	"net/http"
	"net/url"
	"time"
)

type ssoPayload struct {
	Domain string `json:"domain"`
	Token  string `json:"token"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Link   string `json:"link"`
	Photo  string `json:"photo"`
}

// oauthSessions stores initiated OAuth (federated authentication) sessions
var oauthSessions = &util.SafeStringMap[models.HexID]{}

// commenterTokens maps temporary OAuth token to the related CommenterToken. It's required for those nasty identity
// providers that don't support the state parameter (such as Twitter)
var commenterTokens = &util.SafeStringMap[models.HexID]{}

// OauthInit initiates a federated authentication process
func OauthInit(params api_commenter.OauthInitParams) middleware.Responder {
	var provider goth.Provider

	// Map the provider to a goth provider
	if idp, ok := data.FederatedIdProviders[models.IdentityProviderID(params.Provider)]; !ok {
		return respBadRequest(ErrorIdPUnknown.WithDetails(params.Provider))

	} else {
		// Get the registered provider instance by its name (coming from the path parameter)
		var err error
		provider, err = goth.GetProvider(idp.GothID)
		if err != nil {
			return respBadRequest(ErrorIdPUnconfigured.WithDetails(params.Provider))
		}
	}

	// Verify the provided commenter token
	if _, err := svc.TheUserService.FindCommenterByToken(models.HexID(params.Token)); err != nil && err != svc.ErrNotFound {
		return oauthFailure(err)
	}

	// Initiate an authentication session
	sess, err := provider.BeginAuth(params.Token)
	if err != nil {
		logger.Warningf("OauthInit(): provider.BeginAuth() failed: %v", err)
		return respInternalError(nil)
	}

	// Fetch the redirection URL
	sessURL, err := sess.GetAuthURL()
	if err != nil {
		logger.Warningf("OauthInit(): sess.GetAuthURL() failed: %v", err)
		return respInternalError(nil)
	}

	// Store the session in memory, to verify it later
	sessID, _ := data.RandomHexID()
	oauthSessions.Put(sessID, sess.Marshal())

	// If the session doesn't have the state param, also store the commenter token locally, for subsequent use
	if originalState, err := getSessionState(sess); err != nil {
		logger.Warningf("OauthInit(): failed to extract session state: %v", err)
		return respInternalError(nil)
	} else if originalState == "" {
		commenterTokens.Put(sessID, params.Token)
	}

	// Succeeded: redirect the user to the federated identity provider, setting the state cookie
	return NewCookieResponder(api_commenter.NewOauthInitTemporaryRedirect().WithLocation(sessURL)).
		WithCookie(
			util.CookieNameAuthSession,
			string(sessID),
			"/",
			time.Hour, // One hour must be sufficient to complete authentication
			true,
			http.SameSiteLaxMode)
}

func OauthCallback(params api_commenter.OauthCallbackParams) middleware.Responder {
	var provider goth.Provider

	// Map the provider to a goth provider
	if idp, ok := data.FederatedIdProviders[models.IdentityProviderID(params.Provider)]; !ok {
		return respBadRequest(ErrorIdPUnknown.WithDetails(params.Provider))

	} else {
		// Get the registered provider instance by its name (coming from the path parameter)
		var err error
		provider, err = goth.GetProvider(idp.GothID)
		if err != nil {
			logger.Debugf("Failed to fetch provider '%s': %v", params.Provider, err)
			return oauthFailure(fmt.Errorf("provider not configured: %s", params.Provider))
		}
	}

	// Obtain the auth session ID from the cookie
	var sessID models.HexID
	if cookie, err := params.HTTPRequest.Cookie(util.CookieNameAuthSession); err != nil {
		logger.Debugf("Auth session cookie error: %v", err)
		return oauthFailure(errors.New("auth session cookie missing"))
	} else {
		sessID = models.HexID(cookie.Value)
	}

	// Find and delete the session
	var sess goth.Session
	var err error
	if sessData, ok := oauthSessions.Take(sessID); !ok {
		logger.Debugf("No auth session found with ID=%v", sessID)
		return oauthFailure(errors.New("auth session not found"))

		// Recover the original provider session
	} else if sess, err = provider.UnmarshalSession(sessData); err != nil {
		logger.Debugf("provider.UnmarshalSession() failed: %v", err)
		return oauthFailure(errors.New("auth session unmarshalling"))
	}

	// Validate the session state
	if err := validateAuthSessionState(sess, params.HTTPRequest); err != nil {
		return oauthFailure(err)
	}

	// Obtain the tokens
	reqParams := params.HTTPRequest.URL.Query()
	_, err = sess.Authorize(provider, reqParams)
	if err != nil {
		logger.Debugf("sess.Authorize() failed: %v", err)
		return oauthFailure(errors.New("auth session unauthorised"))
	}

	// Fetch the federated user
	fedUser, err := provider.FetchUser(sess)
	if err != nil {
		logger.Debugf("provider.FetchUser() failed: %v", err)
		return oauthFailure(errors.New("fetching user"))
	}

	// Obtain the commenter token: if it isn't present in the state param (Twitter doesn't support state), try to find
	// it in the token store
	commenterToken := models.HexID(reqParams.Get("state"))
	if commenterToken == "" {
		if t, ok := commenterTokens.Take(sessID); ok {
			commenterToken = models.HexID(t)
		}
	}
	if commenterToken == "" {
		return oauthFailure(errors.New("failed to obtain commenter token"))
	}

	// Validate the returned user
	// -- UserID
	if fedUser.UserID == "" {
		return oauthFailure(errors.New("user ID missing"))
	}
	// -- Email
	if fedUser.Email == "" {
		return oauthFailure(errors.New("user email missing"))
	}
	// -- Name
	if fedUser.Name == "" {
		return oauthFailure(errors.New("user name missing"))
	}

	// Try to find the corresponding commenter by their token
	if _, err := svc.TheUserService.FindCommenterByToken(commenterToken); err != nil && err != svc.ErrNotFound {
		return oauthFailure(err)
	}

	// Now try to find an existing commenter by their email
	var commenterHex models.HexID
	if commenter, err := svc.TheUserService.FindCommenterByIdPEmail(params.Provider, fedUser.Email, false); err == nil {
		// Commenter found
		commenterHex = commenter.HexID

	} else if err != svc.ErrNotFound {
		// Any other error than "not found"
		return oauthFailure(err)
	}

	// No such commenter yet: it's a signup
	if commenterHex == "" {
		// Create a new commenter
		if c, err := svc.TheUserService.CreateCommenter(fedUser.Email, fedUser.Name, "", fedUser.AvatarURL, params.Provider, ""); err != nil {
			return oauthFailure(err)
		} else {
			commenterHex = c.HexID
		}

		// Commenter already exists: it's a login. Update commenter's details
	} else if err := svc.TheUserService.UpdateCommenter(commenterHex, fedUser.Email, fedUser.Name, "", fedUser.AvatarURL, params.Provider); err != nil {
		return oauthFailure(err)
	}

	// Link the commenter to the session token
	if err := svc.TheUserService.UpdateCommenterSession(commenterToken, commenterHex); err != nil {
		return oauthFailure(err)
	}

	// Succeeded: close the parent window, removing the auth session cookie
	return NewCookieResponder(closeParentWindowResponse()).WithoutCookie(util.CookieNameAuthSession, "/")
}

func OauthSsoInit(params api_commenter.OauthSsoInitParams) middleware.Responder {
	domainURL, err := util.ParseAbsoluteURL(params.HTTPRequest.Header.Get("Referer"))
	if err != nil {
		return oauthFailure(err)
	}

	// Try to find the commenter by token
	commenterToken := models.HexID(params.Token)
	if _, err = svc.TheUserService.FindCommenterByToken(commenterToken); err != nil && err != svc.ErrNotFound {
		return oauthFailure(err)
	}

	// Fetch the domain
	domain, err := svc.TheDomainService.FindByHost(models.Host(domainURL.Host))
	if err != nil {
		return respServiceError(err)
	}

	// Make sure the domain allows SSO authentication
	found := false
	for _, id := range domain.Idps {
		if id == models.IdentityProviderIDSso {
			found = true
			break
		}
	}
	if !found {
		return oauthFailure(fmt.Errorf("SSO not configured for %s", domain.Host))
	}

	// Verify the domain's SSO config is complete
	if err := validateDomainSSOConfig(domain); err != nil {
		return oauthFailure(err)
	}

	key, err := hex.DecodeString(domain.SsoSecret)
	if err != nil {
		logger.Errorf("OauthSsoInit: failed to decode SSO secret: %v", err)
		return oauthFailure(err)
	}

	// Create and persist a new SSO token
	token, err := svc.TheDomainService.CreateSSOToken(domain.Host, commenterToken)
	if err != nil {
		return oauthFailure(err)
	}

	tokenBytes, err := hex.DecodeString(string(token))
	if err != nil {
		logger.Errorf("OauthSsoInit: failed to decode SSO token: %v", err)
		return oauthFailure(err)
	}

	// Parse the domain's SSO URL
	ssoURL, err := util.ParseAbsoluteURL(string(domain.SsoURL))
	if err != nil {
		logger.Errorf("OauthSsoInit: failed to parse SSO URL: %v", err)
		return oauthFailure(err)
	}

	// Generate a new HMAC signature hash
	h := hmac.New(sha256.New, key)
	h.Write(tokenBytes)
	signature := hex.EncodeToString(h.Sum(nil))

	// Add the token and the signature to the SSO URL
	q := ssoURL.Query()
	q.Set("token", string(token))
	q.Set("hmac", signature)
	ssoURL.RawQuery = q.Encode()

	// Succeeded: redirect to SSO
	return api_commenter.NewOauthSsoInitTemporaryRedirect().WithLocation(ssoURL.String())
}

func OauthSsoCallback(params api_commenter.OauthSsoCallbackParams) middleware.Responder {
	payloadBytes, err := hex.DecodeString(params.Payload)
	if err != nil {
		return oauthFailure(fmt.Errorf("payload: invalid hex encoding: %s", err.Error()))
	}

	signatureBytes, err := hex.DecodeString(params.Hmac)
	if err != nil {
		return oauthFailure(fmt.Errorf("HMAC signature: invalid hex encoding: %s", err.Error()))
	}

	payload := ssoPayload{}
	err = json.Unmarshal(payloadBytes, &payload)
	if err != nil {
		return oauthFailure(fmt.Errorf("payload: failed to unmarshal: %s", err.Error()))
	}

	// Validate payload fields
	if payload.Token == "" {
		return oauthFailure(errors.New("token is missing in the payload"))
	}
	if payload.Email == "" {
		return oauthFailure(errors.New("email is missing in the payload"))
	}
	if payload.Name == "" {
		return oauthFailure(errors.New("name is missing in the payload"))
	}

	// Fetch domain/commenter token for the token, removing the token
	domainName, commenterToken, err := svc.TheDomainService.TakeSSOToken(models.HexID(payload.Token))
	if err != nil {
		return oauthFailure(err)
	}

	// Fetch the domain
	domain, err := svc.TheDomainService.FindByHost(domainName)
	if err != nil {
		return oauthFailure(err)
	}

	// Verify the domain's SSO config is complete
	if err := validateDomainSSOConfig(domain); err != nil {
		return oauthFailure(err)
	}

	key, err := hex.DecodeString(domain.SsoSecret)
	if err != nil {
		logger.Errorf("cannot decode SSO secret as hex: %v", err)
		return oauthFailure(err)
	}

	h := hmac.New(sha256.New, key)
	h.Write(payloadBytes)
	expectedSignatureBytes := h.Sum(nil)
	if !hmac.Equal(expectedSignatureBytes, signatureBytes) {
		return oauthFailure(fmt.Errorf("HMAC signature verification failed"))
	}

	// Try to find the corresponding commenter by their token
	if _, err := svc.TheUserService.FindCommenterByToken(commenterToken); err != nil && err != svc.ErrNotFound {
		return oauthFailure(err)
	}

	// Now try to find an existing commenter by their email
	var commenterHex models.HexID
	idp := "sso:" + string(domain.Host)
	if commenter, err := svc.TheUserService.FindCommenterByIdPEmail(idp, payload.Email, false); err == nil {
		// Commenter found
		commenterHex = commenter.HexID

	} else if err != svc.ErrNotFound {
		// Any other error than "not found"
		return oauthFailure(err)
	}

	// No such commenter yet: it's a signup
	if commenterHex == "" {
		// Create a new commenter
		if c, err := svc.TheUserService.CreateCommenter(payload.Email, payload.Name, payload.Link, payload.Photo, idp, ""); err != nil {
			return oauthFailure(err)
		} else {
			commenterHex = c.HexID
		}

		// Commenter already exists: it's a login. Update commenter's details
	} else if err := svc.TheUserService.UpdateCommenter(commenterHex, payload.Email, payload.Name, payload.Link, payload.Photo, idp); err != nil {
		return oauthFailure(err)
	}

	// Link the commenter to the session token
	if err := svc.TheUserService.UpdateCommenterSession(commenterToken, commenterHex); err != nil {
		return oauthFailure(err)
	}

	// Succeeded: close the parent window
	return closeParentWindowResponse()
}

// getSessionState extracts the state parameter from the given session's URL
func getSessionState(sess goth.Session) (string, error) {
	// Fetch the original session's URL
	rawAuthURL, err := sess.GetAuthURL()
	if err != nil {
		return "", err
	}

	// Parse it
	authURL, err := url.Parse(rawAuthURL)
	if err != nil {
		return "", err
	}

	// Extract the state param
	return authURL.Query().Get("state"), nil
}

// oauthFailure returns a generic "Unauthorized" responder, with the error message in the details. Also wipes out any
// auth session cookie
func oauthFailure(err error) middleware.Responder {
	return NewCookieResponder(
		api_commenter.NewOauthInitUnauthorized().
			WithPayload(fmt.Sprintf(
				`<html lang="en">
				<head>
					<title>401 Unauthorized</title>
				</head>
				<body>
					<h1>Unauthorized</h1>
					<p>OAuth authentication failed with the error: %s</p>
				</body>
				</html>`,
				err.Error()))).
		WithoutCookie(util.CookieNameAuthSession, "/")
}

// validateAuthSessionState verifies the session token initially submitted, if any, is matching the one returned with
// the given callback request
func validateAuthSessionState(sess goth.Session, req *http.Request) error {
	// Extract the original session state
	originalState, err := getSessionState(sess)
	if err != nil {
		return err
	}

	// If there was a state initially, the value returned with the request must be the same
	if originalState != "" {
		if reqState := req.URL.Query().Get("state"); reqState != originalState {
			logger.Debugf("Auth session state mismatch: want '%s', got '%s'", originalState, reqState)
			return errors.New("auth session state mismatch")
		}
	}
	return nil
}

// validateDomainSSOConfig verifies the SSO configuration of the domain is valid
func validateDomainSSOConfig(domain *models.Domain) error {
	if domain.SsoSecret == "" {
		return errors.New("domain SSO secret is not configured")
	}
	if domain.SsoURL == "" {
		return errors.New("domain SSO URL is not configured")
	}
	return nil
}
