package switcher

import (
	"html"
	"regexp"
	"strings"
)

// allowSwitcher returns a Content-Security-Policy value that also lets the switcher run: its script,
// by hash, its requests to the accounts site and the other apps' icons, by the homelab's wildcard
// source, and the icons it keeps, as data: addresses.
// A header may hold several policies, separated by commas, and each must allow it. A policy that
// does not limit something is left to allow it.
func allowSwitcher(value, hash, homelab string) string {
	policies := strings.Split(value, ",")
	for i, policy := range policies {
		policies[i] = allowInPolicy(policy, hash, homelab)
	}
	return strings.Join(policies, ",")
}

type directive struct {
	name    string
	sources []string
}

func allowInPolicy(policy, hash, homelab string) string {
	var directives []*directive
	byName := map[string]*directive{}
	for _, part := range strings.Split(policy, ";") {
		fields := strings.Fields(part)
		if len(fields) == 0 {
			continue
		}
		d := &directive{name: strings.ToLower(fields[0]), sources: fields[1:]}
		// The first of a repeated directive is the one that counts.
		if byName[d.name] == nil {
			byName[d.name] = d
		}
		directives = append(directives, d)
	}
	// effective finds the directive that limits a kind of request, from the most to the least
	// specific, the last being default-src. A fallback to default-src becomes a directive of its
	// own, named for the kind, so adding to it widens nothing else.
	effective := func(names ...string) *directive {
		for _, name := range names[:len(names)-1] {
			if d := byName[name]; d != nil {
				return d
			}
		}
		fallback := byName[names[len(names)-1]]
		if fallback == nil {
			return nil
		}
		own := &directive{name: names[len(names)-2], sources: append([]string(nil), fallback.sources...)}
		byName[own.name] = own
		directives = append(directives, own)
		return own
	}
	changed := false
	if d := effective("script-src-elem", "script-src", "default-src"); d != nil && !allowsInline(d.sources) {
		d.add(hash)
		changed = true
	}
	if d := effective("connect-src", "default-src"); d != nil && !d.has("*") {
		d.add(homelab)
		changed = true
	}
	// The icons it keeps for offline show as data: addresses, which * does not cover.
	if d := effective("img-src", "default-src"); d != nil {
		if !d.has("*") {
			d.add(homelab)
		}
		d.add("data:")
		changed = true
	}
	if !changed {
		return policy
	}
	parts := make([]string, len(directives))
	for i, d := range directives {
		parts[i] = strings.Join(append([]string{d.name}, d.sources...), " ")
	}
	// Keeps the separator's spacing, for a header with several policies.
	lead := policy[:len(policy)-len(strings.TrimLeft(policy, " "))]
	return lead + strings.Join(parts, "; ")
}

func (d *directive) has(source string) bool {
	for _, s := range d.sources {
		if strings.EqualFold(s, source) {
			return true
		}
	}
	return false
}

// add adds a source, which replaces 'none': 'none' allows nothing only while it is alone.
func (d *directive) add(source string) {
	if len(d.sources) == 1 && strings.EqualFold(d.sources[0], "'none'") {
		d.sources = nil
	}
	if !d.has(source) {
		d.sources = append(d.sources, source)
	}
}

// allowsInline says whether a script list already lets every inline script run. A hash there
// would turn that off: 'unsafe-inline' is ignored next to a hash, a nonce or 'strict-dynamic'.
func allowsInline(sources []string) bool {
	inline := false
	for _, s := range sources {
		lower := strings.ToLower(s)
		switch {
		case lower == "'unsafe-inline'":
			inline = true
		case lower == "'strict-dynamic'",
			strings.HasPrefix(lower, "'nonce-"),
			strings.HasPrefix(lower, "'sha256-"),
			strings.HasPrefix(lower, "'sha384-"),
			strings.HasPrefix(lower, "'sha512-"):
			return false
		}
	}
	return inline
}

var (
	metaTag    = regexp.MustCompile(`(?is)<meta\b[^>]*>`)
	cspEquiv   = regexp.MustCompile(`(?is)\bhttp-equiv\s*=\s*["']?content-security-policy(?:["'\s/>]|$)`)
	cspContent = regexp.MustCompile(`(?is)(\bcontent\s*=\s*)("[^"]*"|'[^']*')`)
)

// allowInMetas does what allowSwitcher does for each policy a page sets in a <meta> tag.
func allowInMetas(page []byte, hash, homelab string) []byte {
	return metaTag.ReplaceAllFunc(page, func(tag []byte) []byte {
		if !cspEquiv.Match(tag) {
			return tag
		}
		return cspContent.ReplaceAllFunc(tag, func(attribute []byte) []byte {
			parts := cspContent.FindSubmatch(attribute)
			quoted := string(parts[2])
			policy := html.UnescapeString(quoted[1 : len(quoted)-1])
			allowed := allowSwitcher(policy, hash, homelab)
			if allowed == policy {
				return attribute
			}
			escaped := strings.NewReplacer("&", "&amp;", `"`, "&quot;").Replace(allowed)
			return append(append([]byte(nil), parts[1]...), `"`+escaped+`"`...)
		})
	})
}

// homelabSource is a CSP source for every app under the homelab's parent domain, on the page's
// own scheme and port: an app is <app>.<parent>, and the accounts site is accounts.<parent>
// (ADR-PLAT-004).
func homelabSource(host string) string {
	_, parent, _ := strings.Cut(host, ".")
	return "*." + parent
}
