<script lang="ts">
	import type { EbookSettings } from '$lib/types';
	import SegmentedControl from './SegmentedControl.svelte';
	import Slider from '../Slider.svelte';

	interface Props {
		settings: EbookSettings;
	}

	let { settings = $bindable() }: Props = $props();

	const dimensions = [
		{ id: 'off', label: 'Off' },
		{ id: '1200', label: '1200 px' },
		{ id: '1600', label: '1600 px' },
		{ id: '2048', label: '2048 px' }
	];
</script>

<div>
	<Slider id="ebook-quality" label="Image quality" bind:value={settings.quality} min={1} max={100} />
	<p class="mt-2 hint text-faint">
		{#if settings.quality === 100}
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
		Downscale-only cap on the longest side — 1600 px comfortably covers e-readers and tablets.
	</p>
</div>
