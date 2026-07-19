<script lang="ts">
	import type { ModelSettings } from '$lib/types';
	import SegmentedControl from './SegmentedControl.svelte';
	import Slider from '../Slider.svelte';

	interface Props {
		settings: ModelSettings;
	}

	let { settings = $bindable() }: Props = $props();

	const codecs = [
		{ id: 'none', label: 'None' },
		{ id: 'draco', label: 'Draco' },
		{ id: 'meshopt', label: 'Meshopt' }
	];
	const textureDims = [
		{ id: 'off', label: 'Off' },
		{ id: '1024', label: '1024 px' },
		{ id: '2048', label: '2048 px' }
	];
</script>

<div>
	<p class="microlabel mb-2.5 text-muted">Geometry compression</p>
	<SegmentedControl
		items={codecs}
		selected={settings.compression}
		onselect={(id) => (settings.compression = id as ModelSettings['compression'])}
	/>
	<p class="mt-2 hint text-faint">
		{#if settings.compression === 'draco'}
			Strong compression via Google Draco — viewers need Draco support (three.js, Babylon,
			&lt;model-viewer&gt; and most engines have it built in).
		{:else if settings.compression === 'meshopt'}
			Fast, GPU-friendly compression — needs the meshopt decoder in the viewer (bundled with
			three.js and Babylon).
		{:else}
			No decoder needed anywhere — geometry is quantized only, so the file opens in every glTF
			viewer as-is.
		{/if}
	</p>
</div>
<div>
	<!-- Title + off-hint stack on the left so the hint sits right under the
	     title; the switch rides the title line instead of stretching the row. -->
	<label class="flex items-start justify-between gap-3 py-1">
		<span>
			<span class="microlabel block text-muted">Simplify geometry</span>
			{#if settings.simplify === null}
				<span class="mt-1.5 block hint text-faint">Off — the mesh keeps every triangle.</span>
			{/if}
		</span>
		<input
			type="checkbox"
			class="switch shrink-0"
			checked={settings.simplify !== null}
			onchange={(e) => (settings.simplify = e.currentTarget.checked ? 50 : null)}
		/>
	</label>
	{#if settings.simplify !== null}
		<Slider
			id="model-simplify"
			label="Keep triangles"
			bind:value={settings.simplify}
			min={1}
			max={100}
		/>
		<p class="mt-2 hint text-faint">
			Reduces the triangle count — permanent detail loss, biggest wins on dense scans and
			photogrammetry.
		</p>
	{/if}
</div>
<div>
	<Slider
		id="model-texture-quality"
		label="Texture quality"
		bind:value={settings.textureQuality}
		min={1}
		max={100}
	/>
	<p class="mt-2 hint text-faint">
		Embedded JPEG textures re-encode at this quality; PNGs only resize. A texture that would grow
		stays original.
	</p>
</div>
<div>
	<p class="microlabel text-muted">Max texture size</p>
	<div class="mt-2.5">
		<SegmentedControl
			fit
			items={textureDims}
			selected={settings.textureMaxDimension === null ? 'off' : String(settings.textureMaxDimension)}
			onselect={(id) => (settings.textureMaxDimension = id === 'off' ? null : Number(id))}
		/>
	</div>
	<p class="mt-2 hint text-faint">
		Downscale-only cap — 4K textures are the usual culprit in oversized web models.
	</p>
</div>
