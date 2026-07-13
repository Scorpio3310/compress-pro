<script lang="ts">
	import { isLosslessAudioFormat, type AudioConversionSettings } from '$lib/types';
	import SegmentedControl from './SegmentedControl.svelte';
	import Pill from './Pill.svelte';

	interface Props {
		settings: AudioConversionSettings;
		/** Predicted output size (page-computed from probed durations). */
		estimatedSize?: string | null;
	}

	let { settings = $bindable(), estimatedSize = null }: Props = $props();

	const outputs: { id: AudioConversionSettings['outputFormat']; label: string }[] = [
		{ id: 'mp3', label: 'MP3' },
		{ id: 'm4a', label: 'M4A' },
		{ id: 'wav', label: 'WAV' },
		{ id: 'flac', label: 'FLAC' },
		{ id: 'ogg', label: 'OGG' },
		{ id: 'opus', label: 'OPUS' },
		{ id: 'weba', label: 'WEBA' }
	];
	const outputHints: Record<AudioConversionSettings['outputFormat'], string> = {
		mp3: 'Plays everywhere — the safe default.',
		m4a: 'AAC — better quality per byte than MP3; Apple-friendly.',
		wav: 'Uncompressed PCM — lossless; expect roughly 10 MB per minute of stereo audio.',
		flac: 'Lossless like WAV at roughly half the size — the archival pick.',
		ogg: 'Opus — best quality per byte; plays in browsers and apps.',
		opus: 'The same Opus audio under the .opus name voice apps use.',
		weba: 'Opus in a WebM wrapper — made for web players and embeds.'
	};
	const audioModes = [
		{ id: 'quality', label: 'Bitrate' },
		{ id: 'target', label: 'Target size' }
	];
	const bitrates = [320, 256, 192, 128, 96, 64] as const;

	// Lossless outputs (WAV, FLAC) — bitrate/target knobs mean nothing there.
	let isLossless = $derived(isLosslessAudioFormat(settings.outputFormat));
</script>

{#if !isLossless}
	<div class="panel-span">
		<SegmentedControl
			items={audioModes}
			selected={settings.mode}
			onselect={(id) => (settings.mode = id as AudioConversionSettings['mode'])}
		/>
	</div>

	{#if settings.mode === 'quality'}
		<div>
			<p class="microlabel text-muted">Bitrate</p>
			<div class="mt-2.5 flex flex-wrap gap-2">
				{#each bitrates as kbps (kbps)}
					<Pill
						active={settings.bitrateKbps === kbps}
						mono
						onclick={() => (settings.bitrateKbps = kbps)}
					>
						{kbps}
					</Pill>
				{/each}
			</div>
			<p class="mt-2 hint text-faint">
				In kbps — 192 is transparent for music, 96 is fine for voice.{estimatedSize
					? ` · est ~${estimatedSize}`
					: ''}
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
					Picks the bitrate that fits the target from the audio duration (32–320 kbps).
				</p>
			</div>
		</div>
	{/if}
{/if}

<div>
	<p class="microlabel text-muted">Output format</p>
	<div class="mt-2.5 flex flex-wrap gap-2">
		{#each outputs as fmt (fmt.id)}
			<Pill
				active={settings.outputFormat === fmt.id}
				onclick={() => (settings.outputFormat = fmt.id)}
			>
				{fmt.label}
			</Pill>
		{/each}
	</div>
	<p class="mt-2 hint text-faint">{outputHints[settings.outputFormat]}</p>
</div>
