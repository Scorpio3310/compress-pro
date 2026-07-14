<script lang="ts">
	import { seoFor, type SeoEntry } from '$lib/seo';
	import { pasteKey } from '$lib/paste-key.svelte';
	import { resolve } from '$app/paths';
	import ToolDirectory from './ToolDirectory.svelte';
	import DemoCompare from './DemoCompare.svelte';

	interface Props {
		entry: SeoEntry;
	}

	let { entry }: Props = $props();

	// Prose may carry `[text](/path)` internal links and `**bold**` emphasis — parsed
	// into segments here (never {@html}) and rendered with the content-link / strong
	// styling. `**` markers double as native bold in the .md twins (see markdown.ts).
	type TextSegment = { text: string; href?: string; bold?: boolean };
	function parseInline(paragraph: string): TextSegment[] {
		const segments: TextSegment[] = [];
		let last = 0;
		for (const match of paragraph.matchAll(/\[([^\]]+)\]\((\/[a-z0-9-]+)\)|\*\*([^*]+)\*\*/g)) {
			if (match.index > last) segments.push({ text: paragraph.slice(last, match.index) });
			if (match[2] !== undefined) segments.push({ text: match[1], href: match[2] });
			else segments.push({ text: match[3], bold: true });
			last = match.index + match[0].length;
		}
		if (last < paragraph.length) segments.push({ text: paragraph.slice(last) });
		return segments;
	}
</script>

{#snippet prose(text: string)}{#each parseInline(text) as segment, i (i)}{#if segment.href}<a
				href={resolve(segment.href)}
				class="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
				>{segment.text}</a
			>{:else if segment.bold}<strong class="font-semibold text-ink">{segment.text}</strong
			>{:else}{segment.text}{/if}{/each}{/snippet}

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
			<p class="mt-5 max-w-2xl text-sm leading-relaxed sm:text-base">
				{@render prose(entry.intro)}
			</p>
			<p class="mt-3 max-w-2xl text-sm leading-relaxed sm:text-base">
				No cookies, no analytics, no tracking — the server only ships this page’s static files.
				Don’t take our word for it: compress a file, switch your connection off, and compress
				another — it still works, because <strong class="font-semibold text-ink"
					>nothing ever left</strong
				>. Open source —
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

		<DemoCompare kind="photo" hero />

		<ToolDirectory />
	{:else}
		<!-- Datasheet lede — the annex abstract. The wrapper is full-width so the
		     section divider under it runs edge to edge; max-w lives on the <p>. -->
		<div>
			<p class="max-w-2xl text-sm leading-relaxed text-ink sm:text-base">
				{@render prose(entry.intro)}
			</p>
		</div>
	{/if}

	{#if entry.demo}
		<div class="spec-row">
			<h2 class="microlabel text-muted">Before / after</h2>
			<div class="mt-5 md:pt-[2px]">
				<DemoCompare kind={entry.demo} />
			</div>
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
				<p class="mt-3 max-w-xl">{@render prose(paragraph)}</p>
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
