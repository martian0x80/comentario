package handlers

import (
	"github.com/go-openapi/runtime/middleware"
	"github.com/go-openapi/strfmt"
	"github.com/go-openapi/swag"
	"gitlab.com/comentario/comentario/internal/api/models"
	"gitlab.com/comentario/comentario/internal/api/restapi/operations"
	"gitlab.com/comentario/comentario/internal/config"
	"gitlab.com/comentario/comentario/internal/data"
	"gitlab.com/comentario/comentario/internal/svc"
	"gitlab.com/comentario/comentario/internal/util"
	"golang.org/x/crypto/bcrypt"
	"time"
)

func OwnerConfirmHex(params operations.OwnerConfirmHexParams) middleware.Responder {
	if params.ConfirmHex != "" {
		if err := ownerConfirmHex(params.ConfirmHex); err == nil {
			// Redirect to login
			return operations.NewOwnerConfirmHexTemporaryRedirect().
				WithLocation(config.URLFor("login", map[string]string{"confirmed": "true"}))
		}
	}

	// TODO: include error message in the URL
	return operations.NewOwnerConfirmHexTemporaryRedirect().
		WithLocation(config.URLFor("login", map[string]string{"confirmed": "false"}))
}

func OwnerDelete(params operations.OwnerDeleteParams) middleware.Responder {
	// Find the owner user
	user, err := svc.TheUserService.FindOwnerByToken(*params.Body.OwnerToken)
	if err != nil {
		return respServiceError(err)
	}

	// Fetch a list of domains
	if domains, err := svc.TheDomainService.ListByOwner(user.HexID); err != nil {
		return respServiceError(err)

		// Make sure the owner owns no domains
	} else if len(domains) > 0 {
		return respBadRequest(util.ErrorCannotDeleteOwnerWithActiveDomains)
	}

	// Remove the owner user
	if err := svc.TheUserService.DeleteOwnerByID(user.HexID); err != nil {
		return respServiceError(err)
	}

	// Succeeded
	return operations.NewOwnerDeleteOK().WithPayload(&models.APIResponseBase{Success: true})
}

func OwnerLogin(params operations.OwnerLoginParams) middleware.Responder {
	ownerToken, err := ownerLogin(*params.Body.Email, *params.Body.Password)
	if err != nil {
		return operations.NewOwnerLoginOK().WithPayload(&operations.OwnerLoginOKBody{Message: err.Error()})
	}

	// Succeeded
	return operations.NewOwnerLoginOK().WithPayload(&operations.OwnerLoginOKBody{
		OwnerToken: ownerToken,
		Success:    true,
	})
}

func OwnerNew(params operations.OwnerNewParams) middleware.Responder {
	email := data.EmailToString(params.Body.Email)
	name := data.TrimmedString(params.Body.Name)
	pwd := swag.StringValue(params.Body.Password)

	// Create a new owner record
	if _, err := ownerNew(strfmt.Email(email), name, pwd); err != nil {
		return operations.NewOwnerNewOK().WithPayload(&operations.OwnerNewOKBody{Message: err.Error()})
	}

	// Register the owner also as a commenter (ignore errors)
	_, _ = svc.TheUserService.CreateCommenter(email, name, "undefined", "undefined", "", pwd)

	// Succeeded
	return operations.NewOwnerNewOK().WithPayload(&operations.OwnerNewOKBody{
		ConfirmEmail: config.SMTPConfigured,
		Success:      true,
	})
}

func OwnerSelf(params operations.OwnerSelfParams) middleware.Responder {
	// Try to find the owner
	user, err := svc.TheUserService.FindOwnerByToken(*params.Body.OwnerToken)
	if err == util.ErrorNoSuchToken {
		return operations.NewOwnerSelfOK().WithPayload(&operations.OwnerSelfOKBody{Success: true})
	}

	if err != nil {
		return operations.NewOwnerSelfOK().WithPayload(&operations.OwnerSelfOKBody{Message: err.Error()})
	}

	// Succeeded
	return operations.NewOwnerSelfOK().WithPayload(&operations.OwnerSelfOKBody{
		LoggedIn: true,
		Owner:    user.ToOwner(),
		Success:  true,
	})
}

func ownerConfirmHex(confirmHex string) error {
	if confirmHex == "" {
		return util.ErrorMissingField
	}

	res, err := svc.DB.ExecRes(
		"update owners "+
			"set confirmedEmail=true where ownerHex in (select ownerHex from ownerConfirmHexes where confirmHex=$1);",
		confirmHex)
	if err != nil {
		logger.Errorf("cannot mark user's confirmedEmail as true: %v\n", err)
		return util.ErrorInternal
	}

	count, err := res.RowsAffected()
	if err != nil {
		logger.Errorf("cannot count rows affected: %v\n", err)
		return util.ErrorInternal
	}

	if count == 0 {
		return util.ErrorNoSuchConfirmationToken
	}

	err = svc.DB.Exec("delete from ownerConfirmHexes where confirmHex=$1;", confirmHex)
	if err != nil {
		logger.Warningf("cannot remove confirmation token: %v\n", err)
		// Don't return an error because this is not critical.
	}

	return nil
}

func ownerLogin(email strfmt.Email, password string) (models.HexID, error) {
	if email == "" || password == "" {
		return "", util.ErrorMissingField
	}

	row := svc.DB.QueryRow("select ownerHex, confirmedEmail, passwordHash from owners where email=$1;", email)

	var ownerHex string
	var confirmedEmail bool
	var passwordHash string
	if err := row.Scan(&ownerHex, &confirmedEmail, &passwordHash); err != nil {
		// Add a delay to discourage brute-force attacks
		time.Sleep(util.WrongAuthDelay)
		return "", util.ErrorInvalidEmailPassword
	}

	if !confirmedEmail {
		return "", util.ErrorUnconfirmedEmail
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)); err != nil {
		// TODO: is this the only possible error?
		// Add a delay to discourage brute-force attacks
		time.Sleep(util.WrongAuthDelay)
		return "", util.ErrorInvalidEmailPassword
	}

	ownerToken, err := data.RandomHexID()
	if err != nil {
		logger.Errorf("cannot create ownerToken: %v", err)
		return "", util.ErrorInternal
	}

	err = svc.DB.Exec(
		"insert into ownerSessions(ownerToken, ownerHex, loginDate) values($1, $2, $3);",
		ownerToken,
		ownerHex,
		time.Now().UTC(),
	)
	if err != nil {
		logger.Errorf("cannot insert ownerSession: %v\n", err)
		return "", util.ErrorInternal
	}

	return ownerToken, nil
}

func ownerNew(email strfmt.Email, name string, password string) (models.HexID, error) {
	if email == "" || name == "" || password == "" {
		return "", util.ErrorMissingField
	}

	if !config.CLIFlags.AllowNewOwners {
		return "", util.ErrorNewOwnerForbidden
	}

	if _, err := svc.TheUserService.FindOwnerByEmail(string(email), false); err == nil {
		return "", util.ErrorEmailAlreadyExists
	}

	if _, err := svc.TheEmailService.Create(string(email)); err != nil {
		return "", util.ErrorInternal
	}

	ownerHex, err := data.RandomHexID()
	if err != nil {
		logger.Errorf("cannot generate ownerHex: %v", err)
		return "", util.ErrorInternal
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		logger.Errorf("cannot generate hash from password: %v\n", err)
		return "", util.ErrorInternal
	}

	err = svc.DB.Exec(
		"insert into owners(ownerHex, email, name, passwordHash, joinDate, confirmedEmail) values($1, $2, $3, $4, $5, $6);",
		ownerHex,
		email,
		name,
		string(passwordHash),
		time.Now().UTC(),
		!config.SMTPConfigured)
	if err != nil {
		// TODO: Make sure `err` is actually about conflicting UNIQUE, and not some
		// other error. If it is something else, we should probably return `errorInternal`.
		return "", util.ErrorEmailAlreadyExists
	}

	confirmHex, err := data.RandomHexID()
	if err != nil {
		logger.Errorf("cannot generate confirmHex: %v", err)
		return "", util.ErrorInternal
	}

	err = svc.DB.Exec(
		"insert into ownerConfirmHexes(confirmHex, ownerHex, sendDate) values($1, $2, $3);",
		confirmHex,
		ownerHex,
		time.Now().UTC())
	if err != nil {
		logger.Errorf("cannot insert confirmHex: %v\n", err)
		return "", util.ErrorInternal
	}

	err = svc.TheMailService.SendFromTemplate(
		"",
		string(email),
		"Please confirm your email address",
		"confirm-hex.gohtml",
		map[string]any{"URL": config.URLForAPI("owner/confirm-hex", map[string]string{"confirmHex": string(confirmHex)})})
	if err != nil {
		return "", err
	}

	// Succeeded
	return ownerHex, nil
}
