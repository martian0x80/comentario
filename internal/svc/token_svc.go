package svc

import (
	"database/sql"
	"errors"
	"github.com/doug-martin/goqu/v9"
	"gitlab.com/comentario/comentario/internal/data"
	"time"
)

// TheTokenService is a global TokenService implementation
var TheTokenService TokenService = &tokenService{}

// TokenService is a service interface for dealing with Token objects
type TokenService interface {
	// Create persists a new token
	Create(t *data.Token) error
	// DeleteByValue deletes a token by its (string) value
	DeleteByValue(s string) error
	// FindByValue finds and returns a token by its (string) value
	FindByValue(s string, allowExpired bool) (*data.Token, error)
	// Update updates the token record in the database
	Update(t *data.Token) error
}

//----------------------------------------------------------------------------------------------------------------------

// tokenService is a blueprint TokenService implementation
type tokenService struct{}

func (svc *tokenService) Create(t *data.Token) error {
	logger.Debugf("tokenService.Create(%#v)", t)

	// Insert a new record
	if err := db.ExecOne(db.Insert("cm_tokens").Rows(t)); err != nil {
		logger.Errorf("tokenService.Create: ExecOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *tokenService) DeleteByValue(s string) error {
	logger.Debugf("tokenService.DeleteByValue(%q)", s)

	// Delete the record
	err := db.ExecOne(db.Delete("cm_tokens").Where(goqu.Ex{"value": s}))
	if errors.Is(err, sql.ErrNoRows) {
		// No rows affected
		return ErrBadToken
	} else if err != nil {
		// Any other error
		logger.Errorf("tokenService.DeleteByValue: ExecOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

func (svc *tokenService) FindByValue(s string, allowExpired bool) (*data.Token, error) {
	logger.Debugf("tokenService.FindByValue(%x, %v)", s, allowExpired)

	q := db.From("cm_tokens").Where(goqu.Ex{"value": s})
	if !allowExpired {
		q = q.Where(goqu.C("ts_expires").Gt(time.Now().UTC()))
	}

	// Query the token
	var t data.Token
	if b, err := q.ScanStruct(&t); err != nil {
		logger.Errorf("tokenService.FindByValue: ScanStruct() failed: %v", err)
		return nil, translateDBErrors(err)
	} else if !b {
		return nil, ErrBadToken
	}

	// Succeeded
	return &t, nil
}

func (svc *tokenService) Update(t *data.Token) error {
	logger.Debugf("tokenService.Update(%v)", t)

	// Update the token record
	if err := db.ExecOne(db.Update("cm_tokens").Set(t).Where(goqu.Ex{"value": t.Value})); err != nil {
		logger.Errorf("tokenService.Update: ExecOne() failed: %v", err)
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}
