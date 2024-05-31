package plugins

import (
	"fmt"
	"github.com/op/go-logging"
	"gitlab.com/comentario/comentario/extend"
	"gitlab.com/comentario/comentario/internal/api/restapi/handlers"
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
	extend.ComentarioPluginHost
	// Init initialises the manager
	Init() error
	// ServeHandler returns an HTTP handler for processing requests
	ServeHandler(next http.Handler) http.Handler
}

// logger represents a package-wide logger instance
var logger = logging.MustGetLogger("plugins")

// ThePluginManager is a global plugin manager instance
var ThePluginManager PluginManager = &pluginManager{
	plugs: map[string]extend.ComentarioPlugin{},
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

// pluginManager is a blueprint PluginManager implementation
type pluginManager struct {
	plugs map[string]extend.ComentarioPlugin // Map of loaded plugin implementations by the path served
}

func (pm *pluginManager) AuthenticateBySessionCookie(value string) (extend.Principal, error) {
	// User implements Principal, so simply hand over to the cookie auth handler
	return handlers.AuthUserByCookieHeader(value)
}

func (pm *pluginManager) CreateLogger(module string) extend.Logger {
	return &pluginLogger{l: logging.MustGetLogger(module)}
}

func (pm *pluginManager) Init() error {
	// Don't bother if plugin dir not provided
	if config.ServerConfig.PluginPath == "" {
		logger.Info("Plugin directory isn't specified, not looking for plugins")
		return nil
	}

	// Scan for plugins
	if cnt, err := pm.scanDir(config.ServerConfig.PluginPath); err != nil {
		return err
	} else {
		logger.Infof("Loaded %d plugins", cnt)
	}

	// Succeeded
	return nil
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
				if plug := pm.findByPath(p, util.APIPath); plug != nil {
					r.URL.Path = "/" + p
					plug.APIHandler().ServeHTTP(w, r)
					return
				}
			}

			// Not an API call. Check if it's a statics request: resource can only be served via GET
			if r.Method == http.MethodGet {
				if plug := pm.findByPath(p, ""); plug != nil {
					r.URL.Path = "/" + p
					plug.StaticHandler().ServeHTTP(w, r)
					return
				}
			}
		}

		// Not handled, pass on to the next handler
		next.ServeHTTP(w, r)
	})
}

// findByPath returns a plugin whose path (with the optional prefix) starts the provided path, or nil if nothing found
func (pm *pluginManager) findByPath(requestPath, prefix string) extend.ComentarioPlugin {
	for plugPath, plug := range pm.plugs {
		// If the plugin can handle this path
		if strings.HasPrefix(requestPath, prefix+plugPath) {
			return plug
		}
	}
	return nil
}

// loadPlugin loads a plugin lib
func (pm *pluginManager) loadPlugin(filename string) (extend.ComentarioPlugin, error) {
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
	hPtr, ok := h.(*extend.ComentarioPlugin)
	if !ok {
		return nil, fmt.Errorf("symbol PluginImpl from plugin %q doesn't implement ComentarioPlugin", filename)
	}

	// Initialise the plugin
	if err := (*hPtr).Init(pm); err != nil {
		return nil, fmt.Errorf("failed to Init() plugin %q: %w", filename, err)
	}

	// Succeeded
	return *hPtr, nil
}

// scanDir scans the plugin directory recursively, loading every discovered plugin and returning the number of plugins
// found
func (pm *pluginManager) scanDir(dir string) (int, error) {
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
		plug, err := pm.loadPlugin(fullPath)
		if err != nil {
			return 0, err
		}

		// Store the implementation in the map
		cnt++
		pPath := strings.TrimSuffix(strings.TrimPrefix(plug.Path(), "/"), "/") + "/"
		logger.Infof("Loaded plugin library %s (serve path: %q)", fullPath, pPath)
		pm.plugs[pPath] = plug
	}

	// Succeeded
	return cnt, nil
}
