/**
 * DNS for AI Discovery (DNS-AID) record publisher.
 *
 * Idempotently upserts the SVCB records under compress-pro.com's `_agents`
 * namespace so agents can discover this origin's HTTPS agent surface (the
 * agent-skills catalog, llms.txt, per-tool .md twins, in-page WebMCP). See
 * docs/dns-aid.md for the full rationale and the exact records — that doc is
 * the human source of truth; the RECORDS array below must stay in sync.
 *
 * The records are deliberately honest: compress-pro runs 100% in the browser
 * and has no server-side A2A/MCP endpoint, so they point at compress-pro.com
 * with alpn="h2,http/1.1" (the protocols really served) — never a fictional
 * agent-protocol server.
 *
 * DNS for compress-pro.com is managed in Cloudflare (no DNS-as-code), so this
 * talks to the Cloudflare API directly. It does NOT touch DNSSEC (see the doc
 * for that one-click step). Requires a token with Zone → DNS → Edit on the
 * compress-pro.com zone.
 *
 *   CLOUDFLARE_API_TOKEN=… pnpm dns:aid            # publish / update
 *   CLOUDFLARE_API_TOKEN=… pnpm dns:aid --dry-run  # show diff, change nothing
 *   pnpm dns:aid --dry-run                          # print intended records only
 *
 * Env: CLOUDFLARE_API_TOKEN (required for a live run),
 *      CLOUDFLARE_ZONE_ID   (optional; resolved from ZONE_NAME if unset),
 *      ZONE_NAME            (optional; defaults to compress-pro.com).
 */
const API = 'https://api.cloudflare.com/client/v4';
const ZONE_NAME = process.env.ZONE_NAME ?? 'compress-pro.com';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

// Single source of truth for the DNS-AID records. `name` is relative to the
// zone; `target` is the endpoint that actually serves the agent content.
const RECORDS = [
	// The draft's canonical entry point (draft-mozleywilliams-dnsop-dnsaid §3.2).
	{ name: '_index._agents', priority: 1, target: ZONE_NAME, value: 'alpn="h2,http/1.1" port=443' },
	// The owner name shown in the isitagentready SKILL.md example; published too
	// so the checker finds a record whichever of the two names it probes first.
	{ name: '_a2a._agents', priority: 1, target: ZONE_NAME, value: 'alpn="h2,http/1.1" port=443' }
];

const fqdn = (name) => `${name}.${ZONE_NAME}`;

/**
 * Normalize an SVCB payload so a re-run is a no-op despite Cloudflare's
 * formatting: it may echo params reordered, requoted (port="443"), or the
 * target with a trailing dot. Compare quote-, order- and case-insensitively.
 */
const normalize = (priority, target, value) =>
	[
		String(priority ?? ''),
		String(target ?? '')
			.replace(/\.$/, '')
			.toLowerCase(),
		String(value ?? '')
			.replace(/"/g, '')
			.trim()
			.split(/\s+/)
			.sort()
			.join(' ')
			.toLowerCase()
	].join('|');

async function cf(path, init = {}) {
	if (!TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is not set');
	const res = await fetch(`${API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${TOKEN}`,
			'Content-Type': 'application/json',
			...init.headers
		}
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok || json.success === false) {
		const detail = (json.errors ?? []).map((e) => `${e.code} ${e.message}`).join('; ');
		throw new Error(`Cloudflare API ${res.status} on ${path}${detail ? ` — ${detail}` : ''}`);
	}
	return json.result;
}

async function resolveZoneId() {
	if (process.env.CLOUDFLARE_ZONE_ID) return process.env.CLOUDFLARE_ZONE_ID;
	const zones = await cf(`/zones?name=${encodeURIComponent(ZONE_NAME)}`);
	if (!zones?.length) throw new Error(`Zone not found for ${ZONE_NAME}`);
	return zones[0].id;
}

async function upsert(zoneId, record) {
	const name = fqdn(record.name);
	const body = {
		type: 'SVCB',
		name,
		ttl: 3600,
		proxied: false,
		data: { priority: record.priority, target: record.target, value: record.value }
	};

	const existing = (
		await cf(`/zones/${zoneId}/dns_records?type=SVCB&name=${encodeURIComponent(name)}`)
	)?.[0];

	if (!existing) {
		if (DRY_RUN) return { name, action: 'create' };
		await cf(`/zones/${zoneId}/dns_records`, { method: 'POST', body: JSON.stringify(body) });
		return { name, action: 'created' };
	}

	const before = normalize(existing.data?.priority, existing.data?.target, existing.data?.value);
	const after = normalize(record.priority, record.target, record.value);
	if (before === after) return { name, action: 'unchanged' };

	if (DRY_RUN) return { name, action: 'update' };
	await cf(`/zones/${zoneId}/dns_records/${existing.id}`, {
		method: 'PUT',
		body: JSON.stringify(body)
	});
	return { name, action: 'updated' };
}

async function main() {
	console.log(`DNS-AID · zone ${ZONE_NAME}${DRY_RUN ? ' · dry run' : ''}`);
	for (const r of RECORDS) {
		console.log(`  SVCB ${fqdn(r.name)}. → ${r.priority} ${r.target}. ${r.value}`);
	}

	// Without a token we can only report intent — useful for a quick review.
	if (!TOKEN) {
		console.log(
			DRY_RUN
				? '\nNo CLOUDFLARE_API_TOKEN set — printed intended records only (no API calls).'
				: '\nSet CLOUDFLARE_API_TOKEN (Zone → DNS → Edit) to publish. See docs/dns-aid.md.'
		);
		if (!DRY_RUN) process.exitCode = 1;
		return;
	}

	const zoneId = await resolveZoneId();
	console.log(`\nZone ${ZONE_NAME} → ${zoneId}`);
	for (const record of RECORDS) {
		const { name, action } = await upsert(zoneId, record);
		console.log(`  ${action.padEnd(9)} ${name}`);
	}
	console.log(
		DRY_RUN ? '\nDry run complete — no changes made.' : '\nDone. Verify per docs/dns-aid.md.'
	);
}

main().catch((err) => {
	console.error(`\ndns-aid failed: ${err.message}`);
	process.exit(1);
});
