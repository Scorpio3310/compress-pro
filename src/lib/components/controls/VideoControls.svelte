<script lang="ts">
	import type { VideoConversionSettings } from '$lib/types';
	import SegmentedControl from './SegmentedControl.svelte';
	import Slider from '../Slider.svelte';

	interface Props {
		settings: VideoConversionSettings;
		/** Predicted output size (page-computed from probed metadata). */
		estimatedSize?: string | null;
	}

	let { settings = $bindable(), estimatedSize = null }: Props = $props();

	const containers = [
		{ id: 'mp4', label: 'MP4' },
		{ id: 'mov', label: 'MOV' },
		{ id: 'webm', label: 'WebM' },
		{ id: 'gif', label: 'GIF' }
	];
	const videoModes = [
		{ id: 'quality', label: 'Quality' },
		{ id: 'target', label: 'Target size' }
	];

	const GIF_FPS = [15, 10, 5];
	let isGif = $derived(settings.container === 'gif');

	function selectContainer(id: string) {
		settings.container = id as VideoConversionSettings['container'];
		// Keep fps inside the visible option set when hopping formats.
		if (id === 'gif' && !GIF_FPS.includes(settings.fps as number)) settings.fps = 15;
		if (id !== 'gif' && GIF_FPS.includes(settings.fps as number)) settings.fps = 'original';
	}
</script>

{#if !isGif}
	<div class="panel-span">
		<SegmentedControl
			items={videoModes}
			selected={settings.mode}
			onselect={(id) => (settings.mode = id as VideoConversionSettings['mode'])}
		/>
	</div>
{/if}

{#if settings.mode === 'quality' || isGif}
	<div>
		<Slider
			id="quality"
			label="Quality"
			bind:value={settings.quality}
			min={1}
			max={100}
			detail={estimatedSize ? `est ~${estimatedSize}` : null}
		/>
		<p class="mt-2 hint text-faint">
			{isGif
				? 'Sets how many colors the GIF keeps — lower means smaller files.'
				: 'Sets how strongly the video is compressed — tuned to its resolution and frame rate.'}
		</p>
	</div>
{:else}
	<div>
		<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
			<label for="target-size" class="microlabel sm:self-end text-muted">Target size</label>
			<div class="relative row-span-2 justify-self-end max-sm:row-span-1">
				<input
					id="target-size"
					type="number"
					inputmode="decimal"
					min="0.1"
					max="10000"
					step="0.1"
					bind:value={settings.targetMb}
					class="h-10 w-28 rounded-field border border-line-strong bg-card pr-9 pl-3 text-right font-mono text-base text-ink transition-colors tabular-nums placeholder:text-faint focus-visible:border-accent sm:text-sm"
				/>
				<span
					class="microlabel pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-faint"
					>MB</span
				>
			</div>
			<p class="mt-0.5 hint text-faint sm:self-start max-sm:col-span-2">
				Aims the bitrate at the target, then verifies and re-encodes once if needed — handy for 25
				MB email or Discord limits.
			</p>
		</div>
	</div>
{/if}

<div>
	<p class="microlabel text-muted">Output format</p>
	<div class="mt-2.5">
		<SegmentedControl
			fit
			items={containers}
			selected={settings.container}
			onselect={selectContainer}
		/>
	</div>
	<p class="mt-2 hint text-faint">
		{settings.container === 'mp4'
			? 'H.264 + AAC — plays everywhere.'
			: settings.container === 'mov'
				? 'H.264 + AAC in a QuickTime container — for Apple, Final Cut and Premiere workflows.'
				: settings.container === 'webm'
					? 'VP9 + Opus — smaller at the same quality, plays in browsers.'
					: 'Animated GIF — silent, loops forever, works in chats and docs.'}
	</p>
</div>

<!-- Max dimension + Frame rate + Remove audio live in VideoAdvanced (the Advanced disclosure). -->
