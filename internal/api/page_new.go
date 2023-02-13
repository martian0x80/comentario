package api

import (
	"gitlab.com/comentario/comentario/internal/svc"
	"gitlab.com/comentario/comentario/internal/util"
)

func pageNew(domain string, path string) error {
	// path can be empty
	if domain == "" {
		return util.ErrorMissingField
	}

	statement := `insert into pages(domain, path) values($1, $2) on conflict do nothing;`
	_, err := svc.DB.Exec(statement, domain, path)
	if err != nil {
		logger.Errorf("error inserting new page: %v", err)
		return util.ErrorInternal
	}

	return nil
}
