package svc

import (
	"database/sql"
	"errors"
	"fmt"
	"github.com/doug-martin/goqu/v9"
	"github.com/google/uuid"
	"github.com/op/go-logging"
	"gitlab.com/comentario/comentario/internal/config"
	"gitlab.com/comentario/comentario/internal/data"
	"gitlab.com/comentario/comentario/internal/intf"
	"gitlab.com/comentario/comentario/internal/util"
	"strings"
	"time"
)

// TheUserService is a global UserService implementation
var TheUserService UserService = &userService{}

// UserService is a service interface for dealing with users
type UserService interface {
	// ConfirmUser confirms the user's email by their ID
	ConfirmUser(id *uuid.UUID) error
	// CountUsers returns a number of registered users.
	//   - inclSuper: if false, skips superusers
	//   - inclNonSuper: if false, skips non-superusers
	//   - inclSystem: if false, skips system users
	//   - inclLocal: if false, skips local users
	//   - inclFederated: if false, skips federated users
	CountUsers(inclSuper, inclNonSuper, inclSystem, inclLocal, inclFederated bool) (int, error)
	// Create persists a new user
	Create(u *data.User) error
	// CreateUserSession persists a new user session
	CreateUserSession(s *data.UserSession) error
	// DeleteUserByID removes a user by their ID.
	//   - delComments: if true, deletes all comments made by the user
	//   - purgeComments: if true, permanently removes all comments and replies
	// Returns number of deleted comments.
	DeleteUserByID(id *uuid.UUID, delComments, purgeComments bool) (int64, error)
	// DeleteUserSession removes a user session from the database
	DeleteUserSession(id *uuid.UUID) error
	// EnsureSuperuser ensures that the user with the given ID or email is a superuser
	EnsureSuperuser(idOrEmail string) error
	// ExpireUserSessions expires all sessions of the given user
	ExpireUserSessions(userID *uuid.UUID) error
	// FindDomainUserByID fetches and returns a User and DomainUser by domain and user IDs. If the user exists, but
	// there's no record for the user on that domain, returns nil for DomainUser
	FindDomainUserByID(userID, domainID *uuid.UUID) (*data.User, *data.DomainUser, error)
	// FindUserByEmail finds and returns a user by the given email
	FindUserByEmail(email string) (*data.User, error)
	// FindUserByFederatedID finds and returns a federated user by the given federated IdP and user ID. If idp is empty,
	// it means searching for an SSO user
	FindUserByFederatedID(idp, id string) (*data.User, error)
	// FindUserByID finds and returns a user by the given user ID
	FindUserByID(id *uuid.UUID) (*data.User, error)
	// FindUserBySession finds and returns a user and the related session by the given user and session ID
	FindUserBySession(userID, sessionID *uuid.UUID) (*data.User, *data.UserSession, error)
	// List fetches and returns a list of users.
	//   - filter is an optional substring to filter the result by.
	//   - sortBy is an optional property name to sort the result by. If empty, sorts by the path.
	//   - dir is the sort direction.
	//   - pageIndex is the page index, if negative, no pagination is applied.
	List(filter, sortBy string, dir data.SortDirection, pageIndex int) ([]*data.User, error)
	// ListByDomain fetches and returns a list of domain users for the domain with the given ID, and the corresponding
	// users as a UUID-indexed map. Minimum access level: domain owner
	//   - superuser indicates whether the current user is a superuser
	//   - filter is an optional substring to filter the result by.
	//   - sortBy is an optional property name to sort the result by. If empty, sorts by the host.
	//   - dir is the sort direction.
	//   - pageIndex is the page index, if negative, no pagination is applied.
	ListByDomain(domainID *uuid.UUID, superuser bool, filter, sortBy string, dir data.SortDirection, pageIndex int) (map[uuid.UUID]*data.User, []*data.DomainUser, error)
	// ListDomainModerators fetches and returns a list of moderator users for the domain with the given ID. If
	// enabledNotifyOnly is true, only includes users who have moderator notifications enabled for that domain
	ListDomainModerators(domainID *uuid.UUID, enabledNotifyOnly bool) ([]*data.User, error)
	// ListUserSessions returns all sessions of a user, sorted in reverse chronological order
	//   - userID is ID of the user to fetch sessions for
	//   - pageIndex is the page index, if negative, no pagination is applied.
	ListUserSessions(userID *uuid.UUID, pageIndex int) ([]*data.UserSession, error)
	// Update updates the given user's data in the database
	Update(user *data.User) error
	// UpdateBanned updates the given user's banned status in the database
	UpdateBanned(curUserID, userID *uuid.UUID, banned bool) error
	// UpdateLoginLocked updates the given user's last login and lockout fields in the database
	UpdateLoginLocked(user *data.User) error
}

//----------------------------------------------------------------------------------------------------------------------

// userService is a blueprint UserService implementation
type userService struct{}

func (svc *userService) ConfirmUser(id *uuid.UUID) error {
	logger.Debugf("userService.ConfirmUser(%s)", id)

	// User cannot be anonymous
	if *id == data.AnonymousUser.ID {
		return ErrNotFound
	}

	// Update the owner's record
	if err := db.ExecuteOne(
		db.Dialect().
			Update("cm_users").
			Set(goqu.Record{"confirmed": true, "ts_confirmed": time.Now().UTC()}).
			Where(goqu.Ex{"id": id}),
	); err != nil {
		logger.Errorf("userService.ConfirmUser: ExecuteOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *userService) CountUsers(inclSuper, inclNonSuper, inclSystem, inclLocal, inclFederated bool) (int, error) {
	logger.Debug("userService.CountUsers(%v, %v, %v, %v, %v)", inclSuper, inclNonSuper, inclSystem, inclLocal, inclFederated)

	// Prepare the query
	q := db.Dialect().
		From("cm_users").
		Select(goqu.COUNT("*"))
	if !inclSuper {
		q = q.Where(goqu.Ex{"is_superuser": false})
	}
	if !inclNonSuper {
		q = q.Where(goqu.Ex{"is_superuser": true})
	}
	if !inclSystem {
		q = q.Where(goqu.Ex{"system_account": false})
	}
	if !inclLocal {
		q = q.Where(goqu.Or(goqu.C("federated_idp").IsNotNull(), goqu.C("federated_sso").IsTrue()))
	}
	if !inclFederated {
		q = q.Where(goqu.C("federated_idp").IsNull(), goqu.C("federated_sso").IsFalse())
	}

	// Query the count
	var i int
	if err := db.SelectRow(q).Scan(&i); err != nil {
		return 0, translateDBErrors(err)
	}

	// Succeeded
	return i, nil
}

func (svc *userService) Create(u *data.User) error {
	logger.Debugf("userService.Create(%#v)", u)

	// Insert a new record
	if err := db.ExecuteOne(
		db.Dialect().
			Insert("cm_users").
			Rows(goqu.Record{
				"id":                    u.ID,
				"email":                 u.Email,
				"name":                  u.Name,
				"lang_id":               u.LangID,
				"password_hash":         u.PasswordHash,
				"system_account":        u.SystemAccount,
				"is_superuser":          u.IsSuperuser,
				"confirmed":             u.Confirmed,
				"ts_confirmed":          u.ConfirmedTime,
				"ts_created":            u.CreatedTime,
				"user_created":          u.UserCreated,
				"signup_ip":             config.MaskIP(u.SignupIP),
				"signup_country":        u.SignupCountry,
				"signup_host":           u.SignupHost,
				"banned":                u.Banned,
				"ts_banned":             u.BannedTime,
				"user_banned":           u.UserBanned,
				"remarks":               u.Remarks,
				"federated_idp":         u.FederatedIdPNullStr(),
				"federated_sso":         u.FederatedSSO,
				"federated_id":          u.FederatedID,
				"website_url":           u.WebsiteURL,
				"secret_token":          u.SecretToken,
				"ts_password_change":    u.PasswordChangeTime,
				"ts_last_login":         u.LastLoginTime,
				"ts_last_failed_login":  u.LastFailedLoginTime,
				"failed_login_attempts": u.FailedLoginAttempts,
				"is_locked":             u.IsLocked,
				"ts_locked":             u.LockedTime,
			}),
	); err != nil {
		logger.Errorf("userService.Create: ExecuteOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *userService) CreateUserSession(s *data.UserSession) error {
	logger.Debugf("userService.CreateUserSession(%#v)", s)

	// Insert a new record
	if err := db.ExecuteOne(
		db.Dialect().
			Insert("cm_user_sessions").
			Rows(goqu.Record{
				"id":                 s.ID,
				"user_id":            s.UserID,
				"ts_created":         s.CreatedTime,
				"ts_expires":         s.ExpiresTime,
				"host":               s.Host,
				"proto":              s.Proto,
				"ip":                 config.MaskIP(s.IP),
				"country":            s.Country,
				"ua_browser_name":    s.BrowserName,
				"ua_browser_version": s.BrowserVersion,
				"ua_os_name":         s.OSName,
				"ua_os_version":      s.OSVersion,
				"ua_device":          s.Device,
			}),
	); err != nil {
		logger.Errorf("userService.CreateUserSession: ExecuteOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *userService) DeleteUserByID(id *uuid.UUID, delComments, purgeComments bool) (int64, error) {
	logger.Debugf("userService.DeleteUserByID(%s, %v, %v)", id, delComments, purgeComments)

	// User cannot be anonymous
	if *id == data.AnonymousUser.ID {
		return 0, ErrNotFound
	}

	// If comments are to be deleted
	cntDel := int64(0)
	if delComments {
		var err error
		// If comments need to be purged
		if purgeComments {
			// Purge all comments created by the user
			if cntDel, err = TheCommentService.DeleteByUser(id); err != nil {
				logger.Errorf("userService.DeleteUserByID: DeleteByUser() failed: %v", err)
				return 0, err
			}

			// Mark all comments created by the user as deleted
		} else if cntDel, err = TheCommentService.MarkDeletedByUser(id, id); err != nil {
			logger.Errorf("userService.DeleteUserByID: MarkDeletedByUser() failed: %v", err)
			return 0, err
		}

	}

	// Delete the user
	if err := db.ExecuteOne(db.Dialect().Delete("cm_users").Where(goqu.Ex{"id": id})); err != nil {
		logger.Errorf("userService.DeleteUserByID: ExecuteOne() failed: %v", err)
		return 0, translateDBErrors(err)
	}

	// Succeeded
	return cntDel, nil
}

func (svc *userService) DeleteUserSession(id *uuid.UUID) error {
	logger.Debugf("userService.DeleteUserSession(%s)", id)

	// Delete the record
	if err := db.ExecuteOne(db.Dialect().Delete("cm_user_sessions").Where(goqu.Ex{"id": id})); err != nil {
		logger.Errorf("userService.DeleteUserSession: ExecuteOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *userService) EnsureSuperuser(idOrEmail string) error {
	logger.Debugf("userService.EnsureSuperuser(%q)", idOrEmail)

	// Try to parse the input as a UUID
	var where goqu.Ex
	if id, err := uuid.Parse(idOrEmail); err == nil {
		// It's an ID indeed
		where = goqu.Ex{"id": id}

		// Not an ID, perhaps an email?
	} else if !util.IsValidEmail(idOrEmail) {
		return fmt.Errorf("%q is neither a UUID nor a valid email address", idOrEmail)

	} else {
		// It's an email
		where = goqu.Ex{"email": idOrEmail}
	}

	// Update the user
	if err := db.ExecuteOne(db.Dialect().Update("cm_users").Set(goqu.Record{"is_superuser": true}).Where(where)); err != nil {
		logger.Errorf("userService.EnsureSuperuser: ExecuteOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *userService) ExpireUserSessions(userID *uuid.UUID) error {
	logger.Debugf("userService.ExpireUserSessions(%s)", userID)

	// Update all user's sessions
	if err := db.Execute(
		db.Dialect().
			Update("cm_user_sessions").
			Set(goqu.Record{"ts_expires": time.Now().UTC()}).
			Where(goqu.Ex{"user_id": userID}),
	); err != nil {
		logger.Errorf("userService.ExpireUserSessions: Execute() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *userService) FindDomainUserByID(userID, domainID *uuid.UUID) (*data.User, *data.DomainUser, error) {
	logger.Debugf("userService.FindDomainUserByID(%s, %s)", userID, domainID)

	// User cannot be anonymous
	if *userID == data.AnonymousUser.ID {
		return nil, nil, ErrNotFound
	}

	// Query the database
	q := db.Dialect().
		From(goqu.T("cm_users").As("u")).
		Select(
			append(
				// User and avatar fields
				svc.userColumns(),
				// DomainUser fields
				"du.domain_id", "du.user_id", "du.is_owner", "du.is_moderator", "du.is_commenter", "du.notify_replies",
				"du.notify_moderator", "du.notify_comment_status", "du.ts_created")...).
		LeftJoin(
			goqu.T("cm_domains_users").As("du"),
			goqu.On(goqu.Ex{"du.user_id": goqu.I("u.id"), "du.domain_id": domainID})).
		LeftJoin(goqu.T("cm_user_avatars").As("a"), goqu.On(goqu.Ex{"a.user_id": goqu.I("u.id")})).
		Where(goqu.Ex{"u.id": userID})
	if u, du, err := svc.fetchUserDomainUser(db.SelectRow(q)); err != nil {
		return nil, nil, err
	} else {
		// Succeeded
		return u, du, nil
	}
}

func (svc *userService) FindUserByEmail(email string) (*data.User, error) {
	logger.Debugf("userService.FindUserByEmail(%q)", email)

	// Prepare the query
	q := db.Dialect().
		From(goqu.T("cm_users").As("u")).
		Select(svc.userColumns()...).
		Where(goqu.Ex{"u.email": email}).
		// Outer-join user avatars
		LeftJoin(goqu.T("cm_user_avatars").As("a"), goqu.On(goqu.Ex{"a.user_id": goqu.I("u.id")}))

	// Query the database
	if u, _, err := svc.fetchUserSession(db.SelectRow(q), false); err != nil {
		return nil, translateDBErrors(err)
	} else {
		return u, nil
	}
}

func (svc *userService) FindUserByFederatedID(idp, id string) (*data.User, error) {
	logger.Debugf("userService.FindUserByFederatedID(%q, %q)", idp, id)

	// Prepare the query
	q := db.Dialect().
		From(goqu.T("cm_users").As("u")).
		Select(svc.userColumns()...).
		Where(goqu.Ex{"u.federated_id": id}).
		// Outer-join user avatars
		LeftJoin(goqu.T("cm_user_avatars").As("a"), goqu.On(goqu.Ex{"a.user_id": goqu.I("u.id")}))

	// Restrict by IdP
	if idp == "" {
		q = q.Where(goqu.Ex{"u.federated_idp": nil, "u.federated_sso": true})
	} else {
		q = q.Where(goqu.Ex{"u.federated_idp": idp, "u.federated_sso": false})
	}

	// Fetch the user
	if u, _, err := svc.fetchUserSession(db.SelectRow(q), false); err != nil {
		return nil, translateDBErrors(err)
	} else {
		return u, nil
	}
}

func (svc *userService) FindUserByID(id *uuid.UUID) (*data.User, error) {
	logger.Debugf("userService.FindUserByID(%s)", id)

	// If the user is anonymous, no need to query
	if *id == data.AnonymousUser.ID {
		return data.AnonymousUser, nil
	}

	// Prepare the query
	q := db.Dialect().
		From(goqu.T("cm_users").As("u")).
		Select(svc.userColumns()...).
		Where(goqu.Ex{"u.id": id}).
		// Outer-join user avatars
		LeftJoin(goqu.T("cm_user_avatars").As("a"), goqu.On(goqu.Ex{"a.user_id": goqu.I("u.id")}))

	// Fetch the user
	if u, _, err := svc.fetchUserSession(db.SelectRow(q), false); err != nil {
		return nil, translateDBErrors(err)
	} else {
		return u, nil
	}
}

func (svc *userService) FindUserBySession(userID, sessionID *uuid.UUID) (*data.User, *data.UserSession, error) {
	logger.Debugf("userService.FindUserBySession(%s, %s)", userID, sessionID)

	// User cannot be anonymous
	if *userID == data.AnonymousUser.ID {
		return nil, nil, ErrNotFound
	}

	// Prepare the query
	now := time.Now().UTC()
	q := db.Dialect().
		From(goqu.T("cm_users").As("u")).
		Select(
			append(
				// User and avatar fields
				svc.userColumns(),
				// User session fields
				"s.id", "s.user_id", "s.ts_created", "s.ts_expires", "s.host", "s.proto", "s.ip", "s.country",
				"s.ua_browser_name", "s.ua_browser_version", "s.ua_os_name", "s.ua_os_version", "s.ua_device")...).
		// Join user sessions
		Join(goqu.T("cm_user_sessions").As("s"), goqu.On(goqu.Ex{"s.user_id": goqu.I("u.id")})).
		// Outer-join user avatars
		LeftJoin(goqu.T("cm_user_avatars").As("a"), goqu.On(goqu.Ex{"a.user_id": goqu.I("u.id")})).
		Where(goqu.And(
			goqu.I("u.id").Eq(userID),
			goqu.I("s.id").Eq(sessionID),
			goqu.I("s.ts_created").Lt(now),
			goqu.I("s.ts_expires").Gte(now)))

	// Fetch the user and their session
	if u, us, err := svc.fetchUserSession(db.SelectRow(q), true); err != nil {
		return nil, nil, translateDBErrors(err)
	} else {
		return u, us, nil
	}
}

func (svc *userService) List(filter, sortBy string, dir data.SortDirection, pageIndex int) ([]*data.User, error) {
	logger.Debugf("userService.List('%s', '%s', %s, %d)", filter, sortBy, dir, pageIndex)

	// Prepare a statement
	q := db.Dialect().
		From(goqu.T("cm_users").As("u")).
		Select(svc.userColumns()...).
		// Outer-join user avatars
		LeftJoin(goqu.T("cm_user_avatars").As("a"), goqu.On(goqu.Ex{"a.user_id": goqu.I("u.id")}))

	// Add substring filter
	if filter != "" {
		pattern := "%" + strings.ToLower(filter) + "%"
		q = q.Where(goqu.Or(
			goqu.L(`lower("u"."email")`).Like(pattern),
			goqu.L(`lower("u"."name")`).Like(pattern),
			goqu.L(`lower("u"."remarks")`).Like(pattern),
			goqu.L(`lower("u"."website_url")`).Like(pattern),
		))
	}

	// Configure sorting
	sortIdent := "u.email"
	switch sortBy {
	case "name":
		sortIdent = "u.name"
	case "created":
		sortIdent = "u.ts_created"
	case "federatedIdP":
		sortIdent = "u.federated_idp"
	}
	q = q.Order(
		dir.ToOrderedExpression(sortIdent),
		goqu.I("u.id").Asc(), // Always add ID for stable ordering
	)

	// Paginate if required
	if pageIndex >= 0 {
		q = q.Limit(util.ResultPageSize).Offset(uint(pageIndex) * util.ResultPageSize)
	}

	// Query users
	rows, err := db.Select(q)
	if err != nil {
		logger.Errorf("userService.List: Select() failed: %v", err)
		return nil, translateDBErrors(err)
	}
	defer rows.Close()

	// Fetch the users
	var us []*data.User
	for rows.Next() {
		if u, _, err := svc.fetchUserSession(rows, false); err != nil {
			logger.Errorf("userService.List: Scan() failed: %v", err)
			return nil, translateDBErrors(err)
		} else {
			us = append(us, u)
		}
	}

	// Verify Next() didn't error
	if err := rows.Err(); err != nil {
		return nil, translateDBErrors(err)
	}

	// Succeeded
	return us, nil
}

func (svc *userService) ListByDomain(domainID *uuid.UUID, superuser bool, filter, sortBy string, dir data.SortDirection, pageIndex int) (map[uuid.UUID]*data.User, []*data.DomainUser, error) {
	logger.Debugf("userService.ListByDomain(%s, %v, '%s', '%s', %s, %d)", domainID, superuser, filter, sortBy, dir, pageIndex)

	// Prepare a query
	q := db.Dialect().
		From(goqu.T("cm_domains_users").As("du")).
		Select(
			append(
				// User and avatar fields
				svc.userColumns(),
				// DomainUser fields
				"du.domain_id", "du.user_id", "du.is_owner", "du.is_moderator", "du.is_commenter", "du.notify_replies",
				"du.notify_moderator", "du.notify_comment_status", "du.ts_created")...).
		Join(goqu.T("cm_users").As("u"), goqu.On(goqu.Ex{"u.id": goqu.I("du.user_id")})).
		LeftJoin(goqu.T("cm_user_avatars").As("a"), goqu.On(goqu.Ex{"a.user_id": goqu.I("du.user_id")})).
		Where(goqu.Ex{"du.domain_id": domainID})

	// Add substring filter
	if filter != "" {
		pattern := "%" + strings.ToLower(filter) + "%"
		q = q.Where(goqu.Or(
			goqu.L(`lower("u"."email")`).Like(pattern),
			goqu.L(`lower("u"."name")`).Like(pattern),
			goqu.L(`lower("u"."remarks")`).Like(pattern),
		))
	}

	// Configure sorting
	sortIdent := "u.email"
	switch sortBy {
	case "name":
		sortIdent = "u.name"
	case "created":
		sortIdent = "du.ts_created"
	}
	q = q.Order(
		dir.ToOrderedExpression(sortIdent),
		goqu.I("du.user_id").Asc(), // Always add ID for stable ordering
	)

	// Paginate if required
	if pageIndex >= 0 {
		q = q.Limit(util.ResultPageSize).Offset(uint(pageIndex) * util.ResultPageSize)
	}

	// Query domains
	rows, err := db.Select(q)
	if err != nil {
		logger.Errorf("userService.ListByDomainUser: Select() failed: %v", err)
		return nil, nil, translateDBErrors(err)
	}
	defer rows.Close()

	// Fetch the users
	var dus []*data.DomainUser
	um := map[uuid.UUID]*data.User{}
	for rows.Next() {
		// Fetch the user and the domain user
		u, du, err := svc.fetchUserDomainUser(rows)
		if err != nil {
			return nil, nil, err
		}

		// Accumulate domain users
		dus = append(dus, du)

		// Add the user to the map, if it doesn't already exist, with proper clearance
		if _, ok := um[u.ID]; !ok {
			um[u.ID] = u.CloneWithClearance(superuser, true, true)
		}
	}

	// Verify Next() didn't error
	if err := rows.Err(); err != nil {
		return nil, nil, translateDBErrors(err)
	}

	// Succeeded
	return um, dus, nil
}

func (svc *userService) ListDomainModerators(domainID *uuid.UUID, enabledNotifyOnly bool) ([]*data.User, error) {
	logger.Debugf("userService.ListDomainModerators(%s, %v)", domainID, enabledNotifyOnly)

	// Prepare a query
	q := db.Dialect().
		From(goqu.T("cm_domains_users").As("du")).
		Select(svc.userColumns()...).
		// Join users
		Join(goqu.T("cm_users").As("u"), goqu.On(goqu.Ex{"u.id": goqu.I("du.user_id")})).
		// Outer-join user avatars
		LeftJoin(goqu.T("cm_user_avatars").As("a"), goqu.On(goqu.Ex{"a.user_id": goqu.I("u.id")})).
		Where(goqu.And(
			goqu.I("du.domain_id").Eq(domainID),
			goqu.ExOr{"du.is_owner": true, "du.is_moderator": true}))
	if enabledNotifyOnly {
		q = q.Where(goqu.Ex{"du.notify_moderator": true})
	}

	// Query domain's moderator users
	rows, err := db.Select(q)
	if err != nil {
		logger.Errorf("userService.ListDomainModerators: Select() failed: %v", err)
		return nil, translateDBErrors(err)
	}
	defer rows.Close()

	// Fetch the users
	var res []*data.User
	for rows.Next() {
		if u, _, err := svc.fetchUserSession(rows, false); err != nil {
			return nil, translateDBErrors(err)
		} else {
			res = append(res, u)
		}
	}

	// Verify Next() didn't error
	if err := rows.Err(); err != nil {
		logger.Errorf("userService.ListDomainModerators: rows.Next() failed: %v", err)
		return nil, err
	}

	// Succeeded
	return res, nil
}

func (svc *userService) ListUserSessions(userID *uuid.UUID, pageIndex int) ([]*data.UserSession, error) {
	logger.Debugf("userService.ListUserSessions(%s, %d)", userID, pageIndex)

	// Prepare a query
	q := db.Dialect().
		From("cm_user_sessions").
		Select(
			"id", "user_id", "ts_created", "ts_expires", "host", "proto", "ip", "country", "ua_browser_name",
			"ua_browser_version", "ua_os_name", "ua_os_version", "ua_device").
		Where(goqu.Ex{"user_id": userID}).
		Order(goqu.I("ts_created").Desc())

	// Paginate if required
	if pageIndex >= 0 {
		q = q.Limit(util.ResultPageSize).Offset(uint(pageIndex) * util.ResultPageSize)
	}

	// Query user sessions
	rows, err := db.Select(q)
	if err != nil {
		logger.Errorf("userService.ListUserSessions: Select() failed: %v", err)
		return nil, translateDBErrors(err)
	}
	defer rows.Close()

	// Fetch the sessions
	var res []*data.UserSession
	for rows.Next() {
		var us data.UserSession
		err := rows.Scan(
			&us.ID,
			&us.UserID,
			&us.CreatedTime,
			&us.ExpiresTime,
			&us.Host,
			&us.Proto,
			&us.IP,
			&us.Country,
			&us.BrowserName,
			&us.BrowserVersion,
			&us.OSName,
			&us.OSVersion,
			&us.Device)
		if err != nil {
			logger.Errorf("userService.ListUserSessions: Scan() failed: %v", err)
			return nil, translateDBErrors(err)
		}
		res = append(res, &us)
	}

	// Verify Next() didn't error
	if err := rows.Err(); err != nil {
		logger.Errorf("userService.ListUserSessions: rows.Next() failed: %v", err)
		return nil, err
	}

	// Succeeded
	return res, nil
}

func (svc *userService) Update(user *data.User) error {
	logger.Debugf("userService.Update(%#v)", user)

	// Update the record
	if err := db.ExecuteOne(
		db.Dialect().
			Update("cm_users").
			Set(goqu.Record{
				"email":              user.Email,
				"name":               user.Name,
				"password_hash":      user.PasswordHash,
				"is_superuser":       user.IsSuperuser,
				"confirmed":          user.Confirmed,
				"ts_confirmed":       user.ConfirmedTime,
				"remarks":            user.Remarks,
				"website_url":        user.WebsiteURL,
				"federated_id":       user.FederatedID,
				"ts_password_change": user.PasswordChangeTime,
			}).
			Where(goqu.Ex{"id": &user.ID}),
	); err != nil {
		logger.Errorf("userService.Update: ExecuteOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *userService) UpdateBanned(curUserID, userID *uuid.UUID, banned bool) error {
	logger.Debugf("userService.UpdateBanned(%s, %s, %v)", curUserID, userID, banned)

	// User cannot be anonymous
	if *userID == data.AnonymousUser.ID {
		return ErrNotFound
	}

	// Update the record
	q := db.Dialect().Update("cm_users").Where(goqu.Ex{"id": userID})
	if banned {
		q = q.Set(goqu.Record{"banned": true, "ts_banned": time.Now().UTC(), "user_banned": curUserID})
	} else {
		q = q.Set(goqu.Record{"banned": false, "ts_banned": nil, "user_banned": nil})
	}
	if err := db.ExecuteOne(q); err != nil {
		logger.Errorf("userService.UpdateBanned: ExecuteOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *userService) UpdateLoginLocked(user *data.User) error {
	logger.Debugf("userService.UpdateLoginLocked(%v)", user)

	// User cannot be anonymous
	if user.IsAnonymous() {
		return ErrNotFound
	}

	// Update the record
	q := db.Dialect().
		Update("cm_users").
		Set(goqu.Record{
			"ts_last_login":         user.LastLoginTime,
			"ts_last_failed_login":  user.LastFailedLoginTime,
			"failed_login_attempts": user.FailedLoginAttempts,
			"is_locked":             user.IsLocked,
			"ts_locked":             user.LockedTime,
		}).
		Where(goqu.Ex{"id": &user.ID})
	if err := db.ExecuteOne(q); err != nil {
		logger.Errorf("userService.UpdateLoginLocked: ExecuteOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

// fetchUserDomainUser returns a new user, and domain user instance from the provided database row
func (svc *userService) fetchUserDomainUser(s intf.Scanner) (*data.User, *data.DomainUser, error) {
	var u data.User
	var fidp sql.NullString
	var duUID, duDID, avatarID uuid.NullUUID
	var duIsOwner, duIsModerator, duIsCommenter, duNotifyReplies, duNotifyModerator, duNotifyCStatus sql.NullBool
	var duCreated sql.NullTime
	if err := s.Scan(
		// User
		&u.ID,
		&u.Email,
		&u.Name,
		&u.LangID,
		&u.PasswordHash,
		&u.SystemAccount,
		&u.IsSuperuser,
		&u.Confirmed,
		&u.ConfirmedTime,
		&u.CreatedTime,
		&u.UserCreated,
		&u.SignupIP,
		&u.SignupCountry,
		&u.SignupHost,
		&u.Banned,
		&u.BannedTime,
		&u.UserBanned,
		&u.Remarks,
		&fidp,
		&u.FederatedSSO,
		&u.FederatedID,
		&u.WebsiteURL,
		&u.SecretToken,
		&u.PasswordChangeTime,
		&u.LastLoginTime,
		&u.LastFailedLoginTime,
		&u.FailedLoginAttempts,
		&u.IsLocked,
		&u.LockedTime,
		// Avatar fields
		&avatarID,
		// DomainUser
		&duDID,
		&duUID,
		&duIsOwner,
		&duIsModerator,
		&duIsCommenter,
		&duNotifyReplies,
		&duNotifyModerator,
		&duNotifyCStatus,
		&duCreated,
	); err != nil {
		logger.Errorf("userService.fetchUserDomainUser: Scan() failed: %v", err)
		return nil, nil, translateDBErrors(err)
	}
	if fidp.Valid {
		u.FederatedID = fidp.String
	}
	u.HasAvatar = avatarID.Valid

	// If there's a DomainUser available
	var pdu *data.DomainUser
	if duDID.Valid && duUID.Valid {
		pdu = &data.DomainUser{
			DomainID:            duDID.UUID,
			UserID:              duUID.UUID,
			IsOwner:             duIsOwner.Bool,
			IsModerator:         duIsModerator.Bool,
			IsCommenter:         duIsCommenter.Bool,
			NotifyReplies:       duNotifyReplies.Bool,
			NotifyModerator:     duNotifyModerator.Bool,
			NotifyCommentStatus: duNotifyCStatus.Bool,
			CreatedTime:         duCreated.Time,
		}
	}

	// Succeeded
	return &u, pdu, nil

}

// fetchUserSession returns a new user, and, optionally, user session instance from the provided database row
func (svc *userService) fetchUserSession(s intf.Scanner, fetchSession bool) (*data.User, *data.UserSession, error) {
	// Prepare user fields
	u := data.User{}
	var avatarID uuid.NullUUID
	var fidp sql.NullString
	args := []any{
		&u.ID,
		&u.Email,
		&u.Name,
		&u.LangID,
		&u.PasswordHash,
		&u.SystemAccount,
		&u.IsSuperuser,
		&u.Confirmed,
		&u.ConfirmedTime,
		&u.CreatedTime,
		&u.UserCreated,
		&u.SignupIP,
		&u.SignupCountry,
		&u.SignupHost,
		&u.Banned,
		&u.BannedTime,
		&u.UserBanned,
		&u.Remarks,
		&fidp,
		&u.FederatedSSO,
		&u.FederatedID,
		&u.WebsiteURL,
		&u.SecretToken,
		&u.PasswordChangeTime,
		&u.LastLoginTime,
		&u.LastFailedLoginTime,
		&u.FailedLoginAttempts,
		&u.IsLocked,
		&u.LockedTime,
		&avatarID,
	}

	// Prepare session fields, if necessary
	var us *data.UserSession
	if fetchSession {
		us = &data.UserSession{}
		args = append(
			args,
			&us.ID,
			&us.UserID,
			&us.CreatedTime,
			&us.ExpiresTime,
			&us.Host,
			&us.Proto,
			&us.IP,
			&us.Country,
			&us.BrowserName,
			&us.BrowserVersion,
			&us.OSName,
			&us.OSVersion,
			&us.Device,
		)
	}

	// Fetch the data
	if err := s.Scan(args...); err != nil {
		// Log "not found" errors only in debug
		if !errors.Is(err, sql.ErrNoRows) || logger.IsEnabledFor(logging.DEBUG) {
			logger.Errorf("userService.fetchUserSession: Scan() failed: %v", err)
		}
		return nil, nil, err
	}
	if fidp.Valid {
		u.FederatedIdP = fidp.String
	}
	u.HasAvatar = avatarID.Valid
	return &u, us, nil
}

// userColumns returns a list of user/avatar columns for the select SQL statement
func (svc *userService) userColumns() []any {
	return []any{
		// User fields
		"u.id", "u.email", "u.name", "u.lang_id", "u.password_hash", "u.system_account", "u.is_superuser",
		"u.confirmed", "u.ts_confirmed", "u.ts_created", "u.user_created", "u.signup_ip", "u.signup_country",
		"u.signup_host", "u.banned", "u.ts_banned", "u.user_banned", "u.remarks", "u.federated_idp", "u.federated_sso",
		"u.federated_id", "u.website_url", "u.secret_token", "u.ts_password_change", "u.ts_last_login",
		"u.ts_last_failed_login", "u.failed_login_attempts", "u.is_locked", "u.ts_locked",
		// Avatar fields
		"a.user_id",
	}
}
