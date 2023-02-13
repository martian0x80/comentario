package api

import (
	"gitlab.com/comentario/comentario/internal/util"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/gitlab"
	"os"
)

var gitlabConfig *oauth2.Config

func gitlabOauthConfigure() error {
	gitlabConfig = nil
	if os.Getenv("GITLAB_KEY") == "" && os.Getenv("GITLAB_SECRET") == "" {
		return nil
	}

	if os.Getenv("GITLAB_KEY") == "" {
		logger.Errorf("COMENTARIO_GITLAB_KEY not configured, but COMENTARIO_GITLAB_SECRET is set")
		return util.ErrorOauthMisconfigured
	}

	if os.Getenv("GITLAB_SECRET") == "" {
		logger.Errorf("COMENTARIO_GITLAB_SECRET not configured, but COMENTARIO_GITLAB_KEY is set")
		return util.ErrorOauthMisconfigured
	}

	logger.Infof("loading gitlab OAuth config")

	gitlabConfig = &oauth2.Config{
		RedirectURL:  os.Getenv("ORIGIN") + "/api/oauth/gitlab/callback",
		ClientID:     os.Getenv("GITLAB_KEY"),
		ClientSecret: os.Getenv("GITLAB_SECRET"),
		Scopes: []string{
			"read_user",
		},
		Endpoint: gitlab.Endpoint,
	}
	gitlabConfig.Endpoint.AuthURL = os.Getenv("GITLAB_URL") + "/oauth/authorize"
	gitlabConfig.Endpoint.TokenURL = os.Getenv("GITLAB_URL") + "/oauth/token"

	gitlabConfigured = true

	return nil
}
