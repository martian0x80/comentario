package svc

import (
	"database/sql"
	"github.com/doug-martin/goqu/v9"
	"github.com/google/uuid"
	"github.com/op/go-logging"
	"gitlab.com/comentario/comentario/internal/api/models"
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
	//   - includeSystem: if false, skips system users
	//   - includeLocal: if false, skips local users
	//   - includeFederated: if false, skips federated users
	CountUsers(includeSystem, includeLocal, includeFederated bool) (int, error)
	// Create persists a new user
	Create(u *data.User) error
	// CreateUserSession persists a new user session
	CreateUserSession(s *data.UserSession) error
	// DeleteUserByID removes an owner user by their ID
	DeleteUserByID(id *uuid.UUID) error
	// DeleteUserSession removes a user session from the database
	DeleteUserSession(id *uuid.UUID) error
	// FindDomainUserByID fetches and returns a User and DomainUser by domain and user IDs. If the user exists, but
	// there's no record for the user on that domain, returns nil for DomainUser
	FindDomainUserByID(userID, domainID *uuid.UUID) (*data.User, *data.DomainUser, error)
	// FindUserByEmail finds and returns a user by the given email. If localOnly == true, only looks for a
	// locally-authenticated user
	FindUserByEmail(email string, localOnly bool) (*data.User, error)
	// FindUserByID finds and returns a user by the given user ID
	FindUserByID(id *uuid.UUID) (*data.User, error)
	// FindUserBySession finds and returns a user and the related session by the given user and session ID
	FindUserBySession(userID, sessionID *uuid.UUID) (*data.User, *data.UserSession, error)
	// GetMaxUserAuthorisations returns the maximum authorisations the user with curUserID has on the user with userID,
	// across all domain curUserID is registered on
	GetMaxUserAuthorisations(userID, curUserID *uuid.UUID) (isOwner, isModerator, isCommenter bool, err error)
	// List fetches and returns a list of users the specified user has rights to, optionally in a specific domain.
	//   - domainID is an optional domain ID to filter the users by. If nil, returns users for all domains the current user owns.
	//   - superuser indicates whether the current user is a superuser
	//   - filter is an optional substring to filter the result by.
	//   - sortBy is an optional property name to sort the result by. If empty, sorts by the path.
	//   - dir is the sort direction.
	//   - pageIndex is the page index, if negative, no pagination is applied.
	List(userID, domainID *uuid.UUID, superuser bool, filter, sortBy string, dir data.SortDirection, pageIndex int) ([]*models.User, error)
	// ListDomainModerators fetches and returns a list of moderator users for the domain with the given ID. If
	// enabledNotifyOnly is true, only includes users who have moderator notifications enabled for that domain
	ListDomainModerators(domainID *uuid.UUID, enabledNotifyOnly bool) ([]data.User, error)
	// Update updates the given user's data in the database
	Update(user *data.User) error
}

//----------------------------------------------------------------------------------------------------------------------

// userService is a blueprint UserService implementation
type userService struct{}

func (svc *userService) ConfirmUser(id *uuid.UUID) error {
	logger.Debugf("userService.ConfirmUser(%s)", id)

	// Update the owner's record
	if err := db.ExecOne("update cm_users set confirmed=true, ts_confirmed=$1 where id=$2;", time.Now().UTC(), id); err != nil {
		logger.Errorf("userService.ConfirmUser: ExecOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *userService) CountUsers(includeSystem, includeLocal, includeFederated bool) (int, error) {
	logger.Debug("userService.CountUsers(%v, %v, %v)", includeSystem, includeLocal, includeFederated)

	// Prepare the statement
	s := "select count(*) from cm_users"
	var filters []string
	if !includeSystem {
		filters = append(filters, "system_account=false")
	}
	if !includeLocal {
		filters = append(filters, "federated_idp is not null")
	}
	if !includeFederated {
		filters = append(filters, "federated_idp is null")
	}
	if len(filters) > 0 {
		s += " where " + strings.Join(filters, " and ")
	}

	// Query the count
	var i int
	if err := db.QueryRow(s + ";").Scan(&i); err != nil {
		return 0, translateDBErrors(err)
	} else {
		return i, nil
	}
}

func (svc *userService) Create(u *data.User) error {
	logger.Debugf("userService.Create(%#v)", u)

	// Insert a new record
	err := db.Exec(
		"insert into cm_users("+
			"id, email, name, password_hash, system_account, is_superuser, confirmed, ts_confirmed, ts_created, "+
			"user_created, signup_ip, signup_country, signup_host, banned, ts_banned, user_banned, remarks, "+
			"federated_idp, federated_id, website_url) "+
			"values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, nullif($18, ''), $19, $20);",
		u.ID, u.Email, u.Name, u.PasswordHash, u.SystemAccount, u.IsSuperuser, u.Confirmed, u.ConfirmedTime,
		u.CreatedTime, u.UserCreated, config.MaskIP(u.SignupIP), u.SignupCountry, u.SignupHost, u.Banned, u.BannedTime,
		u.UserBanned, u.Remarks, u.FederatedIdP, u.FederatedID, u.WebsiteURL)
	if err != nil {
		logger.Errorf("userService.Create: Exec() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *userService) CreateUserSession(s *data.UserSession) error {
	logger.Debugf("userService.CreateUserSession(%#v)", s)

	// Insert a new record
	err := db.Exec(
		"insert into cm_user_sessions("+
			"id, user_id, ts_created, ts_expires, host, proto, ip, country, ua_browser_name, ua_browser_version, "+
			"ua_os_name, ua_os_version, ua_device) "+
			"values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);",
		s.ID, s.UserID, s.CreatedTime, s.ExpiresTime, s.Host, s.Proto, config.MaskIP(s.IP), s.Country, s.BrowserName,
		s.BrowserVersion, s.OSName, s.OSVersion, s.Device)
	if err != nil {
		logger.Errorf("userService.CreateUserSession: Exec() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *userService) DeleteUserByID(id *uuid.UUID) error {
	logger.Debugf("userService.DeleteUserByID(%s)", id)

	// Delete the user
	if err := db.ExecOne("delete from cm_users where id=$1;", id); err != nil {
		logger.Errorf("userService.DeleteUserByID: ExecOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *userService) DeleteUserSession(id *uuid.UUID) error {
	logger.Debugf("userService.DeleteUserSession(%s)", id)

	// Delete the record
	if err := db.Exec("delete from cm_user_sessions where id=$1;", id); err != nil {
		logger.Errorf("userService.DeleteUserSession: Exec() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *userService) FindDomainUserByID(userID, domainID *uuid.UUID) (*data.User, *data.DomainUser, error) {
	logger.Debugf("userService.FindDomainUserByID(%s, %s)", userID, domainID)

	// Query the database
	var u data.User
	var du data.DomainUser
	var duUID, duDID, avatarID uuid.NullUUID
	var duCreated sql.NullTime
	if err := db.QueryRow(
		"select "+
			// User fields
			"u.id, u.email, u.name, u.password_hash, u.system_account, u.is_superuser, u.confirmed, u.ts_confirmed, "+
			"u.ts_created, u.user_created, u.signup_ip, u.signup_country, u.signup_host, u.banned, u.ts_banned, "+
			"u.user_banned, u.remarks, coalesce(u.federated_idp, ''), u.federated_id, u.website_url, "+
			// Avatar fields
			"a.user_id, "+
			// DomainUser fields
			"du.domain_id, du.user_id, coalesce(du.is_owner, false), coalesce(du.is_moderator, false), "+
			"coalesce(du.is_commenter, false), coalesce(du.notify_replies, false), "+
			"coalesce(du.notify_moderator, false), du.ts_created "+
			"from cm_users u "+
			"left join cm_domains_users du on du.user_id=u.id and du.domain_id=$1 "+
			"left join cm_user_avatars a on a.user_id=u.id "+
			"where u.id=$2;",
		userID, domainID,
	).Scan(
		// User
		&u.ID,
		&u.Email,
		&u.Name,
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
		&u.FederatedIdP,
		&u.FederatedID,
		&u.WebsiteURL,
		// Avatar fields
		&avatarID,
		// DomainUser
		&duDID,
		&duUID,
		&du.IsOwner,
		&du.IsModerator,
		&du.IsCommenter,
		&du.NotifyReplies,
		&du.NotifyModerator,
		&duCreated,
	); err != nil {
		return nil, nil, translateDBErrors(err)
	}
	u.HasAvatar = avatarID.Valid

	// If there's a DomainUser available
	var pdu *data.DomainUser
	if duDID.Valid && duUID.Valid {
		du.DomainID = duDID.UUID
		du.UserID = duUID.UUID
		du.CreatedTime = duCreated.Time
		pdu = &du
	}

	// Succeeded
	return &u, pdu, nil
}

func (svc *userService) FindUserByEmail(email string, localOnly bool) (*data.User, error) {
	logger.Debugf("userService.FindUserByEmail('%s', %v)", email, localOnly)

	// Prepare the query
	q := db.Dialect().
		From(goqu.T("cm_users").As("u")).
		Select(
			// User fields
			"u.id", "u.email", "u.name", "u.password_hash", "u.system_account", "u.is_superuser", "u.confirmed",
			"u.ts_confirmed", "u.ts_created", "u.user_created", "u.signup_ip", "u.signup_country", "u.signup_host",
			"u.banned", "u.ts_banned", "u.user_banned", "u.remarks", "u.federated_idp", "u.federated_id",
			"u.website_url",
			// Avatar fields
			"a.user_id").
		Where(goqu.Ex{"u.email": email}).
		// Outer-join user avatars
		LeftJoin(goqu.T("cm_user_avatars").As("a"), goqu.On(goqu.Ex{"a.user_id": goqu.I("u.id")}))

	// If only local users are in scope
	if localOnly {
		q = q.Where(goqu.Ex{"u.federated_idp": nil})
	}

	// Query the database
	if u, _, err := svc.fetchUserSession(db.SelectRow(q), false); err != nil {
		return nil, translateDBErrors(err)
	} else {
		return u, nil
	}
}

func (svc *userService) FindUserByID(id *uuid.UUID) (*data.User, error) {
	logger.Debugf("userService.FindUserByID(%s)", id)

	// Prepare the query
	q := db.Dialect().
		From(goqu.T("cm_users").As("u")).
		Select(
			// User fields
			"u.id", "u.email", "u.name", "u.password_hash", "u.system_account", "u.is_superuser", "u.confirmed",
			"u.ts_confirmed", "u.ts_created", "u.user_created", "u.signup_ip", "u.signup_country", "u.signup_host",
			"u.banned", "u.ts_banned", "u.user_banned", "u.remarks", "u.federated_idp", "u.federated_id",
			"u.website_url",
			// Avatar fields
			"a.user_id").
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

	// Prepare the query
	now := time.Now().UTC()
	q := db.Dialect().
		From(goqu.T("cm_users").As("u")).
		Select(
			// User fields
			"u.id", "u.email", "u.name", "u.password_hash", "u.system_account", "u.is_superuser", "u.confirmed",
			"u.ts_confirmed", "u.ts_created", "u.user_created", "u.signup_ip", "u.signup_country", "u.signup_host",
			"u.banned", "u.ts_banned", "u.user_banned", "u.remarks", "u.federated_idp", "u.federated_id", "u.website_url",
			// Avatar fields
			"a.user_id",
			// User session fields
			"s.id", "s.user_id", "s.ts_created", "s.ts_expires", "s.host", "s.proto", "s.ip", "s.country", "s.ua_browser_name",
			"s.ua_browser_version", "s.ua_os_name", "s.ua_os_version", "s.ua_device").
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

func (svc *userService) GetMaxUserAuthorisations(userID, curUserID *uuid.UUID) (isOwner, isModerator, isCommenter bool, err error) {
	logger.Debugf("userService.GetMaxUserAuthorisations(%s, %s)", userID, curUserID)

	// Prepare a statement
	q := db.Dialect().
		From(goqu.T("cm_domains_users").As("du")).
		// Select maximum values for curUserID...
		Select(goqu.L(`bool_or("du"."is_owner")`), goqu.L(`bool_or("du"."is_moderator")`), goqu.L(`bool_or("du"."is_commenter")`)).
		// ... of all domains userID is registered on
		Where(goqu.Ex{
			"du.user_id":   curUserID,
			"du.domain_id": goqu.Any(db.Dialect().Select("domain_id").From(goqu.T("cm_domains_users")).Where(goqu.Ex{"user_id": userID})),
		})

	// Query the database
	var owner, moderator, commenter sql.NullBool
	if err = db.SelectRow(q).Scan(&owner, &moderator, &commenter); err != nil {
		return false, false, false, translateDBErrors(err)
	}
	return owner.Valid && owner.Bool,
		moderator.Valid && moderator.Bool,
		commenter.Valid && commenter.Bool,
		nil
}

func (svc *userService) List(userID, domainID *uuid.UUID, superuser bool, filter, sortBy string, dir data.SortDirection, pageIndex int) ([]*models.User, error) {
	logger.Debugf("userService.List(%s, %s, %v, '%s', '%s', %s, %d)", userID, domainID, superuser, filter, sortBy, dir, pageIndex)

	// Prepare a statement
	q := db.Dialect().
		From(goqu.T("cm_users").As("u")).
		Select(
			// User fields
			"u.id", "u.email", "u.name", "u.password_hash", "u.system_account", "u.is_superuser", "u.confirmed",
			"u.ts_confirmed", "u.ts_created", "u.user_created", "u.signup_ip", "u.signup_country", "u.signup_host",
			"u.banned", "u.ts_banned", "u.user_banned", "u.remarks", "u.federated_idp", "u.federated_id",
			"u.website_url",
			// Avatar fields
			"a.user_id").
		// Outer-join user avatars
		LeftJoin(goqu.T("cm_user_avatars").As("a"), goqu.On(goqu.Ex{"a.user_id": goqu.I("u.id")}))

	// Add filter by domain, if necessary
	if domainID == nil {
		q = q.SelectAppend(goqu.L("null"), goqu.L("null"), goqu.L("null"))
	} else {
		q = q.SelectAppend("du.is_owner", "du.is_moderator", "du.is_commenter").
			Join(
				goqu.T("cm_domains_users").As("du"),
				goqu.On(goqu.Ex{"du.user_id": goqu.I("u.id"), "du.domain_id": domainID}))
	}

	// If the current user isn't a superuser
	if !superuser {
		// Add filter by users registered in domains owned by the current user
		q = q.Where(goqu.Ex{
			"u.id": goqu.Any(
				db.Dialect().
					From("cm_domains_users").
					Select("user_id").
					Where(goqu.Ex{
						"domain_id": goqu.Any(
							db.Dialect().
								From("cm_domains_users").
								Select("domain_id").
								Where(goqu.Ex{"user_id": userID, "is_owner": true})),
					})),
		})
	}

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
	case "signupCountry":
		sortIdent = "u.signup_country"
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
		logger.Errorf("userService.List: Query() failed: %v", err)
		return nil, translateDBErrors(err)
	}
	defer rows.Close()

	// Fetch the users
	var us []*models.User
	var isOwner, isModerator, isCommenter sql.NullBool
	var fidp sql.NullString
	var avatarID uuid.NullUUID
	for rows.Next() {
		var u data.User
		if err := rows.Scan(
			// User
			&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.SystemAccount, &u.IsSuperuser, &u.Confirmed, &u.ConfirmedTime,
			&u.CreatedTime, &u.UserCreated, &u.SignupIP, &u.SignupCountry, &u.SignupHost, &u.Banned, &u.BannedTime,
			&u.UserBanned, &u.Remarks, &fidp, &u.FederatedID, &u.WebsiteURL,
			// Avatar fields
			&avatarID,
			// Domain user
			&isOwner, &isModerator, &isCommenter,
		); err != nil {
			logger.Errorf("userService.List: Scan() failed: %v", err)
			return nil, translateDBErrors(err)
		}
		if fidp.Valid {
			u.FederatedIdP = fidp.String
		}
		u.HasAvatar = avatarID.Valid

		// Limit the visible fields and convert into an API model
		us = append(us, u.CloneWithClearance(superuser, true, true).ToDTO(isOwner, isModerator, isCommenter))
	}

	// Verify Next() didn't error
	if err := rows.Err(); err != nil {
		return nil, translateDBErrors(err)
	}

	// Succeeded
	return us, nil
}

func (svc *userService) ListDomainModerators(domainID *uuid.UUID, enabledNotifyOnly bool) ([]data.User, error) {
	logger.Debugf("userService.ListDomainModerators(%s, %v)", domainID, enabledNotifyOnly)

	// Prepare a query
	q := db.Dialect().
		From(goqu.T("cm_domains_users").As("du")).
		Select(
			// User fields
			"u.id", "u.email", "u.name", "u.password_hash", "u.system_account", "u.is_superuser", "u.confirmed",
			"u.ts_confirmed", "u.ts_created", "u.user_created", "u.signup_ip", "u.signup_country", "u.signup_host",
			"u.banned", "u.ts_banned", "u.user_banned", "u.remarks", "u.federated_idp", "u.federated_id",
			"u.website_url",
			// Avatar fields
			"a.user_id").
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
		logger.Errorf("userService.ListDomainModerators: Query() failed: %v", err)
		return nil, translateDBErrors(err)
	}
	defer rows.Close()

	// Fetch the users
	var res []data.User
	for rows.Next() {
		if u, _, err := svc.fetchUserSession(rows, false); err != nil {
			return nil, translateDBErrors(err)
		} else {
			res = append(res, *u)
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

func (svc *userService) Update(user *data.User) error {
	logger.Debugf("userService.Update(%#v)", user)

	// Update the record
	if err := db.ExecOne(
		"update cm_users set email=$1, name=$2, password_hash=$3, website_url=$4, federated_id=$5 where id=$6;",
		user.Email, user.Name, user.PasswordHash, user.WebsiteURL, user.FederatedID, &user.ID,
	); err != nil {
		logger.Errorf("userService.Update: ExecOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

// fetchUser returns a new user, and, optionally, user session instance from the provided database row
func (svc *userService) fetchUserSession(s util.Scanner, fetchSession bool) (*data.User, *data.UserSession, error) {
	// Prepare user fields
	u := data.User{}
	var avatarID uuid.NullUUID
	var fidp sql.NullString
	args := []any{
		&u.ID,
		&u.Email,
		&u.Name,
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
		&u.FederatedID,
		&u.WebsiteURL,
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
		if err != sql.ErrNoRows || logger.IsEnabledFor(logging.DEBUG) {
			logger.Errorf("userService.fetchUserSession: Scan() failed: %v", err)
		}
		return nil, nil, err
	}
	u.FederatedIdP = fidp.String
	u.HasAvatar = avatarID.Valid
	return &u, us, nil
}
