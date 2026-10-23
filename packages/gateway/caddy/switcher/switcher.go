// Package switcher adds the App switcher to every page the gateway passes on (ADR-PLAT-004), so
// no app, ours or bundled, installs anything for it.
package switcher

import (
	"bytes"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"errors"
	"mime"
	"net/http"
	"regexp"
	"strconv"

	"github.com/caddyserver/caddy/v2"
	"github.com/caddyserver/caddy/v2/caddyconfig/caddyfile"
	"github.com/caddyserver/caddy/v2/caddyconfig/httpcaddyfile"
	"github.com/caddyserver/caddy/v2/modules/caddyhttp"
)

// The built App switcher (packages/app-switcher), which the Dockerfile copies in before building.
//
//go:embed switcher.js
var script []byte

func init() {
	caddy.RegisterModule(Switcher{})
	httpcaddyfile.RegisterHandlerDirective("homelab_switcher", parseCaddyfile)
	// After encode, so a page is compressed for the browser once the switcher is in it.
	httpcaddyfile.RegisterDirectiveOrder("homelab_switcher", httpcaddyfile.After, "encode")
}

// Switcher is the `homelab_switcher` directive. It has no options.
type Switcher struct {
	tag  []byte
	hash string
}

func (Switcher) CaddyModule() caddy.ModuleInfo {
	return caddy.ModuleInfo{
		ID:  "http.handlers.homelab_switcher",
		New: func() caddy.Module { return new(Switcher) },
	}
}

func (s *Switcher) Provision(caddy.Context) error {
	// Either would end the inline script early, or change how the page around it is read.
	lower := bytes.ToLower(script)
	if bytes.Contains(lower, []byte("</script")) || bytes.Contains(lower, []byte("<!--")) {
		return errors.New("the switcher's script can't go inline: it holds </script or <!--")
	}
	s.tag = append(append([]byte("<script>"), script...), "</script>"...)
	sum := sha256.Sum256(script)
	s.hash = "'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"
	return nil
}

func parseCaddyfile(h httpcaddyfile.Helper) (caddyhttp.MiddlewareHandler, error) {
	s := new(Switcher)
	return s, s.UnmarshalCaddyfile(h.Dispenser)
}

// UnmarshalCaddyfile takes no options.
func (s *Switcher) UnmarshalCaddyfile(d *caddyfile.Dispenser) error {
	d.Next()
	if d.NextArg() {
		return d.ArgErr()
	}
	return nil
}

func (s *Switcher) ServeHTTP(w http.ResponseWriter, r *http.Request, next caddyhttp.Handler) error {
	// Only a fetch that can be a whole page counts: a page inside another page (an iframe, an
	// object) would show a second switcher. An offline-first app's service worker saving its page
	// says Sec-Fetch-Dest: empty, and an older browser says nothing.
	if dest := r.Header.Get("Sec-Fetch-Dest"); r.Method != http.MethodGet ||
		(dest != "" && dest != "document" && dest != "empty") {
		return next.ServeHTTP(w, r)
	}
	// A page can only be changed uncompressed. Without the browser's Accept-Encoding, which encode
	// has read already, Caddy's proxy asks upstreams for gzip alone and undoes it itself.
	r.Header.Del("Accept-Encoding")

	buf := new(bytes.Buffer)
	rec := caddyhttp.NewResponseRecorder(w, buf, isPage)
	if err := next.ServeHTTP(rec, r); err != nil {
		return err
	}
	if !rec.Buffered() {
		return nil
	}
	// A page that limits scripts lets the switcher's run, and lets it reach Home and the other
	// apps' icons, whether the policy comes in a header or in the page.
	homelab := homelabSource(r.Host)
	header := w.Header()
	for _, name := range []string{"Content-Security-Policy", "Content-Security-Policy-Report-Only"} {
		policies := header.Values(name)
		for i, policy := range policies {
			policies[i] = allowSwitcher(policy, s.hash, homelab)
		}
	}
	page := insert(allowInMetas(buf.Bytes(), s.hash, homelab), s.tag)
	header.Set("Content-Length", strconv.Itoa(len(page)))
	// The page is no longer the upstream's, and a browser revalidating it would keep an old switcher.
	header.Del("ETag")
	header.Del("Last-Modified")
	w.WriteHeader(rec.Status())
	_, err := w.Write(page)
	return err
}

// isPage says whether a response is an HTML page with a body the switcher can go into.
func isPage(status int, header http.Header) bool {
	if status < 200 || status == http.StatusNoContent || status == http.StatusPartialContent ||
		(status >= 300 && status < 400) {
		return false
	}
	// A download is a file to keep, not a page to show.
	if disposition, _, _ := mime.ParseMediaType(header.Get("Content-Disposition")); disposition == "attachment" {
		return false
	}
	// A page compressed in a way the proxy can't undo passes through as it is, without the switcher.
	if encoding := header.Get("Content-Encoding"); encoding != "" && encoding != "identity" {
		return false
	}
	mediaType, _, err := mime.ParseMediaType(header.Get("Content-Type"))
	return err == nil && mediaType == "text/html"
}

var bodyEnd = regexp.MustCompile(`(?i)</body\s*>`)

// insert puts the tag before the page's last </body>, or at its end without one, where the
// browser puts it in the body too.
func insert(page, tag []byte) []byte {
	at := len(page)
	if found := bodyEnd.FindAllIndex(page, -1); len(found) > 0 {
		at = found[len(found)-1][0]
	}
	out := make([]byte, 0, len(page)+len(tag))
	out = append(out, page[:at]...)
	out = append(out, tag...)
	return append(out, page[at:]...)
}

var (
	_ caddy.Provisioner           = (*Switcher)(nil)
	_ caddyhttp.MiddlewareHandler = (*Switcher)(nil)
	_ caddyfile.Unmarshaler       = (*Switcher)(nil)
)
