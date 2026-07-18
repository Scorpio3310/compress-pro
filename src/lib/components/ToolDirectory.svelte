<script lang="ts">
	import { FORMATS, CONVERTERS, TOOLS, FEATURED_PATHS, TOOL_GROUPS, seoFor } from '$lib/seo';
	import type { FileFormat } from '$lib/types';
	import { resolve } from '$app/paths';
	import Icon, { type IconName } from './Icon.svelte';

	// Home-only tool directory: curated featured rows up front, the full list
	// collapsed behind a toggle. The collapsed list stays MOUNTED (grid-rows
	// collapse, not {#if}) so all 144 links land in the prerendered HTML.
	// TOOL_GROUPS (shared with the footer columns) feeds both lists, keeping
	// their grouping in sync.
	const ALL_TOOL_ENTRIES = [...FORMATS, ...CONVERTERS, ...TOOLS];
	// The expanded list carries only the tools NOT already shown as featured
	// rows above — no duplicate links, and the repeated group headings read as
	// continuation instead of repetition. All 144 stay in the DOM: 17 + 127.
	const DIRECTORY_GROUPS = TOOL_GROUPS.map(({ title, formats }) => ({
		title,
		entries: ALL_TOOL_ENTRIES.filter(
			(e) => e.format !== null && formats.includes(e.format) && !FEATURED_PATHS.includes(e.path)
		)
	}));

	// Category glyph per hosting tab — same mapping the Tabs pills use.
	const CATEGORY_ICON: Partial<Record<FileFormat, IconName>> = {
		pdf: 'document',
		video: 'video',
		audio: 'audio',
		font: 'font',
		zip: 'archive',
		exif: 'tag'
	};
	const iconFor = (format: FileFormat): IconName => CATEGORY_ICON[format] ?? 'image';

	const FEATURED = FEATURED_PATHS.map((path) => {
		const entry = seoFor(path.slice(1));
		return {
			path,
			format: entry.format!,
			name: entry.h1.replace(/\.$/, ''),
			icon: iconFor(entry.format!)
		};
	});
	const FEATURED_GROUPS = TOOL_GROUPS.map(({ title, formats }) => ({
		title,
		tools: FEATURED.filter((t) => formats.includes(t.format))
	})).filter((g) => g.tools.length > 0);

	let open = $state(false);

	// The footer's "All N tools" link lands on /#all-tools — unfold the
	// directory so the jump has something to show. Runs on mount (fresh
	// navigation) and on in-page hash changes (footer link on the homepage).
	const openOnHash = () => {
		if (window.location.hash === '#all-tools') open = true;
	};
	$effect(openOnHash);
</script>

<svelte:window onhashchange={openOnHash} />

<div class="spec-row">
	<h2 class="microlabel text-muted">Popular tools</h2>
	<div class="mt-5 md:pt-[2px]">
		<div class="space-y-6">
			{#each FEATURED_GROUPS as group (group.title)}
				<div>
					<h3 class="microlabel text-faint">{group.title}</h3>
					<div class="mt-2.5 grid gap-2 md:grid-cols-2">
						{#each group.tools as tool (tool.path)}
							<a
								href={resolve(tool.path)}
								class="group flex items-center gap-2.5 rounded-xl bg-card/70 px-4 py-3 ring-1 ring-line-strong/70 backdrop-blur-xs transition-colors hover:bg-card"
							>
								<Icon name={tool.icon} class="size-4 shrink-0 text-muted" />
								<span class="font-medium text-ink">{tool.name}</span>
								<Icon
									name="chevron-right"
									class="ml-auto size-3.5 shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5"
								/>
							</a>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<button
			type="button"
			aria-expanded={open}
			aria-controls="all-tools"
			onclick={() => (open = !open)}
			class="mt-4 flex w-full items-center justify-between gap-4 rounded-xl px-4 py-3 text-left ring-1 ring-line-strong/70 transition-colors hover:bg-card/70"
		>
			<span class="microlabel text-muted">
				{open ? 'Hide the full list' : `Show all ${ALL_TOOL_ENTRIES.length} tools`}
			</span>
			<Icon
				name="chevron-down"
				class="size-4 shrink-0 text-faint transition-transform duration-300 {open
					? 'rotate-180'
					: ''}"
			/>
		</button>

		<div
			class="grid transition-[grid-template-rows] duration-300 ease-[var(--ease-swift)] motion-reduce:transition-none {open
				? 'grid-rows-[1fr]'
				: 'grid-rows-[0fr]'}"
			inert={!open}
		>
			<div
				class="overflow-hidden transition-opacity duration-300 motion-reduce:transition-none {open
					? 'opacity-100'
					: 'opacity-0'}"
			>
				<div id="all-tools" role="region" aria-label="All tools" class="space-y-6 pt-6">
					{#each DIRECTORY_GROUPS as group (group.title)}
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
		</div>
	</div>
</div>
