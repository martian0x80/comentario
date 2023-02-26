package util

import (
	"errors"
)

var (
	ErrorCannotDeleteOwnerWithActiveDomains = errors.New("you cannot delete your account until all domains associated with your account are deleted")
	ErrorCannotDownloadCommento             = errors.New("we could not download your Comentario export file")
	ErrorCannotDownloadDisqus               = errors.New("we could not download your Disqus export file")
	ErrorCannotUpdateOauthProfile           = errors.New("you cannot update the profile of an external account managed by third-party log in. Please use the appropriate platform to update your details")
	ErrorDatabaseMigration                  = errors.New("encountered error applying database migration")
	ErrorDomainAlreadyExists                = errors.New("that domain has already been registered. Please contact support if you are the true owner")
	ErrorDomainFrozen                       = errors.New("cannot add a new comment because that domain is frozen")
	ErrorEmailAlreadyExists                 = errors.New("that email address has already been registered")
	ErrorEmptyPaths                         = errors.New("empty paths field")
	ErrorInternal                           = errors.New("an internal error has occurred. If you see this repeatedly, please contact support")
	ErrorInvalidAction                      = errors.New("invalid action")
	ErrorInvalidDomainHost                  = errors.New("invalid domain name; it must be a 'host' or 'host:port' value")
	ErrorInvalidDomainURL                   = errors.New("invalid input; provide a valid domain name or a complete URL")
	ErrorInvalidEmailPassword               = errors.New("invalid email/password combination")
	ErrorMalformedTemplate                  = errors.New("a template is malformed")
	ErrorMissingConfig                      = errors.New("missing config environment variable")
	ErrorMissingField                       = errors.New("one or more field(s) empty")
	ErrorNewOwnerForbidden                  = errors.New("new user registrations are forbidden and closed")
	ErrorNoSuchComment                      = errors.New("no such comment")
	ErrorNoSuchCommenter                    = errors.New("no such commenter")
	ErrorNoSuchConfirmationToken            = errors.New("this email confirmation link has expired")
	ErrorNoSuchDomain                       = errors.New("this domain is not registered with Comentario")
	ErrorNoSuchEmail                        = errors.New("no such email")
	ErrorNoSuchOwner                        = errors.New("no such owner")
	ErrorNoSuchResetToken                   = errors.New("this password reset link has expired")
	ErrorNoSuchToken                        = errors.New("no such session token")
	ErrorNoSuchUnsubscribeSecretHex         = errors.New("invalid unsubscribe link")
	ErrorNotAuthorised                      = errors.New("you're not authorised to access that")
	ErrorNotModerator                       = errors.New("you need to be a moderator to do that")
	ErrorOAuthNotConfigured                 = errors.New("OAuth is not configured for this identity provider")
	ErrorSelfVote                           = errors.New("you cannot vote on your own comment")
	ErrorSmtpNotConfigured                  = errors.New("SMTP is not configured")
	ErrorThreadLocked                       = errors.New("this thread is locked. You cannot add new comments")
	ErrorUnauthorisedVote                   = errors.New("you need to be authenticated to vote")
	ErrorUnconfirmedEmail                   = errors.New("your email address is still unconfirmed. Please confirm your email address before proceeding")
	ErrorUnsupportedCommentoImportVersion   = errors.New("unsupported Comentario import format version")
)
