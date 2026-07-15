# DNS for AI Discovery (DNS-AID)

DNS-AID lets agents discover an org's agent surface from DNS, via SVCB records
under an `_agents` namespace (IETF `draft-mozleywilliams-dnsop-dnsaid`, built on
SVCB/HTTPS records — RFC 9460). This doc is the human source of truth for the
records we publish; `scripts/dns-aid.mjs` (`pnpm dns:aid`) mirrors it — edit the
records in one place and keep the other in sync.

## Why these records look the way they do

compress-pro runs **100% in the browser** — files never leave the device, all
processing is WASM/WebCodecs — so there is **no server-side A2A/MCP agent
endpoint, and by design there can't be one.** The real "agent surface" is passive
HTTPS content served from `compress-pro.com`:

- `/.well-known/agent-skills/index.json` + the `using-compress-pro` SKILL.md
- `/llms.txt`, `/llms-full.txt`, and a `.md` twin of every page (`/<slug>.md`)
- in-page WebMCP tools (`navigator.modelContext`)

So the records honestly point at `compress-pro.com` with `alpn="h2,http/1.1"` (the
protocols the origin actually speaks). We do **not** advertise an `a2a`/`mcp`
protocol server that doesn't exist. This complements the HTTP-layer advertisement
already in place (the `Link` header in `_headers`, the `Content-Signal` in
`robots.txt`) by adding a DNS-layer pointer.

The isitagentready.com checker validates over DNS-over-HTTPS only — that
ServiceMode SVCB records with an `alpn` param exist under `_agents`; it does not
perform a live A2A/MCP handshake — so the honest records pass while claiming
nothing false.

## The records

Two ServiceMode SVCB records (RR type 64, SvcPriority `1`), **DNS-only / grey
cloud**, TTL 3600:

```dns
_index._agents.compress-pro.com. 3600 IN SVCB 1 compress-pro.com. alpn="h2,http/1.1" port=443
_a2a._agents.compress-pro.com.   3600 IN SVCB 1 compress-pro.com. alpn="h2,http/1.1" port=443
```

- `_index._agents` is the draft's canonical entry point (§3.2). `_a2a._agents`
  is the owner name in the SKILL.md example; we publish both because the checker
  doesn't disclose which one it probes first — this covers either.
- TargetName is the explicit FQDN `compress-pro.com.` (not `.`): the owner name
  is not the host we want agents to connect to.
- No `mandatory` and no experimental DNS-AID SvcParamKeys (`cap`, `well-known`,
  `bap`, …): those have no IANA-assigned numeric keys yet, so they can't be
  encoded as `keyNNNNN` today, and the checker doesn't need them.

## Publishing

DNS for this zone lives in Cloudflare (no DNS-as-code in the repo), so publishing
is a manual step run with Cloudflare credentials. Pick one path.

### Path A — script (recommended)

Needs a Cloudflare API token scoped to **Zone → DNS → Edit** on the
compress-pro.com zone.

```sh
pnpm dns:aid --dry-run                          # print intended records only
CLOUDFLARE_API_TOKEN=… pnpm dns:aid --dry-run   # show the create/update/unchanged diff
CLOUDFLARE_API_TOKEN=… pnpm dns:aid             # publish (idempotent upsert)
```

The zone id is resolved from the zone name automatically; set
`CLOUDFLARE_ZONE_ID` to skip the lookup. The upsert is idempotent — re-running
reports `unchanged` once the records match.

### Path B — Cloudflare dashboard

DNS → Records → **Add record**, once per record:

| Field    | `_index` record               | `_a2a` record                 |
| -------- | ----------------------------- | ----------------------------- |
| Type     | `SVCB`                        | `SVCB`                        |
| Name     | `_index._agents`              | `_a2a._agents`                |
| Priority | `1`                           | `1`                           |
| Target   | `compress-pro.com`            | `compress-pro.com`            |
| Value    | `alpn="h2,http/1.1" port=443` | `alpn="h2,http/1.1" port=443` |
| Proxy    | **DNS only** (grey cloud)     | **DNS only** (grey cloud)     |
| TTL      | Auto (3600)                   | Auto (3600)                   |

Cloudflare's SVCB editor rejects _quoted_ `ipv4hint`/`ipv6hint` values — enter
any IP hints unquoted (not used here; noted for future edits).

## DNSSEC (recommended, not required to pass)

The SKILL and draft (§1.1) recommend signing the discovery zone so validating
resolvers return authenticated data. On Cloudflare: DNS → Settings → **Enable
DNSSEC**, then add the returned **DS record** at the domain's registrar. This
signs the whole zone, these SVCB records included. If DNSSEC is already enabled,
this is a no-op. It is not required for the checker to report `pass`.

## Verification

After publishing:

```sh
# 1. Resolves over the resolvers the checker uses
dig +short SVCB _index._agents.compress-pro.com @1.1.1.1
dig +short SVCB _a2a._agents.compress-pro.com @1.1.1.1
curl -s 'https://cloudflare-dns.com/dns-query?name=_index._agents.compress-pro.com&type=SVCB' \
  -H 'accept: application/dns-json'

# 2. (if DNSSEC enabled) responses carry the AD flag
dig +dnssec SVCB _index._agents.compress-pro.com @1.1.1.1 | grep -E 'flags:|RRSIG'

# 3. Final audit — expect status: "pass"
curl -s https://isitagentready.com/api/scan -X POST \
  -H 'content-type: application/json' \
  -d '{"url":"https://compress-pro.com"}' | jq '.checks.discoverability.dnsAid'
```

## References

- SKILL.md — <https://isitagentready.com/.well-known/agent-skills/dns-aid/SKILL.md>
- IETF draft — <https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/>
- RFC 9460 (SVCB/HTTPS) — <https://www.rfc-editor.org/rfc/rfc9460>
- Cloudflare DNS record types — <https://developers.cloudflare.com/dns/manage-dns-records/reference/dns-record-types/>
