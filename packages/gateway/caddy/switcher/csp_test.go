package switcher

import "testing"

const (
	testHash    = "'sha256-SWITCHER'"
	testHomelab = "*.home.test:8443"
)

func TestAllowSwitcher(t *testing.T) {
	cases := []struct{ name, policy, want string }{
		{
			"a script list gains the hash",
			"script-src 'self'",
			"script-src 'self' 'sha256-SWITCHER'",
		},
		{
			"hashes and 'strict-dynamic', as VoidAuth's page has",
			"script-src 'strict-dynamic' 'sha256-A=' https: 'unsafe-inline';object-src 'none';base-uri 'self';",
			"script-src 'strict-dynamic' 'sha256-A=' https: 'unsafe-inline' 'sha256-SWITCHER'; object-src 'none'; base-uri 'self'",
		},
		{
			"'unsafe-inline' alone already lets it run, and a hash would stop the page's own",
			"script-src 'self' 'unsafe-inline'",
			"script-src 'self' 'unsafe-inline'",
		},
		{
			"script-src-elem is what limits script elements",
			"script-src 'self'; script-src-elem 'self'",
			"script-src 'self'; script-src-elem 'self' 'sha256-SWITCHER'",
		},
		{
			"default-src alone gets its own script, connect and image lists",
			"default-src 'self'",
			"default-src 'self'; script-src 'self' 'sha256-SWITCHER'; connect-src 'self' *.home.test:8443; img-src 'self' *.home.test:8443 data:",
		},
		{
			"'none' gives way",
			"script-src 'none'; connect-src 'none'",
			"script-src 'sha256-SWITCHER'; connect-src *.home.test:8443",
		},
		{
			"connect and image lists gain the homelab's apps, and images data:",
			"connect-src 'self'; img-src 'self' data:",
			"connect-src 'self' *.home.test:8443; img-src 'self' data: *.home.test:8443",
		},
		{
			"a list that allows everywhere gains only data:, which * does not cover",
			"connect-src *; img-src *",
			"connect-src *; img-src * data:",
		},
		{
			"a policy that limits nothing the switcher does is left as it is",
			"frame-ancestors 'self';  object-src 'none'",
			"frame-ancestors 'self';  object-src 'none'",
		},
		{
			"every policy in a header",
			"script-src 'self', img-src 'self'",
			"script-src 'self' 'sha256-SWITCHER', img-src 'self' *.home.test:8443 data:",
		},
	}
	for _, c := range cases {
		if got := allowSwitcher(c.policy, testHash, testHomelab); got != c.want {
			t.Errorf("%s:\n got %q\nwant %q", c.name, got, c.want)
		}
	}
}

func TestAllowInMetas(t *testing.T) {
	cases := []struct{ name, page, want string }{
		{
			"a meta's policy gains the hash",
			`<head><meta http-equiv="Content-Security-Policy" content="script-src 'self'"><meta charset="utf-8">`,
			`<head><meta http-equiv="Content-Security-Policy" content="script-src 'self' 'sha256-SWITCHER'"><meta charset="utf-8">`,
		},
		{
			"either attribute first, any case and quotes",
			`<META CONTENT='script-src &apos;self&apos;' HTTP-EQUIV=content-security-policy>`,
			`<META CONTENT="script-src 'self' 'sha256-SWITCHER'" HTTP-EQUIV=content-security-policy>`,
		},
		{
			"other metas are left alone",
			`<meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="script-src">`,
			`<meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="script-src">`,
		},
		{
			"a report-only meta means nothing, so it is left alone",
			`<meta http-equiv="Content-Security-Policy-Report-Only" content="script-src 'self'">`,
			`<meta http-equiv="Content-Security-Policy-Report-Only" content="script-src 'self'">`,
		},
	}
	for _, c := range cases {
		if got := string(allowInMetas([]byte(c.page), testHash, testHomelab)); got != c.want {
			t.Errorf("%s:\n got %q\nwant %q", c.name, got, c.want)
		}
	}
}

func TestHomelabSource(t *testing.T) {
	cases := map[string]string{
		"accounts.home.test:8443":      "*.home.test:8443",
		"accounts.pr-1.homelab.ops.bz": "*.pr-1.homelab.ops.bz",
		"notes.homelab.localhost:8443": "*.homelab.localhost:8443",
	}
	for host, want := range cases {
		if got := homelabSource(host); got != want {
			t.Errorf("homelabSource(%q) = %q, want %q", host, got, want)
		}
	}
}
