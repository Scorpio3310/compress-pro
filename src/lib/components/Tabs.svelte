<script module lang="ts">
	import type { FileFormat, FontOp, PdfOp, ZipSettings } from '$lib/types';
	import { IMAGE_FORMATS } from '$lib/types';

	// The Images rail = the raster pipeline tabs plus SVG (a UI grouping, not a
	// pipeline family — SVG has its own worker/settings).
	const IMAGE_TABS = [...IMAGE_FORMATS, 'svg'] as const;
	type ImageTab = (typeof IMAGE_TABS)[number];

	function isImageTab(f: FileFormat): f is ImageTab {
		return (IMAGE_TABS as readonly string[]).includes(f);
	}

	type RailGroup = 'images' | 'pdf' | 'zip' | 'font';

	function groupOf(f: FileFormat): RailGroup | null {
		return isImageTab(f) ? 'images' : f === 'pdf' || f === 'zip' || f === 'font' ? f : null;
	}

	/** Per-tab compression state, shown as a colored count badge (traffic-light):
	 *  pending = warn, running = spinner+% (info), done = ok, error = danger. */
	export type TabBadgeStatus = 'pending' | 'running' | 'done' | 'error';

	const PDF_OPS: { id: PdfOp; label: string }[] = [
		{ id: 'compress', label: 'Compress' },
		{ id: 'merge', label: 'Merge' },
		{ id: 'pages', label: 'Pages' },
		{ id: 'toImages', label: 'To images' },
		{ id: 'fromImages', label: 'From images' },
		{ id: 'unlock', label: 'Unlock' },
		{ id: 'protect', label: 'Protect' }
	];
	const ZIP_OPS: { id: ZipSettings['op']; label: string }[] = [
		{ id: 'create', label: 'Create ZIP' },
		{ id: 'extract', label: 'Extract' }
	];
	const FONT_OPS: { id: FontOp; label: string }[] = [
		{ id: 'convert', label: 'Convert' },
		{ id: 'subset', label: 'Subset' }
	];

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
		pdfOp: PdfOp;
		zipOp: ZipSettings['op'];
		fontOp: FontOp;
		onpdfop: (op: PdfOp) => void;
		onzipop: (op: ZipSettings['op']) => void;
		onfontop: (op: FontOp) => void;
		/** Freeze the op rail while a job runs (op changes clear results). */
		opsDisabled?: boolean;
	}

	let {
		activeTab,
		counts = {},
		progress = {},
		status = {},
		pdfOp,
		zipOp,
		fontOp,
		onpdfop,
		onzipop,
		onfontop,
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
		exif: 'tag'
	};

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
	// group's items stay mounted (inert) so the close animation has something
	// to collapse over. The latch only matters client-side (effects don't run
	// during SSR) — prerendered pages derive the group straight from the route.
	let lastRailGroup = $state<RailGroup | null>(null);
	const railGroup = $derived(groupOf(activeTab) ?? lastRailGroup ?? 'images');
	$effect(() => {
		const g = groupOf(activeTab);
		if (g) lastRailGroup = g;
	});
	const railOpen = $derived(groupOf(activeTab) !== null);
	// Only op groups freeze while compressing — image chips are tab links.
	const opsFrozen = $derived(opsDisabled && railGroup !== 'images');
	const railKey = $derived(
		railGroup === 'pdf'
			? pdfOp
			: railGroup === 'zip'
				? zipOp
				: railGroup === 'font'
					? fontOp
					: isImageTab(activeTab)
						? activeTab
						: lastImage
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

<div>
	<!-- Tabs are real routes; the shared page component is reused on navigation.
	     Primary row = format groups as machine cells; image formats collapse
	     into one "Images" cell with a rail below. -->
	<!-- Bottom padding shrinks when no rail follows, so the dashed drop frame
	     sits as close to the pills as it does to the rail track on rail tabs.
	     The padding animates in step with the rail's collapse. -->
	<nav
		aria-label="File format"
		class="relative flex w-full items-stretch gap-1 overflow-x-auto px-2 pt-2 transition-[padding] duration-300 ease-[var(--ease-swift)] scrollbar-none motion-reduce:transition-none {railOpen
			? 'pb-2'
			: 'pb-0.5'}"
		{@attach slideIndicator(() => activeGroup)}
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

	<!-- Second row: a quiet gray rail. Image tabs → format links; pdf/zip → op
	     buttons (their file/result-clearing side effects live in +page's
	     handlers); other tabs → collapsed. Content is sticky (railGroup) so
	     closing has something to animate over; {#key} remounts the track on
	     group swaps (instant, same height — both variants share the same cell
	     metrics) and re-inits the thumb.
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
				{#key railGroup}
					<div
						class="transition-opacity duration-300 {opsFrozen
							? 'pointer-events-none opacity-50'
							: ''}"
						inert={opsFrozen}
					>
						<svelte:element
							this={railGroup === 'images' ? 'nav' : 'div'}
							role={railGroup === 'images' ? undefined : 'group'}
							aria-label={railGroup === 'images'
								? 'Image format'
								: railGroup === 'pdf'
									? 'PDF tool'
									: railGroup === 'font'
										? 'Font tool'
										: 'ZIP mode'}
							class="relative flex w-fit max-w-full items-stretch gap-1 overflow-x-auto rounded-full bg-card-2 p-1 scrollbar-none"
							{@attach slideIndicator(() => railKey)}
						>
							<!-- sliding white thumb; the active item's own bg is the pre-hydration fallback -->
							<span
								data-thumb
								aria-hidden="true"
								class="absolute inset-y-1 left-0 w-0 rounded-full bg-card opacity-0"
							></span>
							{#if railGroup === 'images'}
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
							{:else if railGroup === 'pdf'}
								{#each PDF_OPS as o (o.id)}
									{@render opButton(o.id, o.label, pdfOp === o.id, () => onpdfop(o.id))}
								{/each}
							{:else if railGroup === 'font'}
								{#each FONT_OPS as o (o.id)}
									{@render opButton(o.id, o.label, fontOp === o.id, () => onfontop(o.id))}
								{/each}
							{:else}
								{#each ZIP_OPS as o (o.id)}
									{@render opButton(o.id, o.label, zipOp === o.id, () => onzipop(o.id))}
								{/each}
							{/if}
						</svelte:element>
					</div>
				{/key}
			</div>
		</div>
	</div>
</div>
