<script lang="ts">
	import type { EbookSettings } from '$lib/types';
	import SegmentedControl from './SegmentedControl.svelte';
	import Slider from '../Slider.svelte';

	interface Props {
		settings: EbookSettings;
		/** Names of the tab's uploaded files — the output segments only show
		 *  when the batch holds a file they can act on. */
		fileNames?: string[];
	}

	let { settings = $bindable(), fileNames = [] }: Props = $props();

	// TXT reads EPUBs, PDF lays out comics — a segment that can't succeed for
	// ANY uploaded file is hidden rather than left to error on run. Mixed
	// batches keep both (per-file guards in compress.ts stay the arbiter, and
	// also cover renamed/mislabeled files this extension check can't see).
	const hasEpub = $derived(fileNames.some((n) => /\.epub$/i.test(n)));
	const hasComic = $derived(fileNames.some((n) => /\.(cbz|cbr)$/i.test(n)));
	const showTxt = $derived(!hasComic || hasEpub);
	const showPdf = $derived(!hasEpub || hasComic);
	const outputs = $derived([
		{ id: 'auto', label: 'Compress' },
		...(showTxt ? [{ id: 'txt', label: 'To TXT' }] : []),
		...(showPdf ? [{ id: 'pdf', label: 'To PDF' }] : [])
	]);

	$effect(() => {
		// A selection whose segment just vanished (persisted `to`, or the batch
		// changed under it) snaps VISIBLY back to compress — never a hidden
		// state the CTA doesn't reflect.
		if ((settings.to === 'txt' && !showTxt) || (settings.to === 'pdf' && !showPdf)) {
			settings.to = 'auto';
		}
	});

	const dimensions = [
		{ id: 'off', label: 'Off' },
		{ id: '1200', label: '1200 px' },
		{ id: '1600', label: '1600 px' },
		{ id: '2048', label: '2048 px' }
	];
</script>

<div class="panel-span">
	<SegmentedControl
		items={outputs}
		selected={settings.to}
		onselect={(id) => (settings.to = id as EbookSettings['to'])}
	/>
</div>
{#if settings.to === 'txt'}
	<div class="panel-span">
		<p class="hint text-faint">
			Reads an EPUB's chapters in book order and saves them as one plain-text file — paragraphs
			kept, markup dropped. Everything happens in this tab; the book never leaves your device.
		</p>
	</div>
{:else}
	<div>
		<Slider
			id="ebook-quality"
			label="Image quality"
			bind:value={settings.quality}
			min={1}
			max={100}
		/>
		<p class="mt-2 hint text-faint">
			{#if settings.to === 'pdf'}
				JPEG pages are embedded into the PDF byte-for-byte and PNG pages pixel-exact — quality
				only applies to WebP/GIF pages, which need one re-encode to JPEG.
			{:else if settings.quality === 100}
				Pages that would grow stay untouched — at 100 this is effectively a lossless repack.
			{:else}
				Only the images inside are re-encoded (in their own format) — text, styles and layout stay
				byte-identical.
			{/if}
		</p>
	</div>
	<div>
		<p class="microlabel text-muted">Max image size</p>
		<div class="mt-2.5">
			<SegmentedControl
				fit
				items={dimensions}
				selected={settings.maxDimension === null ? 'off' : String(settings.maxDimension)}
				onselect={(id) => (settings.maxDimension = id === 'off' ? null : Number(id))}
			/>
		</div>
		<p class="mt-2 hint text-faint">
			{#if settings.to === 'pdf'}
				Applies to re-encoded WebP/GIF pages only — losslessly embedded JPEG/PNG pages keep their
				full resolution.
			{:else}
				Downscale-only cap on the longest side — 1600 px comfortably covers e-readers and tablets.
			{/if}
		</p>
	</div>
{/if}
