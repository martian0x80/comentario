package svc

import (
	"database/sql"
	"fmt"
	"github.com/google/uuid"
	"gitlab.com/comentario/comentario/internal/api/models"
	"gitlab.com/comentario/comentario/internal/data"
	"gitlab.com/comentario/comentario/internal/util"
	"sort"
	"strings"
	"time"
)

// TheDomainService is a global DomainService implementation
var TheDomainService DomainService = &domainService{}

// DomainService is a service interface for dealing with domains
type DomainService interface {
	// ClearByID removes all dependent objects (users, pages, comments, votes etc.) for the specified domain by its ID
	ClearByID(id *uuid.UUID) error
	// Create creates and persists a new domain record
	Create(userID *uuid.UUID, domain *data.Domain, idps []models.FederatedIdpID) error
	// DeleteByID removes the domain with all dependent objects (users, pages, comments, votes etc.) for the specified
	// domain by its ID
	DeleteByID(id *uuid.UUID) error
	// FindByHost fetches and returns a domain by its host
	FindByHost(host string) (*data.Domain, error)
	// FindByID fetches and returns a domain by its ID
	FindByID(id *uuid.UUID) (*data.Domain, error)
	// FindDomainUserByHost fetches and returns a Domain and DomainUser by domain host and user ID. If the domain
	// exists, but there's no record for the user on that domain:
	//  - if createIfMissing == true, creates a new domain user and returns it
	//  - if createIfMissing == false, returns nil for DomainUser
	FindDomainUserByHost(host string, userID *uuid.UUID, createIfMissing bool) (*data.Domain, *data.DomainUser, error)
	// FindDomainUserByID fetches and returns a Domain and DomainUser by domain and user IDs. If the domain exists, but
	// there's no record for the user on that domain, returns nil for DomainUser
	FindDomainUserByID(domainID, userID *uuid.UUID) (*data.Domain, *data.DomainUser, error)
	// IncrementCounts increments (or decrements if the value is negative) the domain's comment/view counts
	IncrementCounts(domainID *uuid.UUID, incComments, incViews int) error
	// ListByOwnerID fetches and returns a list of domains for the specified owner
	ListByOwnerID(userID *uuid.UUID) ([]data.Domain, error)
	// ListDomainFederatedIdPs fetches and returns a list of federated identity providers enabled for the domain with
	// the given ID
	ListDomainFederatedIdPs(domainID *uuid.UUID) ([]models.FederatedIdpID, error)
	// RegisterView records a domain/page view in the database
	RegisterView(pageID, domainID, userID *uuid.UUID) error
	// SetReadonly sets the readonly status for the given domain
	SetReadonly(domainID *uuid.UUID, readonly bool) error
	// StatsDaily collects and returns daily comment and views statistics for the given domain and number of days. If
	// domainID is nil, statistics is collected for all domains owned by the user
	StatsDaily(userID, domainID *uuid.UUID, numDays int) (comments, views []uint64, err error)
	// StatsTotalsForUser collects and returns total figures for all domains of the specified owner
	StatsTotalsForUser(userID *uuid.UUID) (countDomains, countPages, countComments, countCommenters uint64, err error)
	// Update updates an existing domain record in the database
	Update(domain *data.Domain, idps []models.FederatedIdpID) error
	// UserAdd links the specified user to the given domain
	UserAdd(du *data.DomainUser) error
	// UserModify updates roles and settings of the specified user in the given domain
	UserModify(du *data.DomainUser) error
	// UserRemove unlinks the specified user from the given domain
	UserRemove(userID, domainID *uuid.UUID) error

	/* TODO new-db
	// CreateSSOSecret generates a new SSO secret token for the given domain and saves that in the domain properties
	CreateSSOSecret(host models.Host) (models.HexID, error)
	// CreateSSOToken generates, persists, and returns a new SSO token for the given domain and commenter token
	CreateSSOToken(host models.Host, commenterToken models.HexID) (models.HexID, error)
	// TakeSSOToken queries and removes the provided token from the database, returning its host and commenter token
	TakeSSOToken(token models.HexID) (models.Host, models.HexID, error)
	*/
}

//----------------------------------------------------------------------------------------------------------------------

// domainService is a blueprint DomainService implementation
type domainService struct{}

func (svc *domainService) ClearByID(id *uuid.UUID) error {
	logger.Debugf("domainService.ClearByID(%v)", id)

	if err := db.Exec("delete from cm_domain_pages where domain_id=$1;", id); err != nil {
		logger.Errorf("domainService.ClearByID: Exec() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *domainService) Create(userID *uuid.UUID, domain *data.Domain, idps []models.FederatedIdpID) error {
	logger.Debugf("domainService.Create(%s, %#v, %v)", userID, domain, idps)

	// Insert a new domain record
	if err := db.Exec(
		"insert into cm_domains("+
			"id, name, host, ts_created, is_readonly, auth_anonymous, auth_local, auth_sso, sso_url, mod_anonymous, mod_authenticated, mod_links, mod_images, mod_notify_policy, default_sort) "+
			"values($1, $2, $3, $4, false, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);",
		&domain.ID, domain.Name, domain.Host, domain.CreatedTime, domain.AuthAnonymous, domain.AuthLocal,
		domain.AuthSso, domain.SsoURL, domain.ModAnonymous, domain.ModAuthenticated, domain.ModLinks, domain.ModImages,
		domain.ModNotifyPolicy, domain.DefaultSort,
	); err != nil {
		logger.Errorf("domainService.Create: Exec() failed: %v", err)
		return translateDBErrors(err)
	}

	// Save the domain IdPs
	if err := svc.saveIdPs(&domain.ID, idps); err != nil {
		return err
	}

	// Register the user as domain owner
	if err := svc.UserAdd(&data.DomainUser{
		DomainID:        domain.ID,
		UserID:          *userID,
		IsOwner:         true,
		IsModerator:     true,
		IsCommenter:     true,
		NotifyReplies:   true,
		NotifyModerator: true,
	}); err != nil {
		return err
	}

	// Succeeded
	return nil
}

/*
TODO new-db

	func (svc *domainService) CreateSSOSecret(host models.Host) (models.HexID, error) {
		logger.Debugf("domainService.CreateSSOSecret(%s)", host)

		// Generate a new token
		token, err := data.RandomHexID()
		if err != nil {
			logger.Errorf("userService.CreateSSOSecret: RandomHexID() failed: %v", err)
			return "", err
		}

		// Update the domain record
		if err = db.Exec("update domains set ssosecret=$1 where domain=$2;", token, host); err != nil {
			logger.Errorf("domainService.CreateSSOSecret: Exec() failed: %v", err)
			return "", translateDBErrors(err)
		}

		// Succeeded
		return token, nil
	}

	func (svc *domainService) CreateSSOToken(host models.Host, commenterToken models.HexID) (models.HexID, error) {
		logger.Debugf("domainService.CreateSSOToken(%s, %s)", host, commenterToken)

		// Generate a new token
		token, err := data.RandomHexID()
		if err != nil {
			logger.Errorf("userService.CreateSSOToken: RandomHexID() failed: %v", err)
			return "", err
		}

		// Insert a new token record
		err = db.Exec(
			"insert into ssotokens(token, domain, commentertoken, creationdate) values($1, $2, $3, $4);",
			token, host, commenterToken, time.Now().UTC())
		if err != nil {
			logger.Errorf("domainService.CreateSSOToken: Exec() failed: %v", err)
			return "", translateDBErrors(err)
		}

		// Succeeded
		return token, nil
	}
*/
func (svc *domainService) DeleteByID(id *uuid.UUID) error {
	logger.Debugf("domainService.DeleteByID(%v)", id)

	err := db.Exec("delete from cm_domains where id=$1;", id)
	if err != nil {
		logger.Errorf("domainService.DeleteByID: Exec() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *domainService) FindByHost(host string) (*data.Domain, error) {
	logger.Debugf("domainService.FindByHost(%s)", host)

	// Query the row
	row := db.QueryRow(
		"select "+
			"d.id, d.name, d.host, d.ts_created, d.is_readonly, d.auth_anonymous, d.auth_local, d.auth_sso, "+
			"d.sso_url, coalesce(d.sso_secret, ''), d.mod_anonymous, d.mod_authenticated, d.mod_links, d.mod_images, "+
			"d.mod_notify_policy, d.default_sort, d.count_comments, d.count_views "+
			"from cm_domains d "+
			"where d.host=$1;",
		host)

	// Fetch the domain
	if d, err := svc.fetchDomain(row); err != nil {
		return nil, translateDBErrors(err)
	} else {
		// Succeeded
		return d, nil
	}
}

func (svc *domainService) FindByID(id *uuid.UUID) (*data.Domain, error) {
	logger.Debugf("domainService.FindByID(%s)", id)

	// Query the row
	row := db.QueryRow(
		"select "+
			"d.id, d.name, d.host, d.ts_created, d.is_readonly, d.auth_anonymous, d.auth_local, d.auth_sso, "+
			"d.sso_url, coalesce(d.sso_secret, ''), d.mod_anonymous, d.mod_authenticated, d.mod_links, d.mod_images, "+
			"d.mod_notify_policy, d.default_sort, d.count_comments, d.count_views "+
			"from cm_domains d "+
			"where d.id=$1;",
		id)

	// Fetch the domain
	if d, err := svc.fetchDomain(row); err != nil {
		return nil, translateDBErrors(err)
	} else {
		// Succeeded
		return d, nil
	}
}

func (svc *domainService) FindDomainUserByHost(host string, userID *uuid.UUID, createIfMissing bool) (*data.Domain, *data.DomainUser, error) {
	logger.Debugf("domainService.FindDomainUserByHost(%s, %s, %v)", host, userID, createIfMissing)

	// Query the row
	row := db.QueryRow(
		"select "+
			// Domain fields
			"d.id, d.name, d.host, d.ts_created, d.is_readonly, d.auth_anonymous, d.auth_local, d.auth_sso, "+
			"d.sso_url, coalesce(d.sso_secret, ''), d.mod_anonymous, d.mod_authenticated, d.mod_links, d.mod_images, "+
			"d.mod_notify_policy, d.default_sort, d.count_comments, d.count_views, "+
			// Domain user fields
			"du.user_id, coalesce(du.is_owner, false), coalesce(du.is_moderator, false), "+
			"coalesce(du.is_commenter, false), coalesce(du.notify_replies, false), "+
			"coalesce(du.notify_moderator, false) "+
			"from cm_domains d "+
			"left join cm_domains_users du on du.domain_id=d.id and du.user_id=$1 "+
			"where d.host=$2;",
		userID, host)

	// Fetch the domain and the domain user
	d, du, err := svc.fetchDomainUser(row)
	if err != nil {
		return nil, nil, translateDBErrors(err)
	}

	// If no domain user found and we need to create one
	if du == nil && createIfMissing {
		du = &data.DomainUser{
			DomainID:        d.ID,
			UserID:          *userID,
			IsCommenter:     true, // User can comment by default, until made readonly
			NotifyReplies:   true,
			NotifyModerator: true,
		}

		if err := svc.UserAdd(du); err != nil {
			return nil, nil, err
		}
	}

	// Succeeded
	return d, du, nil
}

func (svc *domainService) FindDomainUserByID(domainID, userID *uuid.UUID) (*data.Domain, *data.DomainUser, error) {
	logger.Debugf("domainService.FindDomainUserByID(%s, %s)", domainID, userID)

	// Query the row
	row := db.QueryRow(
		"select "+
			// Domain fields
			"d.id, d.name, d.host, d.ts_created, d.is_readonly, d.auth_anonymous, d.auth_local, d.auth_sso, "+
			"d.sso_url, coalesce(d.sso_secret, ''), d.mod_anonymous, d.mod_authenticated, d.mod_links, d.mod_images, "+
			"d.mod_notify_policy, d.default_sort, d.count_comments, d.count_views, "+
			// Domain user fields
			"du.user_id, coalesce(du.is_owner, false), "+
			"coalesce(du.is_moderator, false), coalesce(du.is_commenter, false), coalesce(du.notify_replies, false), "+
			"coalesce(du.notify_moderator, false) "+
			"from cm_domains d "+
			"left join cm_domains_users du on du.domain_id=d.id and du.user_id=$2 "+
			"where d.id=$1;",
		domainID, userID)

	// Fetch the domain and the domain user
	if d, du, err := svc.fetchDomainUser(row); err != nil {
		return nil, nil, translateDBErrors(err)
	} else {
		// Succeeded
		return d, du, nil
	}
}

func (svc *domainService) IncrementCounts(domainID *uuid.UUID, incComments, incViews int) error {
	logger.Debugf("domainService.IncrementCounts(%s, %d, %d)", domainID, incComments, incViews)

	// Update the domain record
	if err := db.ExecOne(
		"update cm_domains set count_comments=count_comments+$1, count_views=count_views+$2 where id=$3;",
		incComments, incViews, domainID,
	); err != nil {
		logger.Errorf("domainService.IncrementCounts: ExecOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *domainService) ListByOwnerID(userID *uuid.UUID) ([]data.Domain, error) {
	logger.Debugf("domainService.ListByOwnerID(%s)", userID)

	// Query domains
	rows, err := db.Query(
		"select "+
			"d.id, d.name, d.host, d.ts_created, d.is_readonly, d.auth_anonymous, d.auth_local, d.auth_sso, "+
			"d.sso_url, coalesce(d.sso_secret, ''), d.mod_anonymous, d.mod_authenticated, d.mod_links, d.mod_images, "+
			"d.mod_notify_policy, d.default_sort, d.count_comments, d.count_views "+
			"from cm_domains d "+
			"where d.id in (select du.domain_id from cm_domains_users du where du.user_id=$1 and (du.is_owner or du.is_moderator));",
		userID)
	if err != nil {
		logger.Errorf("domainService.ListByOwnerID: Query() failed: %v", err)
		return nil, translateDBErrors(err)
	}

	// Fetch the domains
	if domains, err := svc.fetchDomains(rows); err != nil {
		return nil, translateDBErrors(err)
	} else {
		return domains, nil
	}
}

func (svc *domainService) ListDomainFederatedIdPs(domainID *uuid.UUID) ([]models.FederatedIdpID, error) {
	logger.Debugf("domainService.ListDomainFederatedIdPs(%s)", domainID)

	// Query domain's IdPs
	rows, err := db.Query("select fed_idp_id from cm_domains_idps where domain_id=$1;", domainID)
	if err != nil {
		logger.Errorf("domainService.ListDomainFederatedIdPs: Query() failed: %v", err)
		return nil, translateDBErrors(err)
	}
	defer rows.Close()

	// Fetch the IDs
	var res []models.FederatedIdpID
	for rows.Next() {
		var id models.FederatedIdpID
		if err := rows.Scan(&id); err != nil {
			logger.Errorf("domainService.ListDomainFederatedIdPs: rows.Scan() failed: %v", err)
			return nil, err

			// Only add a provider if it's enabled globally
		} else if _, ok, _ := data.GetFederatedIdP(id); ok {
			res = append(res, id)
		}
	}

	// Verify Next() didn't error
	if err := rows.Err(); err != nil {
		logger.Errorf("domainService.ListDomainFederatedIdPs: rows.Next() failed: %v", err)
		return nil, err
	}

	// Sort the providers by ID for a stable ordering
	sort.Slice(res, func(i, j int) bool { return res[i] < res[j] })

	// Succeeded
	return res, nil
}

func (svc *domainService) RegisterView(pageID, domainID, userID *uuid.UUID) error {
	logger.Debugf("domainService.RegisterView(%s, %s, %s)", pageID, domainID, userID)

	/* TODO new-db DEPRECATED
	// Insert a new view record
	err := db.Exec(
		"insert into views(domain, commenterhex, viewdate) values ($1, $2, $3);",
		host, fixCommenterHex(commenter.HexID), time.Now().UTC())
	if err != nil {
		logger.Warningf("domainService.RegisterView: Exec() failed: %v", err)
		return translateDBErrors(err)
	}
	*/

	// Succeeded
	return nil
}

func (svc *domainService) SetReadonly(domainID *uuid.UUID, readonly bool) error {
	logger.Debugf("domainService.SetReadonly(%s, %v)", domainID, readonly)

	// Update the domain record
	if err := db.ExecOne("update cm_domains set is_readonly=$1 where id=$2;", readonly, domainID); err != nil {
		logger.Errorf("domainService.SetReadonly: ExecOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *domainService) StatsDaily(userID, domainID *uuid.UUID, numDays int) (comments, views []uint64, err error) {
	logger.Debugf("domainService.StatsDaily(%s, %s, %d)", userID, domainID, numDays)

	// Correct the number of days if needed
	if numDays > util.MaxNumberStatsDays {
		numDays = util.MaxNumberStatsDays
	}

	// Prepare params
	start := time.Now().UTC().Truncate(util.OneDay).AddDate(0, 0, -numDays)
	params := []any{userID, start}

	// Prepare a filter
	domainFilter := ""
	if domainID != nil {
		domainFilter = "and d.id=$3 "
		params = append(params, domainID)
	}

	// Query comment data from the database, grouped by day
	var cRows *sql.Rows
	cRows, err = db.Query(
		"select count(*), date_trunc('day', c.ts_created) "+
			"from cm_comments c "+
			"join cm_domain_pages p on p.id=c.page_id "+
			// Filter by domain
			"join cm_domains d on d.id=p.domain_id "+domainFilter+
			// Filter by owner user
			"join cm_domains_users du on du.domain_id=d.id and du.user_id=$1 and is_owner=true "+
			// Select only last N days
			"where c.ts_created>=$2"+
			"group by date_trunc('day', c.ts_created) "+
			"order by date_trunc('day', c.ts_created);",
		params...)
	if err != nil {
		logger.Errorf("domainService.StatsDaily: Query() failed: %v", err)
		return nil, nil, translateDBErrors(err)
	}
	defer cRows.Close()

	// Collect the data
	if comments, err = svc.fetchStats(cRows, start); err != nil {
		return nil, nil, translateDBErrors(err)
	}

	// Query view data from the database, grouped by day
	var vRows *sql.Rows
	vRows, err = db.Query(
		"select count(*), date_trunc('day', v.ts_created) "+
			"from cm_domain_page_views v "+
			"join cm_domain_pages p on p.id=v.page_id "+
			// Filter by domain
			"join cm_domains d on d.id=p.domain_id "+domainFilter+
			// Filter by owner user
			"join cm_domains_users du on du.domain_id=d.id and du.user_id=$1 and is_owner=true "+
			// Select only last N days
			"where v.ts_created>=$2"+
			"group by date_trunc('day', v.ts_created) "+
			"order by date_trunc('day', v.ts_created);",
		params...)
	if err != nil {
		logger.Errorf("domainService.StatsDaily: Query() failed: %v", err)
		return nil, nil, translateDBErrors(err)
	}
	defer vRows.Close()

	// Collect the data
	if views, err = svc.fetchStats(vRows, start); err != nil {
		return nil, nil, translateDBErrors(err)
	}

	// Succeeded
	return
}

func (svc *domainService) StatsTotalsForUser(userID *uuid.UUID) (countDomains, countPages, countComments, countCommenters uint64, err error) {
	logger.Debugf("domainService.StatsTotalsForUser(%s)", userID)

	// Query domain and page counts
	rdp := db.QueryRow(
		"select count(distinct d.id), count(p.id) "+
			"from cm_domains d "+
			"join cm_domains_users du on du.domain_id=d.id and du.user_id=$1 and du.is_owner=true "+
			"left join cm_domain_pages p on p.domain_id=d.id",
		userID)
	if err = rdp.Scan(&countDomains, &countPages); err != nil {
		// Any other database error
		logger.Errorf("domainService.StatsTotalsForUser: QueryRow() for domains/pages failed: %v", err)
		return 0, 0, 0, 0, translateDBErrors(err)
	}

	// Query comment and commenter counts
	rcc := db.QueryRow(
		"select count(c.id), count(distinct c.user_created) "+
			"from cm_comments c "+
			"join cm_domain_pages p on p.id=c.page_id "+
			"join cm_domains_users du on du.domain_id=p.domain_id and du.user_id=$1 and du.is_owner=true",
		userID)
	if err = rcc.Scan(&countComments, &countCommenters); err != nil {
		// Any other database error
		logger.Errorf("domainService.StatsTotalsForUser: QueryRow() for comments/commenters failed: %v", err)
		return 0, 0, 0, 0, translateDBErrors(err)
	}

	// Succeeded
	return
}

/* TODO new-db DEPRECATED
func (svc *domainService) TakeSSOToken(token models.HexID) (models.Host, models.HexID, error) {
	logger.Debugf("domainService.TakeSSOToken(%s)", token)

	// Fetch and delete the token
	row := db.QueryRow("delete from ssotokens where token=$1 returning domain, commentertoken;", token)
	var host models.Host
	var commenterToken models.HexID
	if err := row.Scan(&host, &commenterToken); err != nil {
		logger.Errorf("domainService.TakeSSOToken: Scan() failed: %v", err)
		return "", "", translateDBErrors(err)
	}

	// Succeeded
	return host, commenterToken, nil
}
*/

func (svc *domainService) Update(domain *data.Domain, idps []models.FederatedIdpID) error {
	logger.Debugf("domainService.Update(%#v, %v)", domain, idps)

	// Update the domain record
	if err := db.ExecOne(
		"update cm_domains "+
			"set name=$1, auth_anonymous=$2, auth_local=$3, auth_sso=$4, sso_url=$5, mod_anonymous=$6, "+
			"mod_authenticated=$7, mod_links=$8, mod_images=$9, mod_notify_policy=$10, default_sort=$11 "+
			"where id=$12;",
		domain.Name, domain.AuthAnonymous, domain.AuthLocal, domain.AuthSso, domain.SsoURL, domain.ModAnonymous,
		domain.ModAuthenticated, domain.ModLinks, domain.ModImages, domain.ModNotifyPolicy, domain.DefaultSort,
		&domain.ID,
	); err != nil {
		logger.Errorf("domainService.Update: ExecOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Save the domain IdPs
	if err := svc.saveIdPs(&domain.ID, idps); err != nil {
		return err
	}

	// Succeeded
	return nil
}

func (svc *domainService) UserAdd(du *data.DomainUser) error {
	logger.Debugf("domainService.UserAdd(%#v)", du)

	// Don't bother if the user is an anonymous one
	if du.UserID != data.AnonymousUser.ID {
		// Insert a new domain-user link record
		if err := db.Exec(
			"insert into cm_domains_users(domain_id, user_id, is_owner, is_moderator, is_commenter, notify_replies, notify_moderator) "+
				"values($1, $2, $3, $4, $5, $6, $7);",
			&du.DomainID, &du.UserID, du.IsOwner, du.IsModerator, du.IsCommenter, du.NotifyReplies, du.NotifyModerator,
		); err != nil {
			logger.Errorf("domainService.UserAdd: Exec() failed: %v", err)
			return translateDBErrors(err)
		}
	}

	// Succeeded
	return nil
}

func (svc *domainService) UserModify(du *data.DomainUser) error {
	logger.Debugf("domainService.UserModify(%#v)", du)

	// Don't bother if the user is an anonymous one
	if du.UserID != data.AnonymousUser.ID {
		// Update the domain-user link record
		if err := db.ExecOne(
			"update cm_domains_users set is_owner=$1, is_moderator=$2, is_commenter=$3, notify_replies=$4, notify_moderator=$5 "+
				"where domain_id=$6 and user_id=$7;",
			du.IsOwner, du.IsModerator, du.IsCommenter, du.NotifyReplies, du.NotifyModerator, &du.DomainID, &du.UserID,
		); err != nil {
			logger.Errorf("domainService.UserModify: ExecOne() failed: %v", err)
			return translateDBErrors(err)
		}
	}

	// Succeeded
	return nil
}

func (svc *domainService) UserRemove(userID, domainID *uuid.UUID) error {
	logger.Debugf("domainService.UserRemove(%s, %s)", userID, domainID)

	// Don't bother if the user is an anonymous one
	if *userID != data.AnonymousUser.ID {
		// Delete the domain-user link record
		if err := db.ExecOne("delete from cm_domains_users where domain_id=$1 and user_id=$2;", &domainID, userID); err != nil {
			logger.Errorf("domainService.UserRemove: ExecOne() failed: %v", err)
			return translateDBErrors(err)
		}
	}

	// Succeeded
	return nil
}

// fetchDomain fetches and returns a domain instance from the provided Scanner
func (svc *domainService) fetchDomain(sc util.Scanner) (*data.Domain, error) {
	var d data.Domain
	err := sc.Scan(
		&d.ID,
		&d.Name,
		&d.Host,
		&d.CreatedTime,
		&d.IsReadonly,
		&d.AuthAnonymous,
		&d.AuthLocal,
		&d.AuthSso,
		&d.SsoURL,
		&d.SsoSecret,
		&d.ModAnonymous,
		&d.ModAuthenticated,
		&d.ModLinks,
		&d.ModImages,
		&d.ModNotifyPolicy,
		&d.DefaultSort,
		&d.CountComments,
		&d.CountViews)
	if err != nil {
		logger.Errorf("domainService.fetchDomain: Scan() failed: %v", err)
		return nil, err
	}

	// Succeeded
	return &d, nil
}

// fetchDomains fetches and returns a list domain instances from the provided database rows
func (svc *domainService) fetchDomains(rows *sql.Rows) ([]data.Domain, error) {
	defer rows.Close()

	// Iterate all rows
	var res []data.Domain
	for rows.Next() {
		if d, err := svc.fetchDomain(rows); err != nil {
			return nil, err
		} else {
			res = append(res, *d)
		}
	}

	// Verify Next() didn't error
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Succeeded
	return res, nil
}

// fetchDomainUser fetches the domain and, optionally, the domain user from the provided Scanner
func (svc *domainService) fetchDomainUser(sc util.Scanner) (*data.Domain, *data.DomainUser, error) {
	var d data.Domain
	var du data.DomainUser
	var uid uuid.NullUUID
	err := sc.Scan(
		&d.ID,
		&d.Name,
		&d.Host,
		&d.CreatedTime,
		&d.IsReadonly,
		&d.AuthAnonymous,
		&d.AuthLocal,
		&d.AuthSso,
		&d.SsoURL,
		&d.SsoSecret,
		&d.ModAnonymous,
		&d.ModAuthenticated,
		&d.ModLinks,
		&d.ModImages,
		&d.ModNotifyPolicy,
		&d.DefaultSort,
		&d.CountComments,
		&d.CountViews,
		&uid,
		&du.IsOwner,
		&du.IsModerator,
		&du.IsCommenter,
		&du.NotifyReplies,
		&du.NotifyModerator)
	if err != nil {
		logger.Errorf("domainService.fetchDomainUser: Scan() failed: %v", err)
		return nil, nil, err
	}

	// If there's a DomainUser
	var pdu *data.DomainUser
	if uid.Valid {
		du.DomainID = d.ID
		du.UserID = uid.UUID
		pdu = &du
	}

	// Succeeded
	return &d, pdu, nil
}

// fetchStats collects and returns a daily statistics using the provided database rows
func (svc *domainService) fetchStats(rs *sql.Rows, start time.Time) ([]uint64, error) {
	// Iterate data rows
	var res []uint64
	for rs.Next() {
		// Fetch a count and a time
		var i uint64
		var t time.Time
		if err := rs.Scan(&i, &t); err != nil {
			logger.Errorf("domainService.fetchStats: rs.Scan() failed: %v", err)
			return nil, err
		}

		// UTC-ise the time, just in case it's in a different timezone
		t = t.UTC()

		// Fill any gap in the day sequence with zeroes
		for start.Before(t) {
			res = append(res, 0)
			start = start.AddDate(0, 0, 1)
		}

		// Append a "real" data row
		res = append(res, i)
	}

	// Check that Next() didn't error
	if err := rs.Err(); err != nil {
		return nil, err
	}

	// Succeeded
	return res, nil
}

// saveIdPs saves domain's identity provider links
func (svc *domainService) saveIdPs(domainID *uuid.UUID, idps []models.FederatedIdpID) error {
	// Delete any existing links
	if err := db.Exec("delete from cm_domains_idps where domain_id=$1", domainID); err != nil {
		logger.Errorf("domainService.saveIdPs: Exec() failed for deleting links: %v", err)
		return translateDBErrors(err)
	}

	// Insert domain IdP records, if any
	if len(idps) > 0 {
		// Prepare an insert statement
		var s strings.Builder
		s.WriteString("insert into cm_domains_idps(domain_id, fed_idp_id) values")

		// Add IdPs to the statement and params
		var params []any
		for i, id := range idps {
			if i > 0 {
				s.WriteByte(',')
			}
			s.WriteString(fmt.Sprintf("($%d,$%d)", i*2+1, i*2+2))
			params = append(params, &domainID, id)
		}
		s.WriteByte(';')

		// Execute the statement
		if err := db.Exec(s.String(), params...); err != nil {
			logger.Errorf("domainService.saveIdPs: Exec() failed for inserting links: %v", err)
			return translateDBErrors(err)
		}
	}

	// Succeeded
	return nil

}
