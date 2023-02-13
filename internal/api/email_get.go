package api

import (
	"gitlab.com/comentario/comentario/internal/util"
	"net/http"
)

var emailsRowColumns = `
	emails.email,
	emails.unsubscribeSecretHex,
	emails.lastEmailNotificationDate,
	emails.sendReplyNotifications,
	emails.sendModeratorNotifications
`

func emailsRowScan(s sqlScanner, e *email) error {
	return s.Scan(
		&e.Email,
		&e.UnsubscribeSecretHex,
		&e.LastEmailNotificationDate,
		&e.SendReplyNotifications,
		&e.SendModeratorNotifications,
	)
}

func emailGet(em string) (email, error) {
	statement := `
		SELECT ` + emailsRowColumns + `
		FROM emails
		WHERE email = $1;
	`
	row := DB.QueryRow(statement, em)

	var e email
	if err := emailsRowScan(row, &e); err != nil {
		// TODO: is this the only error?
		return e, util.ErrorNoSuchEmail
	}

	return e, nil
}

func emailGetByUnsubscribeSecretHex(unsubscribeSecretHex string) (email, error) {
	statement := `
		SELECT ` + emailsRowColumns + `
		FROM emails
		WHERE unsubscribeSecretHex = $1;
	`
	row := DB.QueryRow(statement, unsubscribeSecretHex)

	e := email{}
	if err := emailsRowScan(row, &e); err != nil {
		// TODO: is this the only error?
		return e, util.ErrorNoSuchUnsubscribeSecretHex
	}

	return e, nil
}

func emailGetHandler(w http.ResponseWriter, r *http.Request) {
	type request struct {
		UnsubscribeSecretHex *string `json:"unsubscribeSecretHex"`
	}

	var x request
	if err := BodyUnmarshal(r, &x); err != nil {
		BodyMarshalChecked(w, response{"success": false, "message": err.Error()})
		return
	}

	e, err := emailGetByUnsubscribeSecretHex(*x.UnsubscribeSecretHex)
	if err != nil {
		BodyMarshalChecked(w, response{"success": false, "message": err.Error()})
		return
	}

	BodyMarshalChecked(w, response{"success": true, "email": e})
}
