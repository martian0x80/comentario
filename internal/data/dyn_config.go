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
	Description  string                        // Item description
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
		Description:  ci.Description,
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
	ConfigKeyAuthSignupConfirmCommenter        DynInstanceConfigItemKey = "auth.signup.confirm.commenter"
	ConfigKeyAuthSignupConfirmUser             DynInstanceConfigItemKey = "auth.signup.confirm.user"
	ConfigKeyAuthSignupEnabled                 DynInstanceConfigItemKey = "auth.signup.enabled"
	ConfigKeyDomainDefaultsShowDeletedComments DynInstanceConfigItemKey = "domain.defaults.comments.showDeleted"
	ConfigKeyDomainDefaultsUseGravatar         DynInstanceConfigItemKey = "domain.defaults.useGravatar"
	ConfigKeyMarkdownImagesEnabled             DynInstanceConfigItemKey = "markdown.images.enabled"
	ConfigKeyMarkdownLinksEnabled              DynInstanceConfigItemKey = "markdown.links.enabled"
	ConfigKeyOperationNewOwnerEnabled          DynInstanceConfigItemKey = "operation.newOwner.enabled"
)

// DefaultDynInstanceConfig is the default dynamic instance configuration
var DefaultDynInstanceConfig = map[DynInstanceConfigItemKey]*DynInstanceConfigItem{
	ConfigKeyAuthSignupConfirmCommenter:        {DefaultValue: "true", Datatype: ConfigDatatypeBoolean, Description: "New commenters must confirm their email"},
	ConfigKeyAuthSignupConfirmUser:             {DefaultValue: "true", Datatype: ConfigDatatypeBoolean, Description: "New users must confirm their email"},
	ConfigKeyAuthSignupEnabled:                 {DefaultValue: "true", Datatype: ConfigDatatypeBoolean, Description: "Enable registration of new users"},
	ConfigKeyDomainDefaultsShowDeletedComments: {DefaultValue: "true", Datatype: ConfigDatatypeBoolean, Description: "Show deleted comments"},
	ConfigKeyDomainDefaultsUseGravatar:         {DefaultValue: "true", Datatype: ConfigDatatypeBoolean, Description: "Use Gravatar for user avatars"},
	ConfigKeyMarkdownImagesEnabled:             {DefaultValue: "true", Datatype: ConfigDatatypeBoolean, Description: "Enable images in comments"},
	ConfigKeyMarkdownLinksEnabled:              {DefaultValue: "true", Datatype: ConfigDatatypeBoolean, Description: "Enable links in comments"},
	ConfigKeyOperationNewOwnerEnabled:          {DefaultValue: "false", Datatype: ConfigDatatypeBoolean, Description: "Non-owner users can add domains"},
}
