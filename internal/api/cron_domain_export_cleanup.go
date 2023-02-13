package api

import (
	"gitlab.com/comentario/comentario/internal/svc"
	"time"
)

func DomainExportCleanupBegin() error {
	go func() {
		for {
			statement := `
				delete from exports
				where creationDate < $1;
			`
			_, err := svc.DB.Exec(statement, time.Now().UTC().AddDate(0, 0, -7))
			if err != nil {
				logger.Errorf("error cleaning up export rows: %v", err)
				return
			}

			time.Sleep(2 * time.Hour)
		}
	}()

	return nil
}
