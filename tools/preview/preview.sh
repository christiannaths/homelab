#!/usr/bin/env bash
# Deploys, resets and removes previews on Fly.io (ADR-PLAT-008), as the preview workflows in
# .github/workflows/ run it. The preview's name is the only input; the rest comes from the
# repository settings that tools/preview/setup.sh writes.
#
#   tools/preview/preview.sh deploy <name>   create or update the preview, its DNS and certificate
#   tools/preview/preview.sh reset <name>    wipe its data and start it fresh
#   tools/preview/preview.sh remove <name>   destroy it with its volume, certificate and DNS records
#
# Needs flyctl (as `flyctl`, the name every install provides), curl and jq, and FLY_API_TOKEN, FLY_ORG, FLY_REGION, PREVIEW_DOMAIN, DNSIMPLE_TOKEN
# and DNSIMPLE_ACCOUNT_ID in the environment.
set -euo pipefail

command=${1:?Usage: preview.sh deploy|reset|remove <name>}
name=${2:?Usage: preview.sh deploy|reset|remove <name>}
if [[ ! "$name" =~ ^(staging|pr-[0-9]+)$ ]]; then
  echo "A preview is named staging or pr-<number>, not $name." >&2
  exit 1
fi
: "${FLY_API_TOKEN:?}" "${FLY_ORG:?}" "${FLY_REGION:?}" "${PREVIEW_DOMAIN:?}"
: "${DNSIMPLE_TOKEN:?}" "${DNSIMPLE_ACCOUNT_ID:?}"

root=$(cd "$(dirname "$0")/../.." && pwd)
domain="$name.$PREVIEW_DOMAIN"
# Fly app names are shared by every Fly user, so the domain makes them unique.
app="$name-${PREVIEW_DOMAIN//./-}"
certificate="*.$domain"

# Exits when Fly can't be asked, rather than taking that for an app that doesn't exist.
app_exists() {
  local apps
  apps=$(flyctl apps list --org "$FLY_ORG" --json) || {
    echo "Listing the Fly organization's apps failed." >&2
    exit 1
  }
  jq -e --arg app "$app" 'any(.[]; .Name == $app)' <<<"$apps" >/dev/null
}

# ── DNSimple ──────────────────────────────────────────────────────────────

dnsimple() { # method path [json body]
  curl -fsS -X "$1" -H "Authorization: Bearer $DNSIMPLE_TOKEN" -H "Content-Type: application/json" \
    "https://api.dnsimple.com/v2/$DNSIMPLE_ACCOUNT_ID$2" ${3:+--data "$3"}
}

# The DNSimple zone that holds the preview domain: the longest of the account's zones it ends with.
zone() {
  dnsimple GET "/zones?per_page=100" | jq -r --arg domain "$PREVIEW_DOMAIN" '
    [.data[].name | select(. as $zone | $domain == $zone or ($domain | endswith("." + $zone)))]
    | sort_by(length) | last // error("No DNSimple zone holds \($domain)")'
}

# A record's name within the zone: "*.pr-81.homelab" for *.pr-81.homelab.ops.bz in ops.bz.
relative() { local full=$1 zone=$2; [[ "$full" == "$zone" ]] && echo "" || echo "${full%."$zone"}"; }

delete_records() { # zone name [type]
  local id
  for id in $(dnsimple GET "/zones/$1/records?name=$(jq -rn --arg n "$2" '$n|@uri')&per_page=100" |
    jq -r --arg type "${3:-}" '.data[] | select($type == "" or .type == $type) | .id'); do
    dnsimple DELETE "/zones/$1/records/$id" >/dev/null
  done
}

# Makes the record the only one with its name, since a CNAME can't share a name with another.
set_record() { # zone name type content
  # Left alone when already right, so a redeploy never takes the address away for a moment.
  if dnsimple GET "/zones/$1/records?name=$(jq -rn --arg n "$2" '$n|@uri')&per_page=100" |
    jq -e --arg type "$3" --arg content "$4" \
      '.data | length == 1 and .[0].type == $type and .[0].content == $content' >/dev/null; then
    return
  fi
  delete_records "$1" "$2"
  dnsimple POST "/zones/$1/records" "$(jq -n --arg name "$2" --arg type "$3" --arg content "$4" \
    '{name: $name, type: $type, content: $content, ttl: 60}')" >/dev/null
  echo "DNS: $3 ${2:-@}.$1 → $4"
}

# ── Commands ──────────────────────────────────────────────────────────────

deploy() {
  if ! app_exists; then
    echo "Creating the Fly app $app…"
    flyctl apps create "$app" --org "$FLY_ORG"
  fi
  # VoidAuth encrypts its secrets with this key, so it is made once per preview and kept. It is
  # checked apart from the app, since a run cancelled between the two leaves an app without it.
  if ! flyctl secrets list --app "$app" --json | jq -e 'any(.[]; .name == "STORAGE_KEY")' >/dev/null; then
    # Read from stdin, so it never appears in a command line or the public workflow log.
    flyctl secrets import --app "$app" --stage <<<"STORAGE_KEY=$(openssl rand -hex 24)"
  fi
  if ! flyctl volumes list --app "$app" --json | jq -e 'length > 0' >/dev/null; then
    flyctl volumes create data --app "$app" --region "$FLY_REGION" --size 1 --yes
  fi

  config="$(mktemp -d)/fly.toml"
  sed -e "s/{{APP}}/$app/" -e "s/{{REGION}}/$FLY_REGION/" \
    -e "s/{{NAME}}/$name/" -e "s/{{DOMAIN}}/$PREVIEW_DOMAIN/" \
    "$root/tools/preview/fly.toml" >"$config"
  flyctl deploy "$root" --config "$config" --dockerfile "$root/tools/preview/Dockerfile" \
    --app "$app" --remote-only --ha=false --yes

  # A new app gets its addresses on its first deploy; these are for one that lost them.
  if flyctl ips list --app "$app" --json | jq -e 'length == 0' >/dev/null; then
    flyctl ips allocate-v6 --app "$app"
    flyctl ips allocate-v4 --shared --app "$app"
  fi

  local cert target zone_name
  if ! flyctl certs list --app "$app" --json | jq -e --arg cert "$certificate" 'any(.. | strings; . == $cert)' >/dev/null; then
    flyctl certs add "$certificate" --app "$app" >/dev/null
  fi
  # The CNAME target Fly validates the wildcard through, read without relying on the JSON's
  # layout, which changed between flyctl versions.
  cert=$(flyctl certs check "$certificate" --app "$app" --json)
  target=$(jq -r '[.. | strings | select(test("\\.flydns\\.net\\.?$"))][0] // empty' <<<"$cert")
  if [[ -z "$target" ]]; then
    echo "Fly gave no flydns.net validation target for $certificate:" >&2
    echo "$cert" >&2
    exit 1
  fi

  zone_name=$(zone)
  set_record "$zone_name" "$(relative "*.$domain" "$zone_name")" CNAME "$app.fly.dev"
  set_record "$zone_name" "$(relative "_acme-challenge.$domain" "$zone_name")" CNAME "${target%.}"

  # Done once a browser would accept the certificate, whatever Fly's status field is called.
  echo "Waiting for the certificate for $certificate…"
  for _ in $(seq 1 60); do
    if curl -fsS --max-time 30 -o /dev/null "https://login.$domain/" 2>/dev/null; then
      echo "The preview is at https://login.$domain/"
      return
    fi
    sleep 10
  done
  echo "https://login.$domain/ did not answer with a valid certificate within 10 minutes:" >&2
  flyctl certs check "$certificate" --app "$app" >&2 || true
  exit 1
}

reset() {
  if ! app_exists; then
    echo "There is no preview named $name (no Fly app $app)." >&2
    exit 1
  fi
  # A stopped machine has nothing to reset; starting it runs the preview first.
  local machine
  machine=$(flyctl machines list --app "$app" --json | jq -r '.[0].id // empty')
  if [[ -z "$machine" ]]; then
    echo "The preview $name has no machine; deploy it first." >&2
    exit 1
  fi
  flyctl machines start "$machine" --app "$app" >/dev/null 2>&1 || true
  local ready=""
  for _ in $(seq 1 30); do
    if flyctl ssh console --app "$app" --machine "$machine" --command "test -f /data/ready" >/dev/null 2>&1; then
      ready=yes
      break
    fi
    sleep 5
  done
  if [[ -z "$ready" ]]; then
    echo "The preview $name did not come up within 150 seconds, so it was not reset." >&2
    exit 1
  fi
  flyctl ssh console --app "$app" --machine "$machine" --command "node /repo/tools/preview/start.ts reset"
}

remove() {
  if [[ "$name" == staging ]]; then
    echo "Staging is never removed; reset it instead." >&2
    exit 1
  fi
  if app_exists; then
    # Destroying the app destroys its machine, volume and certificate too.
    flyctl apps destroy "$app" --yes
  else
    echo "There is no Fly app $app; removing any DNS records left."
  fi
  local zone_name
  zone_name=$(zone)
  delete_records "$zone_name" "$(relative "*.$domain" "$zone_name")"
  delete_records "$zone_name" "$(relative "_acme-challenge.$domain" "$zone_name")"
  echo "Removed the preview $name."
}

case "$command" in
  deploy) deploy ;;
  reset) reset ;;
  remove) remove ;;
  *)
    echo "Unknown command $command. Use deploy, reset or remove." >&2
    exit 1
    ;;
esac
