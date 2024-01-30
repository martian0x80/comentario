package data

import (
	"github.com/go-openapi/strfmt"
	"github.com/go-openapi/swag"
	"github.com/google/uuid"
	"gitlab.com/comentario/comentario/internal/api/models"
	"time"
)

// DynInstanceConfigItemKey is a dynamic configuration item key
type DynInstanceConfigItemKey string

// DynInstanceConfigItemDatatype is a dynamic configuration item datatype
type DynInstanceConfigItemDatatype string

// DynInstanceConfigItem describes a single dynamic configuration entry (key-value pair)
type DynInstanceConfigItem struct {
	Value        string                        // Item value
	Datatype     DynInstanceConfigItemDatatype // Item datatype
	UpdatedTime  time.Time                     // Timestamp when the item was last updated in the database
	UserUpdated  uuid.NullUUID                 // Reference to the user who last updated the item in the database
	DefaultValue string                        // Item's default value
}

// AsBool returns the value converted to a boolean
func (ci *DynInstanceConfigItem) AsBool() bool {
	return ci.Value == "true"
}

// HasDefaultValue returns true if the item has its default value
func (ci *DynInstanceConfigItem) HasDefaultValue() bool {
	return ci.Value == ci.DefaultValue
}

// ToDTO converts this model into an API model
func (ci *DynInstanceConfigItem) ToDTO(key DynInstanceConfigItemKey) *models.InstanceDynamicConfigItem {
	return &models.InstanceDynamicConfigItem{
		Datatype:     models.InstanceDynamicConfigItemDatatype(ci.Datatype),
		DefaultValue: ci.DefaultValue,
		Key:          swag.String(string(key)),
		UpdatedTime:  strfmt.DateTime(ci.UpdatedTime),
		UserUpdated:  strfmt.UUID(ci.UserUpdated.UUID.String()),
		Value:        swag.String(ci.Value),
	}
}

const (
	ConfigDatatypeBoolean DynInstanceConfigItemDatatype = "boolean"
)

const (
	ConfigKeyAuthSignupConfirmCommenter             DynInstanceConfigItemKey = "auth.signup.confirm.commenter"
	ConfigKeyAuthSignupConfirmUser                  DynInstanceConfigItemKey = "auth.signup.confirm.user"
	ConfigKeyAuthSignupEnabled                      DynInstanceConfigItemKey = "auth.signup.enabled"
	ConfigKeyDomainDefaultsCommentDeletionAuthor    DynInstanceConfigItemKey = "domain.defaults.comments.deletion.author"
	ConfigKeyDomainDefaultsCommentDeletionModerator DynInstanceConfigItemKey = "domain.defaults.comments.deletion.moderator"
	ConfigKeyDomainDefaultsCommentEditingAuthor     DynInstanceConfigItemKey = "domain.defaults.comments.editing.author"
	ConfigKeyDomainDefaultsCommentEditingModerator  DynInstanceConfigItemKey = "domain.defaults.comments.editing.moderator"
	ConfigKeyDomainDefaultsEnableCommentVoting      DynInstanceConfigItemKey = "domain.defaults.comments.enableVoting"
	ConfigKeyDomainDefaultsShowDeletedComments      DynInstanceConfigItemKey = "domain.defaults.comments.showDeleted"
	ConfigKeyDomainDefaultsLocalSignupEnabled       DynInstanceConfigItemKey = "domain.defaults.signup.enableLocal"
	ConfigKeyDomainDefaultsFederatedSignupEnabled   DynInstanceConfigItemKey = "domain.defaults.signup.enableFederated"
	ConfigKeyDomainDefaultsSsoSignupEnabled         DynInstanceConfigItemKey = "domain.defaults.signup.enableSso"
	ConfigKeyDomainDefaultsUseGravatar              DynInstanceConfigItemKey = "domain.defaults.useGravatar"
	ConfigKeyMarkdownImagesEnabled                  DynInstanceConfigItemKey = "markdown.images.enabled"
	ConfigKeyMarkdownLinksEnabled                   DynInstanceConfigItemKey = "markdown.links.enabled"
	ConfigKeyMarkdownTablesEnabled                  DynInstanceConfigItemKey = "markdown.tables.enabled"
	ConfigKeyOperationNewOwnerEnabled               DynInstanceConfigItemKey = "operation.newOwner.enabled"
)

// DefaultDynInstanceConfig is the default dynamic instance configuration
var DefaultDynInstanceConfig = map[DynInstanceConfigItemKey]*DynInstanceConfigItem{
	ConfigKeyAuthSignupConfirmCommenter:             {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyAuthSignupConfirmUser:                  {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyAuthSignupEnabled:                      {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyDomainDefaultsCommentDeletionAuthor:    {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyDomainDefaultsCommentDeletionModerator: {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyDomainDefaultsCommentEditingAuthor:     {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyDomainDefaultsCommentEditingModerator:  {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyDomainDefaultsEnableCommentVoting:      {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyDomainDefaultsShowDeletedComments:      {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyDomainDefaultsLocalSignupEnabled:       {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyDomainDefaultsFederatedSignupEnabled:   {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyDomainDefaultsSsoSignupEnabled:         {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyDomainDefaultsUseGravatar:              {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyMarkdownImagesEnabled:                  {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyMarkdownLinksEnabled:                   {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyMarkdownTablesEnabled:                  {DefaultValue: "true", Datatype: ConfigDatatypeBoolean},
	ConfigKeyOperationNewOwnerEnabled:               {DefaultValue: "false", Datatype: ConfigDatatypeBoolean},
}
