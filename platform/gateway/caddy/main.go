// The homelab gateway: Caddy with its standard modules and the App switcher (ADR-PLAT-004).
package main

import (
	caddycmd "github.com/caddyserver/caddy/v2/cmd"

	_ "github.com/caddyserver/caddy/v2/modules/standard"
	_ "github.com/christiannaths/homelab/platform/gateway/caddy/switcher"
)

func main() {
	caddycmd.Main()
}
