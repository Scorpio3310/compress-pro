# SEO ops — status and remaining steps

Source of truth for the operational SEO steps that live **outside the repo**
(Cloudflare dashboard, search-engine consoles). The repo side (sitemap, robots,
meta, JSON-LD, OG, llms/md surface) is covered by tests and
`scripts/validate-seo.mjs` — not duplicated here.

Status last verified: **2026-07-19** (dig/curl against the live domain).

## Done ✅

| What                               | Evidence                                                               | Note                                                           |
| ---------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| Google Search Console verification | TXT `google-site-verification=0kc_…` on `compress-pro.com` (dig TXT)   | DNS verify covers the whole domain                             |
| Sitemap submitted to GSC           | — (GSC UI only, not externally verifiable)                             | done at verification time; re-check after large page additions |
| DNS-AID SVCB records               | `_index._agents` + `_a2a._agents` both live (dig TYPE64)               | see [dns-aid.md](./dns-aid.md); upsert via `pnpm dns:aid`      |
| Production headers                 | `curl -I https://compress-pro.com`: Link, Vary: Accept, COOP/COEP, CSP | served by `_headers` + the worker                              |
| workers.dev / preview duplicates   | `workers_dev: false`, `preview_urls: false` in wrangler.jsonc          | non-prod hosts get robots `Disallow: /`                        |

## TODO (dashboard steps, manual)

### 1. Bing Webmaster Tools

Bing also feeds ChatGPT search and DuckDuckGo — cheap reach.

1. <https://www.bing.com/webmasters> → sign in → **Import from Google Search
   Console** (carries over the verified domain and sitemap, no new DNS record).
2. Confirm `https://compress-pro.com/sitemap.xml` was imported.

### 2. www.compress-pro.com (currently a dead host)

`www` **has no DNS record** (dig returns empty, 2026-07-19) — no
duplicate-content risk, but anyone typing or linking `www` gets an error. Fix
in the CF dashboard:

1. **DNS** → Add record: `CNAME`, name `www`, target `compress-pro.com`,
   **Proxied**. (A proxied CNAME to the apex is flattened by CF and never
   reaches the Workers custom domain — traffic is caught by the redirect rule
   below before origin lookup.)
2. **Rules → Redirect Rules** → Create:
   - When: `Hostname equals www.compress-pro.com`
   - Then: Dynamic redirect, expression
     `concat("https://compress-pro.com", http.request.uri.path)`, status
     **301**, preserve query string ✓.
3. Verify: `curl -sI https://www.compress-pro.com/compress-pdf` →
   `301` + `location: https://compress-pro.com/compress-pdf`.

Deliberately NOT solved in the worker: `www` is not in `routes` and without a
DNS record the worker never sees the request — the redirect has to live in
front of routing.

### 3. IndexNow / Crawler Hints (optional)

CF dashboard → **Caching → Configuration → Crawler Hints** → enable. CF then
pings IndexNow (Bing/Yandex/Seznam) on purges by itself; no key in the repo,
no maintenance. Google does not use IndexNow — the GSC sitemap covers it.

### 4. After large content additions

- GSC → Sitemaps → re-submit (or wait for the recrawl; the sitemap carries no
  lastmod on purpose — see the comment in `src/routes/sitemap.xml/+server.ts`).
- Spot-check `site:compress-pro.com` + GSC Coverage after ~2 weeks.

## Do not

- **lastmod in the sitemap** from the build stamp — fake freshness signal
  (decision 2026-07-15).
- **aggregateRating** without real reviews — violates Google's guidelines.
- **noindex in SECURITY_HEADERS** (hooks/worker) — those apply to every
  response, HTML included; the `.md`/llms noindex lives in `_headers` and in
  the negotiated-response branches (worker/index.js, hooks.server.ts).
