package plugins

import (
	"fmt"
	"github.com/op/go-logging"
	complugin "gitlab.com/comentario/comentario/extend/plugin"
	"gitlab.com/comentario/comentario/internal/api/auth"
	"gitlab.com/comentario/comentario/internal/api/models"
	"gitlab.com/comentario/comentario/internal/config"
	"gitlab.com/comentario/comentario/internal/util"
	"net/http"
	"os"
	"path"
	"plugin"
	"strings"
)

// PluginManager is a service interface for managing plugins
type PluginManager interface {
	complugin.HostApp
	// Init initialises the manager
	Init() error
	// PluginConfig returns configuration of all registered plugins as DTOs
	PluginConfig() []*models.PluginConfig
	// ServeHandler returns an HTTP handler for processing requests
	ServeHandler(next http.Handler) http.Handler
}

// logger represents a package-wide logger instance
var logger = logging.MustGetLogger("plugins")

// ThePluginManager is a global plugin manager instance
var ThePluginManager PluginManager = &pluginManager{
	plugs: map[string]*pluginEntry{},
}

//----------------------------------------------------------------------------------------------------------------------

// pluginLogger is a Logger implementation
type pluginLogger struct {
	l *logging.Logger
}

func (p *pluginLogger) Error(args ...any) {
	p.l.Error(args...)
}

func (p *pluginLogger) Errorf(format string, args ...any) {
	p.l.Errorf(format, args...)
}

func (p *pluginLogger) Warning(args ...any) {
	p.l.Warning(args...)
}

func (p *pluginLogger) Warningf(format string, args ...any) {
	p.l.Warningf(format, args...)
}

func (p *pluginLogger) Info(args ...any) {
	p.l.Info(args...)
}

func (p *pluginLogger) Infof(format string, args ...any) {
	p.l.Infof(format, args...)
}

func (p *pluginLogger) Debug(args ...any) {
	p.l.Debug(args...)
}

func (p *pluginLogger) Debugf(format string, args ...any) {
	p.l.Debugf(format, args...)
}

//----------------------------------------------------------------------------------------------------------------------

// pluginEntry groups a loaded plugin's info
type pluginEntry struct {
	id string                     // Unique plugin ID
	p  complugin.ComentarioPlugin // Plugin implementation
	c  *complugin.Config          // Configuration obtained from the plugin
}

// ToDTO converts this model into a DTO model
func (pe pluginEntry) ToDTO() *models.PluginConfig {
	// Convert plugs to DTOs
	var plugs []*models.PluginUIPlugConfig
	for _, p := range pe.c.UIPlugs {
		// Convert the plug's labels into DTO's
		var labels []*models.PluginUILabel
		for _, l := range p.Labels {
			labels = append(labels, &models.PluginUILabel{Language: l.Language, Text: l.Text})
		}

		// Convert the plug itself into a DTO
		plugs = append(plugs, &models.PluginUIPlugConfig{
			ComponentTag: p.ComponentTag,
			Labels:       labels,
			Location:     string(p.Location),
			Path:         p.Path,
		})
	}

	// Convert resources to DTOs
	var resources []*models.PluginUIResourceConfig
	for _, r := range pe.c.UIResources {
		resources = append(resources, &models.PluginUIResourceConfig{
			Rel:  r.Rel,
			Type: r.Type,
			URL:  r.URL,
		})
	}

	return &models.PluginConfig{
		ID:          pe.id,
		Path:        pe.c.Path,
		UIPlugs:     plugs,
		UIResources: resources,
	}
}

// pluginManager is a blueprint PluginManager implementation
type pluginManager struct {
	plugs map[string]*pluginEntry // Map of loaded plugin entries by ID
}

func (pm *pluginManager) AuthenticateBySessionCookie(value string) (complugin.Principal, error) {
	// User implements Principal, so simply hand over to the cookie auth handler
	return auth.AuthenticateUserByCookieHeader(value)
}

func (pm *pluginManager) CreateLogger(module string) complugin.Logger {
	return &pluginLogger{l: logging.MustGetLogger(module)}
}

func (pm *pluginManager) Init() error {
	// Don't bother if plugin dir not provided
	if config.ServerConfig.PluginPath == "" {
		logger.Info("Plugin directory isn't specified, not looking for plugins")
		return nil
	}

	// Scan for plugins
	if cnt, err := pm.scanDir(path.Clean(config.ServerConfig.PluginPath)); err != nil {
		return err
	} else if cnt == 0 {
		logger.Info("No plugins found")
	} else {
		logger.Infof("Loaded %d plugins", cnt)
	}

	// Succeeded
	return nil
}

func (pm *pluginManager) PluginConfig() []*models.PluginConfig {
	var res []*models.PluginConfig

	// Iterate over plugins and convert their configs into DTOs
	for _, pe := range pm.plugs {
		res = append(res, pe.ToDTO())
	}
	return res
}

func (pm *pluginManager) ServeHandler(next http.Handler) http.Handler {
	// Pass through if no plugins available
	if len(pm.plugs) == 0 {
		return next
	}

	// Make a new handler
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify the URL is a subpath of base
		if ok, p := config.ServerConfig.PathOfBaseURL(r.URL.Path); ok {
			// Check if it's a plugin API call
			if strings.HasPrefix(p, util.APIPath) {
				if pe := pm.findByPath(p, util.APIPath); pe != nil {
					r.URL.Path = "/" + p
					pe.p.APIHandler().ServeHTTP(w, r)
					return
				}
			}

			// Not an API call. Check if it's a statics request: resource can only be served via GET/HEAD/OPTIONS
			if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
				if pe := pm.findByPath(p, ""); pe != nil {
					r.URL.Path = "/" + p
					pe.p.StaticHandler().ServeHTTP(w, r)
					return
				}
			}
		}

		// Not handled, pass on to the next handler
		next.ServeHTTP(w, r)
	})
}

// findByPath returns a plugin whose path (with the optional prefix) starts the provided path, or nil if nothing found
func (pm *pluginManager) findByPath(requestPath, prefix string) *pluginEntry {
	for _, plug := range pm.plugs {
		// If the plugin can handle this path
		if strings.HasPrefix(requestPath, prefix+plug.c.Path+"/") {
			return plug
		}
	}
	return nil
}

// initPlugin initialises the given plugin and fetches its config
func (pm *pluginManager) initPlugin(p complugin.ComentarioPlugin, secrets complugin.YAMLDecoder) (*complugin.Config, error) {
	// Initialise the plugin
	if err := p.Init(pm, secrets); err != nil {
		return nil, err
	}

	// Fetch (a copy of) the config
	cfg := p.Config()

	// Correct the path by removing any leading and trailing slash
	cfg.Path = strings.Trim(cfg.Path, "/")
	return &cfg, nil
}

// loadPlugin loads a plugin lib and returns either a complete plugin entry, or nil if the plugin is explicitly disabled
func (pm *pluginManager) loadPlugin(filename string) (*pluginEntry, error) {
	// Try to load the plugin library
	plugLib, err := plugin.Open(filename)
	if err != nil {
		return nil, fmt.Errorf("failed to load plugin file %q: %w", filename, err)
	}

	// Look up the implementation
	h, err := plugLib.Lookup("PluginImpl")
	if err != nil {
		return nil, fmt.Errorf("failed to find symbol PluginImpl in file %q: %w", filename, err)
	}

	// Fetch the service interface (hPtr is a pointer, because Lookup always returns a pointer to symbol)
	hPtr, ok := h.(*complugin.ComentarioPlugin)
	if !ok {
		return nil, fmt.Errorf("symbol PluginImpl from plugin %q doesn't implement ComentarioPlugin", filename)
	}

	// Fetch plugin ID
	id := (*hPtr).ID()

	// Find the plugin's secrets config
	secConf := config.SecretsConfig.Plugins[id]

	// Check if the plugin is disabled
	var d config.Disableable
	if err := secConf.Decode(&d); err != nil {
		return nil, fmt.Errorf("error decoding secrets config for plugin %q: %w", filename, err)
	} else if d.Disable {
		// Plugin disabled
		return nil, nil
	}

	// Initialise the plugin
	cfg, err := pm.initPlugin(*hPtr, &secConf)
	if err != nil {
		return nil, fmt.Errorf("failed to initialise plugin %q: %w", filename, err)
	}

	// Succeeded
	return &pluginEntry{id: id, p: *hPtr, c: cfg}, nil
}

// scanDir scans the plugin directory recursively, loading every discovered plugin and returning the number of plugins
// found
func (pm *pluginManager) scanDir(dir string) (int, error) {
	logger.Debugf("Scanning directory %s", dir)

	// Scan the plugin dir
	files, err := os.ReadDir(dir)
	if err != nil {
		return 0, err
	}

	// Scan the plugins
	cnt := 0
	for _, file := range files {
		// Only consider .so files
		if !strings.HasSuffix(file.Name(), ".so") {
			continue
		}

		// Dive into directories
		fullPath := path.Join(dir, file.Name())
		if file.IsDir() {
			if i, err := pm.scanDir(fullPath); err != nil {
				return 0, err
			} else {
				cnt += i
			}
			continue
		}

		// Try to load the plugin
		pe, err := pm.loadPlugin(fullPath)
		if err != nil {
			return 0, err

		} else if pe == nil {
			// If a nil is returned, the plugin is explicitly disabled in secrets
			logger.Infof("Plugin library %s has been disabled in the secrets config", fullPath)
			continue
		}

		// Make sure the ID is unique
		if _, ok := pm.plugs[pe.id]; ok {
			return 0, fmt.Errorf("duplicate plugin ID %q returned by library %s", pe.id, fullPath)
		}

		// Store the implementation
		cnt++
		logger.Infof("Loaded plugin library %s (ID: %s, serve path: %q)", fullPath, pe.id, pe.c.Path)
		pm.plugs[pe.id] = pe
	}

	// Succeeded
	return cnt, nil
}
