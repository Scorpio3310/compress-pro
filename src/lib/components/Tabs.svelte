<script module lang="ts">
	import type { FileFormat } from '$lib/types';
	import { IMAGE_FORMATS } from '$lib/types';
	import type { Rail } from '$lib/rails';

	// The Images rail = the raster pipeline tabs plus SVG (a UI grouping, not a
	// pipeline family — SVG has its own worker/settings).
	const IMAGE_TABS = [...IMAGE_FORMATS, 'svg'] as const;
	type ImageTab = (typeof IMAGE_TABS)[number];

	function isImageTab(f: FileFormat): f is ImageTab {
		return (IMAGE_TABS as readonly string[]).includes(f);
	}

	/** What the rail track renders: the Images format links, or one op group. */
	type ShownRail = { kind: 'images' } | { kind: 'ops'; rail: Rail };

	/** Per-tab compression state, shown as a colored count badge (traffic-light):
	 *  pending = warn, running = spinner+% (info), done = ok, error = danger. */
	export type TabBadgeStatus = 'pending' | 'running' | 'done' | 'error';

	// Where the Images pill points when the active tab isn't an image format.
	// Module scope: the shared page component never remounts across tab routes,
	// and this survives a hop to /about and back. Effects don't run during SSR,
	// so prerendered pages always link the deterministic 'jpg' fallback.
	let lastImage = $state<ImageTab>('jpg');
</script>

<script lang="ts">
	import { FORMATS, pathFor } from '$lib/seo';
	import { resolve } from '$app/paths';
	import { slideIndicator } from '$lib/motion/indicator.svelte';
	import { wheelX } from '$lib/motion/gestures';
	import { motionOK } from '$lib/motion/prefs.svelte';
	import { pop } from '$lib/motion/reveal';
	import Spinner from './Spinner.svelte';
	import Icon, { type IconName } from './Icon.svelte';

	interface Props {
		activeTab: FileFormat;
		/** Files parked per tab — shown as a small badge. */
		counts?: Partial<Record<FileFormat, number>>;
		/** 0..1 while that tab is compressing (null/absent otherwise) — badge shows live %. */
		progress?: Partial<Record<FileFormat, number | null>>;
		/** Per-tab compression state — colors the count badge. */
		status?: Partial<Record<FileFormat, TabBadgeStatus | null>>;
		/** The active tab's op rail (null = no rail; Images is derived here). */
		rail?: Rail | null;
		/** Freeze the op rail while a job runs (op changes clear results). */
		opsDisabled?: boolean;
	}

	let {
		activeTab,
		counts = {},
		progress = {},
		status = {},
		rail = null,
		opsDisabled = false
	}: Props = $props();

	const imageTabs = FORMATS.flatMap(({ format, label }) =>
		isImageTab(format) ? [{ id: format, label }] : []
	);
	const primaryTabs: { id: 'images' | Exclude<FileFormat, ImageTab>; label: string }[] = [
		{ id: 'images', label: 'Images' },
		...FORMATS.flatMap(({ format, label }) => (isImageTab(format) ? [] : [{ id: format, label }]))
	];
	// Group glyphs (desktop only) — the secondary rail stays text-only, so the
	// two levels read differently: categories carry icons, formats don't.
	const TAB_ICONS: Record<(typeof primaryTabs)[number]['id'], IconName> = {
		images: 'image',
		pdf: 'document',
		video: 'video',
		audio: 'audio',
		font: 'font',
		zip: 'archive',
		exif: 'tag',
		ocr: 'scan',
		subtitle: 'captions',
		ebook: 'book',
		model: 'cube',
		data: 'table'
	};

	// Chevron nudge targets — visibility is pure CSS off the sibling's
	// data-scroll (see [data-chev] in layout.css), so no reactive plumbing.
	let primaryNav = $state<HTMLElement>();
	let railTrack = $state<HTMLElement>();
	function nudge(el: HTMLElement | undefined, dir: 1 | -1) {
		el?.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: motionOK() ? 'smooth' : 'instant' });
	}

	const imagesActive = $derived(isImageTab(activeTab));
	const activeGroup = $derived(imagesActive ? 'images' : activeTab);
	const imagesHref = $derived(pathFor(isImageTab(activeTab) ? activeTab : lastImage));
	$effect(() => {
		if (isImageTab(activeTab)) lastImage = activeTab;
	});

	const imagesCount = $derived(IMAGE_TABS.reduce((n, f) => n + (counts[f] ?? 0), 0));
	// Mean of the running image compressions — the common single run shows its exact %.
	const imagesPct = $derived.by(() => {
		const running = IMAGE_TABS.map((f) => progress[f]).filter((p): p is number => p != null);
		return running.length ? running.reduce((a, b) => a + b, 0) / running.length : null;
	});
	// Group status: surface problems first, then work still waiting, then done.
	const imagesStatus = $derived.by(() => {
		const all = IMAGE_TABS.map((f) => status[f]);
		for (const s of ['error', 'pending', 'done'] as const) {
			if (all.includes(s)) return s;
		}
		return null;
	});

	// Sticky rail content: on tabs without a rail (video/audio/exif) the LAST
	// shown content stays mounted (inert) so the close animation has something
	// to collapse over. The latch only matters client-side (effects don't run
	// during SSR) — prerendered pages derive the content straight from the route.
	const liveShown = $derived<ShownRail | null>(
		imagesActive ? { kind: 'images' } : rail ? { kind: 'ops', rail } : null
	);
	let lastShown = $state<ShownRail | null>(null);
	$effect(() => {
		if (liveShown) lastShown = liveShown;
	});
	const shown = $derived(liveShown ?? lastShown ?? { kind: 'images' as const });
	const railOpen = $derived(liveShown !== null);
	const shownKey = $derived(shown.kind === 'images' ? 'images' : shown.rail.group);
	// Only op groups freeze while compressing — image chips are tab links.
	const opsFrozen = $derived(opsDisabled && shown.kind !== 'images');
	const railKey = $derived(
		shown.kind === 'ops' ? shown.rail.value : isImageTab(activeTab) ? activeTab : lastImage
	);
</script>

<!-- Traffic-light badge: solid pills with a white number — read on white AND on
     the black active pill, same in both themes (fixed shades on purpose).
     pending = orange, running = accent (spinner + live %), done = green, error = red. -->
{#snippet badge(count: number, pct: number | null, tabStatus: TabBadgeStatus | null | undefined)}
	{#if pct != null}
		<span
			class="ml-1.5 inline-flex h-4 items-center gap-1 rounded-full bg-accent px-1.5 font-mono text-[10px] font-semibold whitespace-nowrap text-white tabular-nums"
		>
			<Spinner class="size-2.5" label="Compressing" />
			{Math.round(pct * 100)}%
		</span>
	{:else if count > 0}
		{#key count}
			<span
				class="ml-1.5 inline-flex h-4 items-center rounded-full px-1.5 font-mono text-[10px] font-semibold text-white tabular-nums {tabStatus ===
				'done'
					? 'bg-ok-solid'
					: tabStatus === 'error'
						? 'bg-red-500'
						: 'bg-warn-solid'}"
				{@attach pop({ from: 0.6 })}
			>
				{count}
			</span>
		{/key}
	{/if}
{/snippet}

{#snippet opButton(id: string, label: string, active: boolean, select: () => void)}
	<!-- no text-transform here: e2e matches these by exact accessible name -->
	<button
		type="button"
		aria-pressed={active}
		data-seg={id}
		class="relative flex shrink-0 items-center rounded-full px-3.5 py-2 font-mono text-xs font-medium whitespace-nowrap transition-colors duration-300 {active
			? 'bg-card text-ink in-data-ready:bg-transparent'
			: 'text-muted hover:text-ink'}"
		onclick={select}
	>
		{label}
	</button>
{/snippet}

<!-- Desktop-only scroll nudgers, shown per side via [data-chev] CSS when the
     sibling track's data-scroll says that side has more content. Deliberately
     out of the a11y tree (aria-hidden + tabindex=-1): pills are Tab-reachable
     and focus scrolls them into view natively. No data-seg/role names, so e2e
     queries can never match these. The prevented mousedown keeps a CLICK from
     focusing the button (tabindex=-1 only covers Tab) — a focused descendant
     under aria-hidden trips Chrome's assistive-tech block. -->
{#snippet chevrons(track: () => HTMLElement | undefined, cls: string)}
	<button
		type="button"
		tabindex="-1"
		aria-hidden="true"
		data-chev="left"
		class="absolute left-1 w-8 items-center justify-center rounded-full text-muted hover:text-ink {cls}"
		onmousedown={(e) => e.preventDefault()}
		onclick={() => nudge(track(), -1)}
	>
		<Icon name="chevron-left" class="size-4" />
	</button>
	<button
		type="button"
		tabindex="-1"
		aria-hidden="true"
		data-chev="right"
		class="absolute right-1 w-8 items-center justify-center rounded-full text-muted hover:text-ink {cls}"
		onmousedown={(e) => e.preventDefault()}
		onclick={() => nudge(track(), 1)}
	>
		<Icon name="chevron-right" class="size-4" />
	</button>
{/snippet}

<div>
	<!-- Tabs are real routes; the shared page component is reused on navigation.
	     Primary row = format groups as machine cells; image formats collapse
	     into one "Images" cell with a rail below. -->
	<!-- Bottom padding shrinks when no rail follows, so the dashed drop frame
	     sits as close to the pills as it does to the rail track on rail tabs.
	     The padding animates in step with the rail's collapse. -->
	<div class="relative" data-chevrons>
		<nav
			aria-label="File format"
			bind:this={primaryNav}
			class="relative flex w-full items-stretch gap-1 overflow-x-auto px-2 pt-2 transition-[padding] duration-300 ease-[var(--ease-swift)] scrollbar-none motion-reduce:transition-none {railOpen
				? 'pb-2'
				: 'pb-0.5'}"
			{@attach slideIndicator(() => activeGroup)}
			{@attach wheelX()}
		>
			<!-- sliding thumb; the active link's own bg is the pre-hydration fallback -->
			<span
				data-thumb
				aria-hidden="true"
				class="absolute top-2 left-0 w-0 rounded-full bg-ink opacity-0 transition-[bottom] duration-300 ease-[var(--ease-swift)] motion-reduce:transition-none {railOpen
					? 'bottom-2'
					: 'bottom-0.5'}"
			></span>
			{#each primaryTabs as tab (tab.id)}
				{@const active = activeGroup === tab.id}
				<a
					href={resolve(tab.id === 'images' ? imagesHref : pathFor(tab.id))}
					aria-current={active ? (tab.id === 'images' ? 'true' : 'page') : undefined}
					data-seg={tab.id}
					data-sveltekit-noscroll
					data-sveltekit-keepfocus
					class="relative flex shrink-0 items-center rounded-full px-4 py-2.5 font-mono text-xs font-medium tracking-[0.08em] whitespace-nowrap uppercase transition-colors duration-300 {active
						? 'bg-ink text-ink-contrast in-data-ready:bg-transparent'
						: 'text-muted hover:text-ink'}"
				>
					<!-- active branch remounts the svg → its activation move replays -->
					{#if active}
						<Icon
							name={TAB_ICONS[tab.id]}
							class="icon-activate-{tab.id} mr-1.5 hidden size-4 shrink-0 sm:block"
						/>
					{:else}
						<Icon name={TAB_ICONS[tab.id]} class="mr-1.5 hidden size-4 shrink-0 sm:block" />
					{/if}
					{tab.label}
					{@render badge(
						tab.id === 'images' ? imagesCount : (counts[tab.id] ?? 0),
						tab.id === 'images' ? imagesPct : (progress[tab.id] ?? null),
						tab.id === 'images' ? imagesStatus : status[tab.id]
					)}
				</a>
			{/each}
		</nav>
		{@render chevrons(() => primaryNav, 'top-2 h-9')}
	</div>

	<!-- Second row: a quiet gray rail. Image tabs → format links; op groups →
	     buttons off the rail descriptor (their file/result-clearing side
	     effects live in +page's handlers); other tabs → collapsed. Content is
	     sticky (lastShown) so closing has something to animate over; {#key}
	     remounts the track on group swaps (instant, same height — both variants
	     share the same cell metrics) and re-inits the thumb.
	     Note for e2e: the LAST rail group's items stay mounted (hidden, inert)
	     on video/audio/exif tabs — only interact with rail items while their
	     owning tab is active. -->
	<div
		class="grid transition-[grid-template-rows] duration-300 ease-[var(--ease-swift)] motion-reduce:transition-none {railOpen
			? 'grid-rows-[1fr]'
			: 'grid-rows-[0fr]'}"
		inert={!railOpen}
	>
		<div
			class="overflow-hidden transition-opacity duration-300 motion-reduce:transition-none {railOpen
				? 'opacity-100'
				: 'opacity-0'}"
		>
			<div class="px-2 sm:px-2.5">
				{#key shownKey}
					<div
						class="relative w-fit max-w-full transition-opacity duration-300 {opsFrozen
							? 'pointer-events-none opacity-50'
							: ''}"
						data-chevrons
						inert={opsFrozen}
					>
						<svelte:element
							this={shown.kind === 'images' ? 'nav' : 'div'}
							role={shown.kind === 'images' ? undefined : 'group'}
							aria-label={shown.kind === 'images' ? 'Image format' : shown.rail.label}
							bind:this={railTrack}
							class="relative flex w-fit max-w-full items-stretch gap-1 overflow-x-auto rounded-full bg-card-2 p-1 scrollbar-none"
							{@attach slideIndicator(() => railKey)}
							{@attach wheelX()}
						>
							<!-- sliding white thumb; the active item's own bg is the pre-hydration fallback -->
							<span
								data-thumb
								aria-hidden="true"
								class="absolute inset-y-1 left-0 w-0 rounded-full bg-card opacity-0"
							></span>
							{#if shown.kind === 'images'}
								{#each imageTabs as tab (tab.id)}
									{@const active = activeTab === tab.id}
									<a
										href={resolve(pathFor(tab.id))}
										aria-current={active ? 'page' : undefined}
										data-seg={tab.id}
										data-sveltekit-noscroll
										data-sveltekit-keepfocus
										class="relative flex shrink-0 items-center rounded-full px-3.5 py-2 font-mono text-xs font-medium whitespace-nowrap transition-colors duration-300 {active
											? 'bg-card text-ink in-data-ready:bg-transparent'
											: 'text-muted hover:text-ink'}"
									>
										{tab.label}
										{@render badge(counts[tab.id] ?? 0, progress[tab.id] ?? null, status[tab.id])}
									</a>
								{/each}
							{:else}
								{@const ops = shown.rail}
								{#each ops.items as o (o.id)}
									{@render opButton(o.id, o.label, ops.value === o.id, () => ops.onselect(o.id))}
								{/each}
							{/if}
						</svelte:element>
						{@render chevrons(() => railTrack, 'inset-y-1')}
					</div>
				{/key}
			</div>
		</div>
	</div>
</div>
