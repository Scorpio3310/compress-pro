<script lang="ts">
	import type { FontConversionSettings, FontFormat } from '$lib/types';
	import type { FontAxisInfo } from '$lib/workers/protocol';
	import { collectCodepoints, SUBSET_PRESETS } from '$lib/codecs/subset-charsets';
	import Pill from './Pill.svelte';
	import SegmentedControl from './SegmentedControl.svelte';

	interface Props {
		settings: FontConversionSettings;
		/** Union of the uploaded files' variable axes (page-computed from probes). */
		fontAxes?: FontAxisInfo[];
	}

	let { settings = $bindable(), fontAxes = [] }: Props = $props();

	const outputs: { id: FontFormat; label: string }[] = [
		{ id: 'woff2', label: 'WOFF2' },
		{ id: 'woff', label: 'WOFF' },
		{ id: 'ttf', label: 'TTF' },
		{ id: 'otf', label: 'OTF' },
		{ id: 'eot', label: 'EOT' }
	];

	// One honest line per target. TTF/OTF spell out the flavor rule: outlines
	// are never converted (that would cost hinting + kerning), so a font of
	// the other flavor keeps its own extension.
	const hints: Record<FontFormat, string> = {
		woff2: 'Smallest — Brotli-compressed; supported by every modern browser.',
		woff: 'Legacy web wrapper — zlib; bigger than WOFF2 but works in very old browsers.',
		ttf: 'Desktop TrueType — installs anywhere. CFF-outline fonts keep .otf (nothing converts lossily).',
		otf: 'Desktop OpenType — installs anywhere. TrueType-outline fonts keep .ttf (nothing converts lossily).',
		eot: 'Legacy Internet Explorer 6–8 format — only needed for ancient sites.'
	};

	// Registered axes get names; anything else shows its raw tag.
	const AXIS_LABELS: Record<string, string> = {
		wght: 'Weight',
		wdth: 'Width',
		ital: 'Italic',
		slnt: 'Slant',
		opsz: 'Optical size'
	};

	const variableModes = [
		{ id: 'keep', label: 'Keep variable' },
		{ id: 'static', label: 'Static instance' }
	];

	let visibleAxes = $derived(fontAxes.filter((axis) => !axis.hidden));
	let requestedCount = $derived(
		collectCodepoints(settings.subsetPresets, settings.subsetText)?.length ?? null
	);

	function togglePreset(id: string) {
		settings.subsetPresets = settings.subsetPresets.includes(id)
			? settings.subsetPresets.filter((p) => p !== id)
			: [...settings.subsetPresets, id];
	}

	// Prefill pins with each axis's default the moment its font is probed —
	// axisValues is runtime-only state (never persisted), so this is per-batch.
	$effect(() => {
		for (const axis of visibleAxes) {
			if (!(axis.tag in settings.axisValues)) settings.axisValues[axis.tag] = axis.def;
		}
	});
</script>

{#if settings.op === 'subset'}
	<div>
		<p class="microlabel text-muted">Character sets</p>
		<div class="mt-2.5 flex flex-wrap gap-2">
			{#each SUBSET_PRESETS as preset (preset.id)}
				<Pill
					active={settings.subsetPresets.includes(preset.id)}
					onclick={() => togglePreset(preset.id)}
				>
					{preset.label}
				</Pill>
			{/each}
		</div>
		<p class="mt-2 hint text-faint">
			Only your selection stays in the font — every glyph outside the ticked ranges and the custom
			text below is removed.
		</p>
	</div>

	<div>
		<label class="block">
			<span class="microlabel text-muted">Custom characters</span>
			<textarea
				rows="2"
				maxlength="1000"
				bind:value={settings.subsetText}
				placeholder="Type or paste the exact characters to keep — e.g. a headline"
				class="mt-2.5 block w-full resize-y rounded-field border border-line-strong bg-card px-3 py-2 text-sm text-ink transition-colors placeholder:text-faint focus-visible:border-accent"
			></textarea>
		</label>
		<p class="mt-1 hint text-faint">
			{requestedCount === null
				? 'Nothing selected — every glyph is kept, the font is only repackaged.'
				: `~${requestedCount.toLocaleString('en-US')} code points requested · space and .notdef always survive.`}
		</p>
	</div>

	<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
		<label for="keep-hinting" class="microlabel cursor-pointer sm:self-end text-muted"
			>Keep hinting</label
		>
		<input
			id="keep-hinting"
			type="checkbox"
			class="switch row-span-2 justify-self-end max-sm:row-span-1"
			bind:checked={settings.keepHinting}
		/>
		<p class="mt-0.5 hint text-faint sm:self-start max-sm:col-span-2">
			Hinting helps old low-DPI screens; stripping it saves a few KB.
		</p>
	</div>

	<div>
		<p class="microlabel text-muted">Variable font</p>
		{#if visibleAxes.length}
			<div class="mt-2.5">
				<SegmentedControl
					items={variableModes}
					selected={settings.variableMode}
					onselect={(id) => (settings.variableMode = id as FontConversionSettings['variableMode'])}
				/>
			</div>
			{#if settings.variableMode === 'static'}
				<div class="mt-3 space-y-4">
					<!-- Unlike the Target-size rows, the hint here is a short mono range —
					     it stays under the label on EVERY width, keeping the input
					     vertically centered beside the pair (no max-sm stacking). -->
					{#each visibleAxes as axis (axis.tag)}
						<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
							<label for="axis-{axis.tag}" class="microlabel self-end text-muted">
								{AXIS_LABELS[axis.tag] ?? axis.tag}
							</label>
							<input
								id="axis-{axis.tag}"
								type="number"
								min={axis.min}
								max={axis.max}
								step="any"
								bind:value={settings.axisValues[axis.tag]}
								class="row-span-2 h-10 w-28 justify-self-end rounded-field border border-line-strong bg-card px-3 text-right font-mono text-base text-ink transition-colors tabular-nums focus-visible:border-accent sm:text-sm"
							/>
							<p class="mt-0.5 self-start hint font-mono text-faint">
								{axis.min}–{axis.max}
							</p>
						</div>
					{/each}
				</div>
				<p class="mt-3 hint text-faint">
					Every axis is pinned at its value — the output is a plain static font.
				</p>
			{:else}
				<p class="mt-2 hint text-faint">The axes stay variable — only the character set shrinks.</p>
			{/if}
		{:else}
			<p class="mt-0.5 hint text-faint">
				Axis controls (weight, width …) appear here automatically when you drop a variable font.
			</p>
		{/if}
	</div>
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
	<p class="mt-2 hint text-faint">{hints[settings.outputFormat]}</p>
	{#if settings.op === 'convert' && visibleAxes.length}
		<p class="mt-1 hint text-faint">
			Variable font detected — switch to Subset to pin a static instance.
		</p>
	{/if}
</div>
