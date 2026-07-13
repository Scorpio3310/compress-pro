<script lang="ts">
	import { FORMATS, CONVERTERS, TOOLS, seoFor, type SeoEntry } from '$lib/seo';
	import { pasteKey } from '$lib/paste-key.svelte';
	import type { FileFormat } from '$lib/types';
	import { resolve } from '$app/paths';

	interface Props {
		entry: SeoEntry;
	}

	let { entry }: Props = $props();

	// Home-only tool directory, grouped by the hosting tab each entry names.
	const ALL_TOOL_ENTRIES = [...FORMATS, ...CONVERTERS, ...TOOLS];
	const TOOL_GROUPS = (
		[
			['Images', ['jpg', 'png', 'webp', 'gif', 'heic', 'svg']],
			['Video & audio', ['video', 'audio']],
			['PDF', ['pdf']],
			['Fonts', ['font']],
			['Archives & metadata', ['zip', 'exif']]
		] as const
	).map(([title, formats]) => ({
		title,
		entries: ALL_TOOL_ENTRIES.filter(
			(e) => e.format !== null && (formats as readonly FileFormat[]).includes(e.format)
		)
	}));

	// Guide paragraphs may carry `[text](/path)` internal links — parsed into
	// segments here (never {@html}) and rendered with the content-link styling.
	type LinkSegment = { text: string; href?: string };
	function parseLinks(paragraph: string): LinkSegment[] {
		const segments: LinkSegment[] = [];
		let last = 0;
		for (const match of paragraph.matchAll(/\[([^\]]+)\]\((\/[a-z0-9-]+)\)/g)) {
			if (match.index > last) segments.push({ text: paragraph.slice(last, match.index) });
			segments.push({ text: match[1], href: match[2] });
			last = match.index + match[0].length;
		}
		if (last < paragraph.length) segments.push({ text: paragraph.slice(last) });
		return segments;
	}
</script>

<section
	class="reveal-css mt-16 divide-y divide-line text-[13px] leading-relaxed text-muted [&>*]:py-9 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0"
	style="--reveal-i: 3"
>
	{#if entry.format === null}
		<div>
			<p class="microlabel text-muted">Private by design</p>
			<h2 class="text-stat mt-3 max-w-2xl text-balance text-ink">
				Your files never leave your device.
			</h2>
			<p class="mt-5 max-w-2xl text-sm leading-relaxed sm:text-base">{entry.intro}</p>
			<p class="mt-3 max-w-2xl text-sm leading-relaxed sm:text-base">
				No cookies, no analytics, no tracking — the server only ships this page’s static files.
				Don’t take our word for it: compress a file, switch your connection off, and compress
				another — it still works, because nothing ever left. Open source —
				<a
					href="https://github.com/Scorpio3310/compress-pro"
					target="_blank"
					rel="noopener"
					class="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
				>
					read the code on GitHub</a
				>.
			</p>
		</div>

		<div class="spec-row">
			<h2 class="microlabel text-muted">All {ALL_TOOL_ENTRIES.length} tools</h2>
			<!-- padding (not margin: .spec-row zeroes content margin-top on desktop)
			     matches the h2's 2px optical nudge, so the first group's
			     microlabel (IMAGES) sits on the same line as ALL TOOLS -->
			<div class="mt-5 space-y-6 md:pt-[2px]">
				{#each TOOL_GROUPS as group (group.title)}
					<div>
						<h3 class="microlabel text-faint">{group.title}</h3>
						<ul class="mt-2.5 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
							{#each group.entries as e (e.path)}
								<li>
									<a
										href={resolve(e.path)}
										class="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
									>
										{e.h1.replace(/\.$/, '')}
									</a>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<!-- Datasheet lede — the annex abstract. The wrapper is full-width so the
		     section divider under it runs edge to edge; max-w lives on the <p>. -->
		<div>
			<p class="max-w-2xl text-sm leading-relaxed text-ink sm:text-base">{entry.intro}</p>
		</div>
	{/if}

	<div class="spec-row">
		<h2 class="microlabel text-muted">How it works</h2>
		<ol class="how-steps mt-6">
			{#if entry.steps}
				{#each entry.steps as step (step)}
					<li>{step}</li>
				{/each}
			{:else}
				<!-- Generic compress-tool trio — pages whose flow differs override via entry.steps. -->
				<li>Drop files anywhere on the page, click to browse, or paste with {pasteKey()}.</li>
				<li>Pick a quality or preset — or set an exact target size and let the tool find it.</li>
				<li>Compress, compare before/after, and download — individually or as a ZIP.</li>
			{/if}
		</ol>
	</div>

	{#each entry.guide ?? [] as section (section.heading)}
		<div class="spec-row">
			<h2 class="microlabel text-muted">{section.heading}</h2>
			{#each section.paragraphs ?? [] as paragraph (paragraph)}
				<p class="mt-3 max-w-xl">
					{#each parseLinks(paragraph) as segment, i (i)}{#if segment.href}<a
								href={resolve(segment.href)}
								class="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
								>{segment.text}</a
							>{:else}{segment.text}{/if}{/each}
				</p>
			{/each}
			{#if section.table}
				<div class="mt-3 overflow-x-auto rounded-xl">
					<table class="w-full bg-card text-left text-[13px] leading-relaxed tabular-nums">
						<thead>
							<tr class="microlabel border-b border-line text-faint">
								{#each section.table.columns as column (column)}
									<th class="px-4 py-2.5 font-medium">{column}</th>
								{/each}
							</tr>
						</thead>
						<tbody class="divide-y divide-line">
							{#each section.table.rows as row (row[0])}
								<tr>
									{#each row as cell, i (i)}
										<td class="px-4 py-2.5 {i === 0 ? 'font-medium text-ink' : ''}">{cell}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/each}

	{#if entry.faq.length > 0}
		<div class="spec-row">
			<h2 class="microlabel text-muted">Frequently asked questions</h2>
			<div class="mt-3 space-y-4">
				{#each entry.faq as item (item.q)}
					<div>
						<h3 class="font-medium text-ink">{item.q}</h3>
						<p class="mt-1">{item.a}</p>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if entry.related?.length}
		<div class="spec-row">
			<h2 class="microlabel text-muted">Related tools</h2>
			<div class="mt-3 flex flex-wrap gap-2">
				{#each entry.related as path (path)}
					{@const target = seoFor(path.slice(1))}
					<a
						href={resolve(path)}
						class="rounded-full bg-card/70 px-3.5 py-1.5 font-mono text-xs font-medium text-muted ring-1 ring-line backdrop-blur-xs transition-colors hover:text-ink"
					>
						{target.h1.replace(/\.$/, '')}
					</a>
				{/each}
			</div>
		</div>
	{/if}
</section>
