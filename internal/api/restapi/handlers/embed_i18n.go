package handlers

import (
	"errors"
	"fmt"
	"github.com/go-openapi/runtime/middleware"
	"gitlab.com/comentario/comentario/internal/api/models"
	"gitlab.com/comentario/comentario/internal/api/restapi/operations/api_embed"
	"gitlab.com/comentario/comentario/internal/config"
	"gitlab.com/comentario/comentario/internal/svc"
	"gitlab.com/comentario/comentario/internal/util"
)

func EmbedI18nMessages(params api_embed.EmbedI18nMessagesParams) middleware.Responder {
	// Fetch the messages
	ms, err := svc.TheI18nService.Messages(params.Lang)

	// If no requested language found
	if errors.Is(err, svc.ErrNotFound) {
		// Redirect to the default language instead
		return api_embed.NewEmbedI18nMessagesTemporaryRedirect().
			WithLocation(config.ServerConfig.URLForAPI(fmt.Sprintf("/embed/i18n/%s/messages", util.DefaultLanguage), nil))

	} else if err != nil {
		// Any other error
		return respServiceError(err)
	}

	// Convert the messages into DTOs
	var dtos []*models.I18nMessage
	for id, msg := range ms {
		dtos = append(dtos, &models.I18nMessage{ID: id, Translation: msg})
	}

	// Succeeded
	return api_embed.NewEmbedI18nMessagesOK().WithPayload(dtos)
}
