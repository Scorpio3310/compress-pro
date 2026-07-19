<script lang="ts">
	import PageHead from '$lib/components/PageHead.svelte';
	import { SITE_URL } from '$lib/seo';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const entry = $derived(data.entry);
	const items = $derived(
		entry.directory.flatMap((s) => s.items.map((i) => ({ name: i.name, url: SITE_URL + i.path })))
	);

	// FormatInfo's inline-markdown subset for the intro: **bold** only (the
	// category intros carry no links).
	const introParts = $derived(
		entry.intro.split(/\*\*([^*]+)\*\*/g).map((text, i) => ({ text, bold: i % 2 === 1 }))
	);
</script>

<PageHead
	title={entry.title}
	description={entry.description}
	path={entry.path}
	type="CollectionPage"
	image={entry.ogImage}
	markdownPath={`${entry.path}.md`}
	faq={entry.faq}
	{items}
/>

<div
	class="divide-y divide-line text-sm leading-relaxed text-muted [&>*]:py-9 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0"
>
	<div class="reveal-css" style="--reveal-i: 0">
		<h1 class="text-display text-ink">{entry.h1}</h1>
		<p class="mt-3.5 max-w-xl">{entry.tagline}</p>
		<p class="mt-5 max-w-xl">
			{#each introParts as part, i (i)}
				{#if part.bold}<strong class="font-semibold text-ink">{part.text}</strong
					>{:else}{part.text}{/if}
			{/each}
		</p>
	</div>

	{#each entry.directory as section, sectionIndex (section.heading)}
		<div class="reveal-css spec-row" style="--reveal-i: {sectionIndex + 1}">
			<h2 class="microlabel text-muted">
				{section.heading}
				<span class="text-faint">· {section.items.length}</span>
			</h2>
			<ul class="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
				{#each section.items as item (item.path)}
					<li>
						<a
							href={resolve(item.path)}
							class="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
						>
							{item.name}
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{/each}

	<div class="reveal-css spec-row" style="--reveal-i: {entry.directory.length + 1}">
		<h2 class="microlabel text-muted">How it works</h2>
		<ol class="mt-3 max-w-xl list-decimal space-y-2 pl-5">
			{#each entry.steps ?? [] as step, i (i)}
				<li>{step}</li>
			{/each}
		</ol>
	</div>

	<div class="reveal-css spec-row" style="--reveal-i: {entry.directory.length + 2}">
		<h2 class="microlabel text-muted">Frequently asked questions</h2>
		<div class="mt-3 max-w-xl space-y-6">
			{#each entry.faq as item (item.q)}
				<div>
					<h3 class="font-medium text-ink">{item.q}</h3>
					<p class="mt-1.5">{item.a}</p>
				</div>
			{/each}
		</div>
	</div>

	<div class="reveal-css spec-row" style="--reveal-i: {entry.directory.length + 3}">
		<h2 class="microlabel text-muted">More categories</h2>
		<ul class="mt-3 flex flex-wrap gap-x-6 gap-y-2">
			{#each data.others as other (other.path)}
				<li>
					<a
						href={resolve(other.path)}
						class="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
					>
						{other.label}
					</a>
				</li>
			{/each}
			<li>
				<a
					href={resolve('/')}
					class="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
				>
					All tools on the homepage
				</a>
			</li>
		</ul>
	</div>
</div>
