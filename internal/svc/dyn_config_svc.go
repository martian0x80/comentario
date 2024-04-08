package svc

import (
	"errors"
	"fmt"
	"github.com/doug-martin/goqu/v9"
	"github.com/google/uuid"
	"gitlab.com/comentario/comentario/internal/data"
	"sync"
	"time"
)

// TheDynConfigService is a global DynConfigService implementation
var TheDynConfigService DynConfigService = newDynConfigService()

// DynConfigService is a service interface for dealing with dynamic instance configuration
type DynConfigService interface {
	// Get returns a configuration item by its key
	Get(key data.DynConfigItemKey) (*data.DynConfigItem, error)
	// GetAll returns all available configuration items
	GetAll() (map[data.DynConfigItemKey]*data.DynConfigItem, error)
	// GetBool returns the bool value of a configuration item by its key, or the default value on error
	GetBool(key data.DynConfigItemKey) bool
	// GetInt returns the int value of a configuration item by its key, or the default value on error
	GetInt(key data.DynConfigItemKey) int
	// Load configuration data from the database
	Load() error
	// Reset all configuration data to its defaults, then persist the data
	Reset() error
	// Update the values of the configuration items with the given keys and persist the changes. curUserID can be nil
	Update(curUserID *uuid.UUID, vals map[data.DynConfigItemKey]string) error
}

//----------------------------------------------------------------------------------------------------------------------

var errConfigUninitialised = errors.New("config is not initialised")

// ConfigStore is a transient, concurrent store for DynConfigItem's
type ConfigStore struct {
	mu       sync.RWMutex                                                  // Config item mutex
	items    map[data.DynConfigItemKey]*data.DynConfigItem                 // Config items
	defaults func() (map[data.DynConfigItemKey]*data.DynConfigItem, error) // Function returning a new, fresh map of items, all with their default values
}

func (cs *ConfigStore) Get(key data.DynConfigItemKey) (*data.DynConfigItem, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	return cs.get(key)
}

func (cs *ConfigStore) GetAll() (map[data.DynConfigItemKey]*data.DynConfigItem, error) {
	// Prevent concurrent write access
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	// Make sure the config is initialised
	if cs.items == nil {
		return nil, errConfigUninitialised
	}

	// Make an (immutable) copy of the items
	items := make(map[data.DynConfigItemKey]*data.DynConfigItem, len(cs.items))
	for k, v := range cs.items {
		vCopy := *v
		items[k] = &vCopy
	}
	return items, nil
}

// Reset all configuration data to instance defaults
func (cs *ConfigStore) Reset() error {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	items, err := cs.defaults()
	if err == nil {
		cs.items = items
	}
	return err
}

// Update sets multiple item values at once
func (cs *ConfigStore) Update(curUserID *uuid.UUID, vals map[data.DynConfigItemKey]string) error {
	// Prevent concurrent access
	cs.mu.Lock()
	defer cs.mu.Unlock()

	for k, v := range vals {
		// Find the item
		ci, err := cs.get(k)
		if err != nil {
			return err
		}

		// Validate the value
		if err := ci.ValidateValue(v); err != nil {
			return err
		}

		// Update the item
		ci.Value = v
		ci.UpdatedTime = time.Now().UTC()
		ci.UserUpdated = *data.PtrToNullUUID(curUserID)
	}

	// Succeeded
	return nil
}

// dbLoad loads the config from the given table, with an optional key filter
func (cs *ConfigStore) dbLoad(tableName string, extraKeyCols goqu.Ex) error {
	// Prevent concurrent access
	cs.mu.Lock()
	defer cs.mu.Unlock()

	// Init the config with the defaults
	items, err := cs.defaults()
	if err != nil {
		return err
	}
	cs.items = items

	// Query the data
	rows, err := db.Select(db.Dialect().
		From(goqu.T(tableName)).
		Select("key", "value", "ts_updated", "user_updated").
		Where(extraKeyCols))
	if err != nil {
		logger.Errorf("ConfigStore.Load: Select() failed: %v", err)
		return err
	}
	defer rows.Close()

	// Fetch the items
	for rows.Next() {
		var key data.DynConfigItemKey
		var value string
		var updatedTime time.Time
		var userUpdated uuid.NullUUID
		if err := rows.Scan(&key, &value, &updatedTime, &userUpdated); err != nil {
			logger.Errorf("ConfigStore.Load: rows.Scan() failed: %v", err)
			return err
		}

		// If the item is a valid one
		if ci, ok := cs.items[key]; ok && value != ci.DefaultValue {
			ci.Value = value
			ci.UpdatedTime = updatedTime
			ci.UserUpdated = userUpdated
		}
	}

	// Verify Next() didn't error
	if err := rows.Err(); err != nil {
		return translateDBErrors(err)
	}

	// Succeeded
	return nil
}

// dbSave writes the config into the given table, with an optional key filter
func (cs *ConfigStore) dbSave(tableName string, extraKeyCols goqu.Ex) error {
	// Prevent concurrent access
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	// Make sure the config is initialised
	if cs.items == nil {
		return errConfigUninitialised
	}

	// Make a key column spec
	keyCols := "key"
	for k := range extraKeyCols {
		keyCols = k + "," + keyCols
	}

	// Iterate the items, building up a multirow insert statement
	var rows []any
	for key, ci := range cs.items {
		// Prepare a row
		row := goqu.Record{
			"key":          key,
			"value":        ci.Value,
			"ts_updated":   ci.UpdatedTime,
			"user_updated": ci.UserUpdated,
		}

		// Add the predefined key columns (if any)
		for k, v := range extraKeyCols {
			row[k] = v
		}

		// Accumulate the rows
		rows = append(rows, row)
	}

	// Remove and reinsert all items in scope
	return translateDBErrors(
		db.Execute(db.Dialect().Delete(tableName).Where(extraKeyCols)),
		db.Execute(db.Dialect().Insert(tableName).Rows(rows...)))
}

// get returns a configuration item by its key, without locking
func (cs *ConfigStore) get(key data.DynConfigItemKey) (*data.DynConfigItem, error) {
	// Make sure the config is initialised
	if cs.items == nil {
		return nil, errConfigUninitialised
	}

	// Look the key up
	if ci, ok := cs.items[key]; ok {
		// Succeeded
		return ci, nil
	}
	return nil, fmt.Errorf("config key %q is unknown", key)
}

//----------------------------------------------------------------------------------------------------------------------

// instanceConfigStore is an extension to ConfigStore that stores global dynamic config
type instanceConfigStore struct {
	ConfigStore
}

func (cs *instanceConfigStore) Load() error {
	return cs.dbLoad("cm_configuration", goqu.Ex{})
}

func (cs *instanceConfigStore) Save() error {
	return cs.dbSave("cm_configuration", goqu.Ex{})
}

//----------------------------------------------------------------------------------------------------------------------

// getInstanceDefaults returns a clone of the default config
func getInstanceDefaults() (map[data.DynConfigItemKey]*data.DynConfigItem, error) {
	m := make(map[data.DynConfigItemKey]*data.DynConfigItem, len(data.DefaultDynInstanceConfig))
	for key, item := range data.DefaultDynInstanceConfig {
		m[key] = &data.DynConfigItem{
			Value:        item.DefaultValue,
			Datatype:     item.Datatype,
			DefaultValue: item.DefaultValue,
			Section:      item.Section,
			Min:          item.Min,
			Max:          item.Max,
		}
	}
	return m, nil
}

// newDynConfigService creates a new DynConfigService
func newDynConfigService() *dynConfigService {
	return &dynConfigService{
		s: &instanceConfigStore{ConfigStore{defaults: getInstanceDefaults}},
	}
}

// dynConfigService is a blueprint DynConfigService implementation
type dynConfigService struct {
	s *instanceConfigStore
}

func (svc *dynConfigService) Get(key data.DynConfigItemKey) (*data.DynConfigItem, error) {
	return svc.s.Get(key)
}

func (svc *dynConfigService) GetAll() (map[data.DynConfigItemKey]*data.DynConfigItem, error) {
	logger.Debug("dynConfigService.GetAll()")
	return svc.s.GetAll()
}

func (svc *dynConfigService) GetBool(key data.DynConfigItemKey) bool {
	// First try to fetch the actual value
	if i, err := svc.Get(key); err == nil {
		return i.AsBool()
	}

	// Fall back to the item's default value on error
	if item, ok := data.DefaultDynInstanceConfig[key]; ok {
		return item.DefaultValue == "true"
	}

	// Invalid key passed
	return false
}

func (svc *dynConfigService) GetInt(key data.DynConfigItemKey) int {
	// First try to fetch the actual value
	if i, err := svc.Get(key); err == nil {
		return i.AsInt()
	}

	// Fall back to the item's default value on error
	if item, ok := data.DefaultDynInstanceConfig[key]; ok {
		return item.AsInt()
	}

	// Invalid key passed
	return -1
}

func (svc *dynConfigService) Load() error {
	logger.Debug("dynConfigService.Load()")
	return svc.s.Load()
}

func (svc *dynConfigService) Reset() error {
	logger.Debug("dynConfigService.Reset()")
	// Reset the config
	if err := svc.s.Reset(); err != nil {
		return err
	}

	// Save the updated values
	if err := svc.s.Save(); err != nil {
		return err
	}

	// Flush any cached domain config to enforce any new defaults
	TheDomainConfigService.ResetCache()

	// Succeeded
	return nil
}

func (svc *dynConfigService) Update(curUserID *uuid.UUID, vals map[data.DynConfigItemKey]string) error {
	logger.Debugf("dynConfigService.Update(%s, %#v)", curUserID, vals)

	// Update the specified items
	if err := svc.s.Update(curUserID, vals); err != nil {
		return err
	}

	// Save the config
	if err := svc.s.Save(); err != nil {
		return err
	}

	// Flush any cached domain config to enforce any new defaults
	TheDomainConfigService.ResetCache()

	// Succeeded
	return nil
}
