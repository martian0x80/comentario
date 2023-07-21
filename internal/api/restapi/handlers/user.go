package handlers

import (
	"bytes"
	"database/sql"
	"github.com/go-openapi/runtime/middleware"
	"github.com/go-openapi/strfmt"
	"github.com/go-openapi/swag"
	"github.com/google/uuid"
	"gitlab.com/comentario/comentario/internal/api/models"
	"gitlab.com/comentario/comentario/internal/api/restapi/operations/api_general"
	"gitlab.com/comentario/comentario/internal/data"
	"gitlab.com/comentario/comentario/internal/svc"
	"gitlab.com/comentario/comentario/internal/util"
	"io"
	"strings"
)

func UserGet(params api_general.UserGetParams, user *data.User) middleware.Responder {
	// Fetch the user
	u, r := userGet(params.UUID)
	if r != nil {
		return r
	}

	// Fetch user authorisations
	isOwner, isModerator, _, err := svc.TheUserService.GetMaxUserAuthorisations(&u.ID, &user.ID)
	if err != nil {
		return respServiceError(err)
	}

	// Fetch domains the current user has access to, and the corresponding domain users in relation to the user in
	// question
	ds, dus, err := svc.TheDomainService.ListByDomainUser(&u.ID, &user.ID, user.IsSuperuser, true, "", "", data.SortAsc, -1)
	if err != nil {
		return respServiceError(err)
	}

	// Succeeded
	return api_general.NewUserGetOK().
		WithPayload(&api_general.UserGetOKBody{
			User: u.
				// Apply the current user's clearance
				CloneWithClearance(user.IsSuperuser, isOwner, isModerator).
				ToDTO(sql.NullBool{}, sql.NullBool{}, sql.NullBool{}),
			DomainUsers: data.SliceToDTOs[*data.DomainUser, *models.DomainUser](dus),
			Domains:     data.SliceToDTOs[*data.Domain, *models.Domain](ds),
		})
}

func UserList(params api_general.UserListParams, user *data.User) middleware.Responder {
	// Extract domain ID, if any
	var domainID *uuid.UUID
	if params.Domain != nil {
		var err error
		if domainID, err = data.DecodeUUID(*params.Domain); err != nil {
			return respBadRequest(ErrorInvalidUUID.WithDetails(string(*params.Domain)))
		}
	}

	// Fetch pages the user has access to
	us, err := svc.TheUserService.List(
		&user.ID,
		domainID,
		user.IsSuperuser,
		swag.StringValue(params.Filter),
		swag.StringValue(params.SortBy),
		data.SortDirection(swag.BoolValue(params.SortDesc)),
		int(swag.Uint64Value(params.Page)-1))
	if err != nil {
		return respServiceError(err)
	}

	// Succeeded
	return api_general.NewUserListOK().WithPayload(&api_general.UserListOKBody{Users: us})
}

func UserAvatarGet(params api_general.UserAvatarGetParams) middleware.Responder {
	// Parse the UUID
	if id, err := uuid.Parse(string(params.UUID)); err != nil {
		return respBadRequest(ErrorInvalidUUID)

		// Find the user avatar by their ID
	} else if ua, err := svc.TheAvatarService.GetByUserID(&id); err != nil {
		return respServiceError(err)

	} else if ua == nil {
		// No avatar
		return api_general.NewUserAvatarGetNoContent()

	} else {
		// Avatar is present. Fetch the desired size
		avatar := ua.Get(data.UserAvatarSizeFromStr(swag.StringValue(params.Size)))
		return api_general.NewUserAvatarGetOK().WithPayload(io.NopCloser(bytes.NewReader(avatar)))
	}
}

func UserUpdate(params api_general.UserUpdateParams, user *data.User) middleware.Responder {
	// Fetch the user
	u, r := userGet(params.UUID)
	if r != nil {
		return r
	}

	// Only a superuser can update a user
	if r := Verifier.UserIsSuperuser(user); r != nil {
		return r
	}

	// Email, name, password can only be updated for a local user (email and name are mandatory)
	dto := params.Body.User
	email := data.EmailToString(dto.Email)
	name := strings.TrimSpace(dto.Name)
	password := dto.Password
	if u.IsLocal() {
		if !util.IsValidEmail(email) {
			return respBadRequest(ErrorInvalidPropertyValue.WithDetails("email"))
		}
		if name == "" {
			return respBadRequest(ErrorImmutableProperty.WithDetails("name"))
		}
		u.WithEmail(email).WithName(name)

		// Update password only if it's provided
		if password != "" {
			u.WithPassword(password)
		}

	} else {
		// Federated user
		if email != "" {
			return respBadRequest(ErrorImmutableProperty.WithDetails("email"))
		}
		if name != "" {
			return respBadRequest(ErrorImmutableProperty.WithDetails("name"))
		}
		if password != "" {
			return respBadRequest(ErrorImmutableProperty.WithDetails("password"))
		}
	}

	// Update user properties
	u.WithConfirmed(dto.Confirmed).
		WithRemarks(strings.TrimSpace(dto.Remarks)).
		WithSuperuser(dto.IsSuperuser).
		WithWebsiteURL(data.URIToString(dto.WebsiteURL))

	// Persist the user
	if err := svc.TheUserService.Update(u); err != nil {
		return respServiceError(err)
	}

	// Succeeded
	return api_general.NewUserUpdateOK().
		WithPayload(&api_general.UserUpdateOKBody{
			User: u.ToDTO(sql.NullBool{}, sql.NullBool{}, sql.NullBool{}),
		})
}

// userGet parses a string UUID and fetches the corresponding user
func userGet(id strfmt.UUID) (*data.User, middleware.Responder) {
	// Extract user ID
	userID, err := data.DecodeUUID(id)
	if err != nil {
		return nil, respBadRequest(ErrorInvalidUUID.WithDetails(string(id)))
	}

	// Fetch the user
	user, err := svc.TheUserService.FindUserByID(userID)
	if err != nil {
		return nil, respServiceError(err)
	}

	// Succeeded
	return user, nil
}
