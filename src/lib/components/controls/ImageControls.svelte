<script lang="ts">
	import type { FileFormat, ImageCompressionSettings } from '$lib/types';
	import { formatBytes, estimateCompressedSize } from '$lib/utils';
	import SegmentedControl from './SegmentedControl.svelte';
	import Pill from './Pill.svelte';
	import Slider from '../Slider.svelte';

	interface Props {
		format: FileFormat;
		settings: ImageCompressionSettings;
		totalOriginalSize: number;
	}

	let { format, settings = $bindable(), totalOriginalSize }: Props = $props();

	const imageModes = [
		{ id: 'quality', label: 'Quality' },
		{ id: 'target', label: 'Target size' }
	];

	const outputFormats: { id: ImageCompressionSettings['outputFormat']; label: string }[] = [
		{ id: 'auto', label: 'Auto' },
		{ id: 'jpg', label: 'JPG' },
		{ id: 'png', label: 'PNG' },
		{ id: 'webp', label: 'WebP' },
		{ id: 'gif', label: 'GIF' },
		{ id: 'avif', label: 'AVIF' }
	];
	const ICO_OUTPUT = { id: 'ico', label: 'ICO' } as const;
	const SVG_OUTPUT = { id: 'svg', label: 'SVG' } as const;
	const JXL_OUTPUT = { id: 'jxl', label: 'JXL' } as const;
	const vectorModes = [
		{ id: 'color', label: 'Color' },
		{ id: 'bw', label: 'Black & white' }
	];

	// Target mode exists for quality-parametric encoders only (not GIF/ICO/SVG).
	let targetAvailable = $derived(
		settings.outputFormat !== 'gif' &&
			settings.outputFormat !== 'ico' &&
			settings.outputFormat !== 'svg'
	);

	// HEIC is input-only and photos never want a GIF output; the GIF tab is
	// gif-centric (animation-preserving), so Auto isn't offered there. ICO
	// (favicons) and SVG (vtracer vectorization) are deliberate tools, offered
	// only where their sources live (JPG/PNG tabs) — webp/gif/heic keep their
	// photo/animation focus.
	let availableOutputs = $derived.by(() => {
		// JXL only ever arrives via preset pages (/jpg-to-jxl, /compress-jxl) —
		// Chrome can't render it, so it's never offered as a general pill; the
		// active pill still renders so the preset state is visible (and
		// e2e-assertable). Picking any other pill drops it, like ICO/SVG.
		const withJxl = (list: typeof outputFormats) =>
			settings.outputFormat === 'jxl' ? [...list, JXL_OUTPUT] : list;
		if (format === 'heic') return withJxl(outputFormats.filter((f) => f.id !== 'gif'));
		if (format === 'gif') return withJxl(outputFormats.filter((f) => f.id !== 'auto'));
		if (format === 'jpg' || format === 'png')
			return withJxl([...outputFormats, ICO_OUTPUT, SVG_OUTPUT]);
		return withJxl(outputFormats);
	});

	// PNG at quality 100 is lossless and HEIC input is already HEVC-compressed —
	// a ratio-of-original size estimate would be a lie in both cases.
	let estimatedSize = $derived(
		format !== 'heic' &&
			totalOriginalSize > 0 &&
			settings.mode === 'quality' &&
			settings.outputFormat !== 'ico' &&
			!(settings.outputFormat === 'png' && settings.quality === 100)
			? formatBytes(
					estimateCompressedSize(totalOriginalSize, settings.quality, settings.outputFormat)
				)
			: null
	);
</script>

{#if targetAvailable}
	<div class="panel-span">
		<SegmentedControl
			items={imageModes}
			selected={settings.mode}
			onselect={(id) => (settings.mode = id as ImageCompressionSettings['mode'])}
		/>
	</div>
{/if}

{#if settings.outputFormat === 'ico'}
	<!-- no slider, no target UI — every ICO size is encoded lossless -->
{:else if settings.outputFormat === 'svg'}
	<div class="panel-span">
		<SegmentedControl
			items={vectorModes}
			selected={settings.vectorMode}
			onselect={(id) => (settings.vectorMode = id as ImageCompressionSettings['vectorMode'])}
		/>
	</div>
	<div>
		<Slider
			id="vector-detail"
			label="Detail"
			bind:value={settings.vectorDetail}
			min={0}
			max={100}
		/>
		<p class="mt-2 hint text-faint">
			{settings.vectorMode === 'bw'
				? 'Black & white stencil — filled outlines, ideal for logos and cut files.'
				: 'Higher detail keeps more colors and smaller shapes; lower simplifies harder.'}
		</p>
	</div>
{:else if settings.mode === 'quality' || !targetAvailable}
	<div>
		<Slider
			id="quality"
			label="Quality"
			bind:value={settings.quality}
			min={1}
			max={100}
			detail={estimatedSize ? `est ~${estimatedSize}` : null}
		/>
		{#if settings.outputFormat === 'png'}
			<p class="mt-2 hint text-faint">
				{settings.quality < 100
					? 'Lossy PNG: fewer colors, much smaller file. 100 = lossless.'
					: 'Lossless: pixels stay identical, extra data is stripped.'}
			</p>
		{:else if settings.outputFormat === 'webp' && settings.quality === 100}
			<p class="mt-2 hint text-faint">
				100 = lossless for PNG/GIF sources — photo sources stay high-quality lossy.
			</p>
		{/if}
	</div>
{:else}
	<div>
		<!-- Cell anatomy: title + hint stacked left, control right (row-span-2
		     centers it against both lines); on phones the control sits beside
		     the title and the hint takes the full width below. -->
		<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
			<label for="target-size-kb" class="microlabel sm:self-end text-muted">Target size</label>
			<div class="relative row-span-2 justify-self-end max-sm:row-span-1">
				<input
					id="target-size-kb"
					type="number"
					inputmode="numeric"
					min="1"
					max="1000000"
					step="1"
					bind:value={settings.targetKb}
					class="h-10 w-32 rounded-field border border-line-strong bg-card pr-10 pl-3 text-right font-mono text-base text-ink transition-colors tabular-nums placeholder:text-faint focus-visible:border-accent sm:text-sm"
				/>
				<span
					class="microlabel pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-faint"
					>KB</span
				>
			</div>
			<p class="mt-0.5 hint text-faint sm:self-start max-sm:col-span-2">
				Finds the best quality that still fits under the target (up to {settings.downscaleToTarget
					? 9
					: 5} passes per file).
			</p>
		</div>
		<div class="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
			<label for="downscale-to-target" class="microlabel cursor-pointer sm:self-end text-muted"
				>Allow downscaling</label
			>
			<input
				id="downscale-to-target"
				type="checkbox"
				class="switch row-span-2 justify-self-end max-sm:row-span-1"
				bind:checked={settings.downscaleToTarget}
			/>
			<p class="mt-0.5 hint text-faint sm:self-start max-sm:col-span-2">
				If quality alone can’t reach the target, the image is scaled down — never below 320 px.
			</p>
		</div>
	</div>
{/if}
<div>
	<p class="microlabel text-muted">Output format</p>
	<div class="mt-2.5 flex flex-wrap gap-2">
		{#each availableOutputs as fmt (fmt.id)}
			<Pill
				active={settings.outputFormat === fmt.id}
				onclick={() => (settings.outputFormat = fmt.id)}
			>
				{fmt.label}
			</Pill>
		{/each}
	</div>
	{#if settings.outputFormat === 'ico'}
		<p class="mt-2 hint text-faint">
			Multi-size favicon ICO (16–256 px in one file) — every size is encoded lossless, transparency
			is kept, and non-square images are centered.
		</p>
	{:else if settings.outputFormat === 'auto'}
		<p class="mt-2 hint text-faint">Smallest of JPG/WebP/AVIF per image — animation stays WebP.</p>
	{:else if settings.outputFormat === 'svg'}
		<p class="mt-2 hint text-faint">
			Traced into true vector paths — ideal for logos, icons and flat graphics. Photos come out
			approximate and often larger than the original.
		</p>
	{:else if settings.outputFormat === 'jxl'}
		<p class="mt-2 hint text-faint">
			JPEG XL — smaller than JPG at the same quality (100 = lossless for PNG sources). Browser
			support is still limited, so it shines for storage and archives.
		</p>
	{:else if format === 'gif' && settings.outputFormat === 'webp'}
		<p class="mt-2 hint text-faint">
			Animation is preserved — animated WebP is typically 50–70% smaller than GIF.
		</p>
	{:else if format === 'gif' && settings.outputFormat !== 'gif'}
		<p class="mt-2 bg-warn-tint p-3.5 text-xs leading-relaxed text-warn">
			Animated GIFs convert to a single frame with this output — choose GIF or WebP to keep
			animation.
		</p>
	{:else if format === 'webp' && settings.outputFormat !== 'webp'}
		<p class="mt-2 bg-warn-tint p-3.5 text-xs leading-relaxed text-warn">
			Animated WebP inputs keep their animation only with WebP output — other formats convert to a
			single frame.
		</p>
	{:else if format === 'heic'}
		<p class="mt-2 hint text-faint">
			HEIC is already heavily compressed — converted files are often larger than the original.
		</p>
	{/if}
</div>
<!-- Max dimension + Keep metadata live in ImageAdvanced (the Advanced disclosure). -->
