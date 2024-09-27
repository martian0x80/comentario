package svc

import (
	"fmt"
	"github.com/doug-martin/goqu/v9"
	"github.com/google/uuid"
	"gitlab.com/comentario/comentario/internal/config"
	"gitlab.com/comentario/comentario/internal/data"
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
	q := db.From("cm_users")
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
	cnt, err := q.Count()
	if err != nil {
		return 0, translateDBErrors(err)
	}

	// Succeeded
	return int(cnt), nil
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
				"federated_idp":         u.FederatedIdP,
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
	q := db.From(goqu.T("cm_users").As("u")).
		Select(
			// User columns
			"u.*",
			// User avatar columns
			goqu.Case().When(goqu.I("a.user_id").IsNull(), false).Else(true).As("has_avatar"),
			// Domain user columns
			goqu.I("du.domain_id").As("du_domain_id"),
			goqu.I("du.user_id").As("du_user_id"),
			goqu.I("du.is_owner").As("du_is_owner"),
			goqu.I("du.is_moderator").As("du_is_moderator"),
			goqu.I("du.is_commenter").As("du_is_commenter"),
			goqu.I("du.notify_replies").As("du_notify_replies"),
			goqu.I("du.notify_moderator").As("du_notify_moderator"),
			goqu.I("du.notify_comment_status").As("du_notify_comment_status"),
			goqu.I("du.ts_created").As("du_ts_created")).
		LeftJoin(
			goqu.T("cm_domains_users").As("du"),
			goqu.On(goqu.Ex{"du.user_id": goqu.I("u.id"), "du.domain_id": domainID})).
		LeftJoin(goqu.T("cm_user_avatars").As("a"), goqu.On(goqu.Ex{"a.user_id": goqu.I("u.id")})).
		Where(goqu.Ex{"u.id": userID})

	var r struct {
		data.User
		data.NullDomainUser
	}
	if b, err := q.ScanStruct(&r); err != nil {
		logger.Errorf("userService.FindDomainUserByID: ScanStruct() failed: %v", err)
		return nil, nil, err
	} else if !b {
		return nil, nil, ErrNotFound
	}

	// Succeeded
	return &r.User, r.NullDomainUser.ToDomainUser(), nil
}

func (svc *userService) FindUserByEmail(email string) (*data.User, error) {
	logger.Debugf("userService.FindUserByEmail(%q)", email)

	// Prepare the query
	q := db.From(goqu.T("cm_users").As("u")).
		Select("u.*", goqu.Case().When(goqu.I("a.user_id").IsNull(), false).Else(true).As("has_avatar")).
		Where(goqu.Ex{"u.email": email}).
		// Outer-join user avatars
		LeftJoin(goqu.T("cm_user_avatars").As("a"), goqu.On(goqu.Ex{"a.user_id": goqu.I("u.id")}))

	// Query the user
	u := data.User{}
	if b, err := q.ScanStruct(&u); err != nil {
		logger.Errorf("userService.FindUserByEmail: ScanStruct() failed: %v", err)
		return nil, translateDBErrors(err)
	} else if !b {
		return nil, ErrNotFound
	}

	// Succeeded
	return &u, nil
}

func (svc *userService) FindUserByFederatedID(idp, id string) (*data.User, error) {
	logger.Debugf("userService.FindUserByFederatedID(%q, %q)", idp, id)

	// Prepare the query
	q := db.From(goqu.T("cm_users").As("u")).
		Select("u.*", goqu.Case().When(goqu.I("a.user_id").IsNull(), false).Else(true).As("has_avatar")).
		Where(goqu.Ex{"u.federated_id": id}).
		// Outer-join user avatars
		LeftJoin(goqu.T("cm_user_avatars").As("a"), goqu.On(goqu.Ex{"a.user_id": goqu.I("u.id")}))

	// Restrict by IdP
	if idp == "" {
		q = q.Where(goqu.Ex{"u.federated_idp": nil, "u.federated_sso": true})
	} else {
		q = q.Where(goqu.Ex{"u.federated_idp": idp, "u.federated_sso": false})
	}

	// Query the user
	u := data.User{}
	if b, err := q.ScanStruct(&u); err != nil {
		logger.Errorf("userService.FindUserByFederatedID: ScanStruct() failed: %v", err)
		return nil, translateDBErrors(err)
	} else if !b {
		return nil, ErrNotFound
	}

	// Succeeded
	return &u, nil
}

func (svc *userService) FindUserByID(id *uuid.UUID) (*data.User, error) {
	logger.Debugf("userService.FindUserByID(%s)", id)

	// If the user is anonymous, no need to query
	if *id == data.AnonymousUser.ID {
		return data.AnonymousUser, nil
	}

	// Prepare the query
	q := db.From(goqu.T("cm_users").As("u")).
		Select("u.*", goqu.Case().When(goqu.I("a.user_id").IsNull(), false).Else(true).As("has_avatar")).
		Where(goqu.Ex{"u.id": id}).
		// Outer-join user avatars
		LeftJoin(goqu.T("cm_user_avatars").As("a"), goqu.On(goqu.Ex{"a.user_id": goqu.I("u.id")}))

	// Query the user
	u := data.User{}
	if b, err := q.ScanStruct(&u); err != nil {
		logger.Errorf("userService.FindUserByID: ScanStruct() failed: %v", err)
		return nil, translateDBErrors(err)
	} else if !b {
		return nil, ErrNotFound
	}

	// Succeeded
	return &u, nil
}

func (svc *userService) FindUserBySession(userID, sessionID *uuid.UUID) (*data.User, *data.UserSession, error) {
	logger.Debugf("userService.FindUserBySession(%s, %s)", userID, sessionID)

	// User cannot be anonymous
	if *userID == data.AnonymousUser.ID {
		return nil, nil, ErrNotFound
	}

	// Prepare the query
	now := time.Now().UTC()
	q := db.From(goqu.T("cm_users").As("u")).
		Select(
			// User columns
			"u.*",
			// User avatar columns
			goqu.Case().When(goqu.I("a.user_id").IsNull(), false).Else(true).As("has_avatar"),
			// User session columns
			goqu.I("s.id").As("s_id"),
			goqu.I("s.user_id").As("s_user_id"),
			goqu.I("s.ts_created").As("s_ts_created"),
			goqu.I("s.ts_expires").As("s_ts_expires"),
			goqu.I("s.host").As("s_host"),
			goqu.I("s.proto").As("s_proto"),
			goqu.I("s.ip").As("s_ip"),
			goqu.I("s.country").As("s_country"),
			goqu.I("s.ua_browser_name").As("s_ua_browser_name"),
			goqu.I("s.ua_browser_version").As("s_ua_browser_version"),
			goqu.I("s.ua_os_name").As("s_ua_os_name"),
			goqu.I("s.ua_os_version").As("s_ua_os_version"),
			goqu.I("s.ua_device").As("s_ua_device")).
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
	var r struct {
		data.User
		// Same as UserSession, but with aliased columns
		ID             uuid.UUID `db:"s_id"`
		UserID         uuid.UUID `db:"s_user_id"`
		CreatedTime    time.Time `db:"s_ts_created"`
		ExpiresTime    time.Time `db:"s_ts_expires"`
		Host           string    `db:"s_host"`
		Proto          string    `db:"s_proto"`
		IP             string    `db:"s_ip"`
		Country        string    `db:"s_country"`
		BrowserName    string    `db:"s_ua_browser_name"`
		BrowserVersion string    `db:"s_ua_browser_version"`
		OSName         string    `db:"s_ua_os_name"`
		OSVersion      string    `db:"s_ua_os_version"`
		Device         string    `db:"s_ua_device"`
	}
	if b, err := q.ScanStruct(&r); err != nil {
		return nil, nil, translateDBErrors(err)
	} else if !b {
		return nil, nil, ErrNotFound
	}

	// Succeeded
	return &r.User,
		&data.UserSession{
			ID:             r.ID,
			UserID:         r.UserID,
			CreatedTime:    r.CreatedTime,
			ExpiresTime:    r.ExpiresTime,
			Host:           r.Host,
			Proto:          r.Proto,
			IP:             r.IP,
			Country:        r.Country,
			BrowserName:    r.BrowserName,
			BrowserVersion: r.BrowserVersion,
			OSName:         r.OSName,
			OSVersion:      r.OSVersion,
			Device:         r.Device,
		},
		nil
}

func (svc *userService) List(filter, sortBy string, dir data.SortDirection, pageIndex int) ([]*data.User, error) {
	logger.Debugf("userService.List('%s', '%s', %s, %d)", filter, sortBy, dir, pageIndex)

	// Prepare a statement
	q := db.From(goqu.T("cm_users").As("u")).
		Select("u.*", goqu.Case().When(goqu.I("a.user_id").IsNull(), false).Else(true).As("has_avatar")).
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
	var users []*data.User
	if err := q.ScanStructs(&users); err != nil {
		logger.Errorf("userService.List: ScanStructs() failed: %v", err)
		return nil, translateDBErrors(err)
	}

	// Succeeded
	return users, nil
}

func (svc *userService) ListByDomain(domainID *uuid.UUID, superuser bool, filter, sortBy string, dir data.SortDirection, pageIndex int) (map[uuid.UUID]*data.User, []*data.DomainUser, error) {
	logger.Debugf("userService.ListByDomain(%s, %v, '%s', '%s', %s, %d)", domainID, superuser, filter, sortBy, dir, pageIndex)

	// Prepare a query
	q := db.From(goqu.T("cm_domains_users").As("du")).
		Select(
			// User columns
			"u.*",
			// User avatar columns
			goqu.Case().When(goqu.I("a.user_id").IsNull(), false).Else(true).As("has_avatar"),
			// Domain user columns
			goqu.I("du.domain_id").As("du_domain_id"),
			goqu.I("du.user_id").As("du_user_id"),
			goqu.I("du.is_owner").As("du_is_owner"),
			goqu.I("du.is_moderator").As("du_is_moderator"),
			goqu.I("du.is_commenter").As("du_is_commenter"),
			goqu.I("du.notify_replies").As("du_notify_replies"),
			goqu.I("du.notify_moderator").As("du_notify_moderator"),
			goqu.I("du.notify_comment_status").As("du_notify_comment_status"),
			goqu.I("du.ts_created").As("du_ts_created")).
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

	// Query users and domain users
	var dbRecs []struct {
		data.User
		data.NullDomainUser
	}
	if err := q.ScanStructs(&dbRecs); err != nil {
		logger.Errorf("userService.ListByDomainUser: ScanStructs() failed: %v", err)
		return nil, nil, translateDBErrors(err)
	}

	// Process the users
	var dus []*data.DomainUser
	um := map[uuid.UUID]*data.User{}
	for _, r := range dbRecs {
		// Accumulate domain users (none is supposed to be nil)
		dus = append(dus, r.NullDomainUser.ToDomainUser())

		// Add the user to the map, if it doesn't already exist, with proper clearance
		if _, ok := um[r.User.ID]; !ok {
			um[r.User.ID] = r.User.CloneWithClearance(superuser, true, true)
		}
	}

	// Succeeded
	return um, dus, nil
}

func (svc *userService) ListDomainModerators(domainID *uuid.UUID, enabledNotifyOnly bool) ([]*data.User, error) {
	logger.Debugf("userService.ListDomainModerators(%s, %v)", domainID, enabledNotifyOnly)

	// Prepare a query
	q := db.From(goqu.T("cm_domains_users").As("du")).
		Select("u.*", goqu.Case().When(goqu.I("a.user_id").IsNull(), false).Else(true).As("has_avatar")).
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
	var users []*data.User
	if err := q.ScanStructs(&users); err != nil {
		logger.Errorf("userService.ListDomainModerators: ScanStructs() failed: %v", err)
		return nil, translateDBErrors(err)
	}

	// Succeeded
	return users, nil
}

func (svc *userService) ListUserSessions(userID *uuid.UUID, pageIndex int) ([]*data.UserSession, error) {
	logger.Debugf("userService.ListUserSessions(%s, %d)", userID, pageIndex)

	// Prepare a query
	q := db.From("cm_user_sessions").
		Where(goqu.Ex{"user_id": userID}).
		Order(goqu.I("ts_created").Desc())

	// Paginate if required
	if pageIndex >= 0 {
		q = q.Limit(util.ResultPageSize).Offset(uint(pageIndex) * util.ResultPageSize)
	}

	// Query user sessions
	var us []*data.UserSession
	if err := q.ScanStructs(&us); err != nil {
		logger.Errorf("userService.ListUserSessions: ScanStructs() failed: %v", err)
		return nil, translateDBErrors(err)
	}

	// Succeeded
	return us, nil
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
