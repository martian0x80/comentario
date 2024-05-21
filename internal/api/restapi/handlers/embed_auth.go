package handlers

import (
	"errors"
	"github.com/go-openapi/runtime/middleware"
	"github.com/go-openapi/swag"
	"github.com/google/uuid"
	"gitlab.com/comentario/comentario/internal/api/restapi/operations/api_embed"
	"gitlab.com/comentario/comentario/internal/data"
	"gitlab.com/comentario/comentario/internal/svc"
	"gitlab.com/comentario/comentario/internal/util"
	"time"
)

func EmbedAuthLogin(params api_embed.EmbedAuthLoginParams) middleware.Responder {
	// Log the user in
	user, us, r := loginLocalUser(
		data.EmailPtrToString(params.Body.Email),
		swag.StringValue(params.Body.Password),
		string(params.Body.Host),
		params.HTTPRequest)
	if r != nil {
		return r
	}

	// Find the domain user, creating one if necessary
	_, du, err := svc.TheDomainService.FindDomainUserByHost(string(params.Body.Host), &user.ID, true)
	if err != nil {
		return respServiceError(err)
	}

	// Succeeded
	return api_embed.NewEmbedAuthLoginOK().WithPayload(&api_embed.EmbedAuthLoginOKBody{
		SessionToken: us.EncodeIDs(),
		Principal:    user.ToPrincipal(du),
	})
}

func EmbedAuthLoginTokenNew(params api_embed.EmbedAuthLoginTokenNewParams) middleware.Responder {
	var userID *uuid.UUID

	// Try to authenticate the user
	if u, _, err := GetUserSessionBySessionHeader(params.HTTPRequest); errors.Is(err, ErrSessionHeaderMissing) {
		// No auth header: an anonymous token is requested
	} else if err != nil {
		// Any error other than "auth header missing"
		return respUnauthorized(ErrorUnauthenticated)
	} else {
		// Successfully authenticated
		userID = &u.ID
	}

	// Create a new login token
	t, err := authCreateLoginToken(userID)
	if err != nil {
		return respServiceError(err)
	}

	// Succeeded
	return api_embed.NewEmbedAuthLoginTokenNewOK().WithPayload(&api_embed.EmbedAuthLoginTokenNewOKBody{Token: t.String()})
}

func EmbedAuthLoginTokenRedeem(params api_embed.EmbedAuthLoginTokenRedeemParams, user *data.User) middleware.Responder {
	// Verify the user can log in and create a new session
	host := string(params.Body.Host)
	us, r := loginUser(user, host, params.HTTPRequest)
	if r != nil {
		return r
	}

	// Find the domain user, creating one if necessary
	_, du, err := svc.TheDomainService.FindDomainUserByHost(host, &user.ID, true)
	if err != nil {
		return respServiceError(err)
	}

	// Succeeded
	return api_embed.NewEmbedAuthLoginOK().WithPayload(&api_embed.EmbedAuthLoginOKBody{
		SessionToken: us.EncodeIDs(),
		Principal:    user.ToPrincipal(du),
	})
}

func EmbedAuthLogout(params api_embed.EmbedAuthLogoutParams, _ *data.User) middleware.Responder {
	// Extract session from the session header
	_, sessionID, err := ExtractUserSessionIDs(params.HTTPRequest.Header.Get(util.HeaderUserSession))
	if err != nil {
		return respUnauthorized(nil)
	}

	// Delete the session token, ignoring any error
	_ = svc.TheUserService.DeleteUserSession(sessionID)

	// Regardless of whether the above was successful, return a success response
	return api_embed.NewEmbedAuthLogoutNoContent()
}

func EmbedAuthSignup(params api_embed.EmbedAuthSignupParams) middleware.Responder {
	// Extract domain ID
	domainID, r := parseUUID(params.Body.DomainID)
	if r != nil {
		return r
	}

	// Verify new users are allowed
	if r := Verifier.LocalSignupEnabled(domainID); r != nil {
		return r
	}

	// Verify no such email is registered yet
	email := data.EmailPtrToString(params.Body.Email)
	if r := Verifier.UserCanSignupWithEmail(email); r != nil {
		return r
	}

	// Create a new user
	user := data.NewUser(email, data.TrimmedString(params.Body.Name)).
		WithPassword(data.PasswordPtrToString(params.Body.Password)).
		WithSignup(params.HTTPRequest, data.URIPtrToString(params.Body.URL)).
		WithWebsiteURL(string(params.Body.WebsiteURL))

	// If no operational mailer is configured, or confirmation is switched off in the config, mark the user confirmed
	// right away
	if !util.TheMailer.Operational() ||
		!svc.TheDynConfigService.GetBool(data.ConfigKeyAuthSignupConfirmCommenter) {
		user.WithConfirmed(true)
	}

	// Sign-up the new user
	if r := signupUser(user); r != nil {
		return r
	}

	// Succeeded
	return api_embed.NewEmbedAuthSignupOK().WithPayload(&api_embed.EmbedAuthSignupOKBody{IsConfirmed: user.Confirmed})
}

func EmbedAuthCurUserGet(params api_embed.EmbedAuthCurUserGetParams) middleware.Responder {
	// Fetch the session header value
	if s := params.HTTPRequest.Header.Get(util.HeaderUserSession); s != "" {
		// Try to fetch the user
		if user, userSession, err := FetchUserBySessionHeader(s); err == nil {
			// User is authenticated. Try to find the corresponding domain user by the host stored in the session
			if _, domainUser, err := svc.TheDomainService.FindDomainUserByHost(userSession.Host, &user.ID, true); err == nil {
				// Succeeded: user is authenticated
				return api_embed.NewEmbedAuthCurUserGetOK().WithPayload(user.ToPrincipal(domainUser))
			}
		}
	}

	// Not logged in, bad header value, the user doesn't exist, or domain was deleted
	return api_embed.NewEmbedAuthCurUserGetNoContent()
}

func EmbedAuthCurUserUpdate(params api_embed.EmbedAuthCurUserUpdateParams, user *data.User) middleware.Responder {
	// Parse domain ID
	domainID, r := parseUUIDPtr(params.Body.DomainID)
	if r != nil {
		return r
	} else if domainID == nil {
		// There's no domain ID
		return respBadRequest(ErrorInvalidPropertyValue.WithDetails("domainId"))
	}

	// Fetch the domain user
	_, du, err := svc.TheDomainService.FindDomainUserByID(domainID, &user.ID)
	if err != nil {
		return respServiceError(err)
	}

	// If there's no user yet
	if du == nil {
		// Add a new domain user record
		du = &data.DomainUser{
			DomainID:            *domainID,
			UserID:              user.ID,
			IsCommenter:         true,
			NotifyReplies:       params.Body.NotifyReplies,
			NotifyModerator:     params.Body.NotifyModerator,
			NotifyCommentStatus: params.Body.NotifyCommentStatus,
			CreatedTime:         time.Now().UTC(),
		}
		err = svc.TheDomainService.UserAdd(du)

		// Domain user exists. Update it, if the settings change
	} else if du.NotifyReplies != params.Body.NotifyReplies || du.NotifyModerator != params.Body.NotifyModerator || du.NotifyCommentStatus != params.Body.NotifyCommentStatus {
		du.NotifyReplies = params.Body.NotifyReplies
		du.NotifyModerator = params.Body.NotifyModerator
		du.NotifyCommentStatus = params.Body.NotifyCommentStatus
		err = svc.TheDomainService.UserModify(du)
	}

	// Error check
	if err != nil {
		return respServiceError(err)
	}

	// Succeeded
	return api_embed.NewEmbedAuthCurUserUpdateNoContent()
}
