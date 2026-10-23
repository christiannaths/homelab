package switcher

import (
	"net/http"
	"testing"
)

func TestInsertBeforeTheLastBodyEnd(t *testing.T) {
	cases := map[string]string{
		"<html><body><p>Hi</p></body></html>":          "<html><body><p>Hi</p>TAG</body></html>",
		"<body>'</body>' in a script</BODY >\n</html>": "<body>'</body>' in a scriptTAG</BODY >\n</html>",
		"<p>No body end": "<p>No body endTAG",
	}
	for page, want := range cases {
		if got := string(insert([]byte(page), []byte("TAG"))); got != want {
			t.Errorf("insert(%q) = %q, want %q", page, got, want)
		}
	}
}

func TestIsPage(t *testing.T) {
	cases := []struct {
		status      int
		contentType string
		encoding    string
		want        bool
	}{
		{200, "text/html; charset=utf-8", "", true},
		{404, "text/html", "", true},
		{200, "TEXT/HTML", "identity", true},
		{200, "text/html", "gzip", false},
		{200, "application/javascript", "", false},
		{200, "application/xhtml+xml", "", false},
		{200, "", "", false},
		{204, "text/html", "", false},
		{206, "text/html", "", false},
		{302, "text/html", "", false},
		{304, "text/html", "", false},
	}
	for _, c := range cases {
		header := http.Header{}
		header.Set("Content-Type", c.contentType)
		if c.encoding != "" {
			header.Set("Content-Encoding", c.encoding)
		}
		if got := isPage(c.status, header); got != c.want {
			t.Errorf("isPage(%d, %q, %q) = %v, want %v", c.status, c.contentType, c.encoding, got, c.want)
		}
	}
}
