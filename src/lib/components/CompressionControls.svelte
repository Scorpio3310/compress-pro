<script lang="ts">
	import type {
		FileFormat,
		ImageCompressionSettings,
		SvgCompressionSettings,
		PdfCompressionSettings,
		VideoConversionSettings,
		AudioConversionSettings,
		FontConversionSettings,
		ZipSettings,
		ExifSettings
	} from '$lib/types';
	import { isImageFormat } from '$lib/types';
	import type { FontAxisInfo } from '$lib/workers/protocol';
	import { reveal } from '$lib/motion/reveal';
	import ImageControls from './controls/ImageControls.svelte';
	import SvgControls from './controls/SvgControls.svelte';
	import PdfControls from './controls/PdfControls.svelte';
	import VideoControls from './controls/VideoControls.svelte';
	import AudioControls from './controls/AudioControls.svelte';
	import FontControls from './controls/FontControls.svelte';
	import ArchiveControls from './controls/ArchiveControls.svelte';
	import ExifControls from './controls/ExifControls.svelte';
	import AdvancedDisclosure from './controls/AdvancedDisclosure.svelte';
	import ImageAdvanced from './controls/ImageAdvanced.svelte';
	import VideoAdvanced from './controls/VideoAdvanced.svelte';
	import SvgAdvanced from './controls/SvgAdvanced.svelte';

	interface Props {
		format: FileFormat;
		settings:
			| ImageCompressionSettings
			| SvgCompressionSettings
			| PdfCompressionSettings
			| VideoConversionSettings
			| AudioConversionSettings
			| FontConversionSettings
			| ZipSettings
			| ExifSettings;
		isCompressing: boolean;
		totalOriginalSize: number;
		/** Predicted output size for the video/audio tabs (page-computed — it
		 *  needs the files' probed duration/dimensions). */
		estimatedSize?: string | null;
		/** Variable axes of the font tab's files (page-computed from probes). */
		fontAxes?: FontAxisInfo[];
		/** The Advanced disclosure's open state — owned by the page so presets
		 *  (e.g. /resize-image) can open it. */
		advancedOpen: boolean;
	}

	let {
		format,
		settings = $bindable(),
		isCompressing,
		totalOriginalSize,
		estimatedSize = null,
		fontAxes = [],
		advancedOpen = $bindable()
	}: Props = $props();

	let isImage = $derived(isImageFormat(format));

	// The settings union is narrowed exactly once per format here; the
	// per-format components below take the concrete type.
	let imageSettings = $derived(settings as ImageCompressionSettings);
	let svgSettings = $derived(settings as SvgCompressionSettings);
	let pdfSettings = $derived(settings as PdfCompressionSettings);
	let videoSettings = $derived(settings as VideoConversionSettings);
	let audioSettings = $derived(settings as AudioConversionSettings);
	let fontSettings = $derived(settings as FontConversionSettings);
	let zipSettings = $derived(settings as ZipSettings);
	let exifSettings = $derived(settings as ExifSettings);

	// Tabs whose secondary controls live behind the Advanced disclosure. The
	// SVGO switches apply only to SVG output — raster (PNG/ICO) renders the
	// original vector, so the disclosure disappears there.
	let hasAdvanced = $derived(
		isImage || format === 'video' || (format === 'svg' && svgSettings.outputFormat === 'svg')
	);

	// The resize preset (or a returning user's saved settings) leaves a
	// dimension cap active while the disclosure is collapsed — without this
	// summary the plain compress tools would silently downscale.
	let advancedSummary = $derived(
		isImage && imageSettings.maxDimension ? `Max ${imageSettings.maxDimension} px` : null
	);
</script>

<!-- The settings panel — the CTA lives in the page's action card at the
     bottom of the flow, so this component is settings-only. -->
<div class={isCompressing ? 'shimmer' : ''} {@attach reveal({ y: 6 })}>
	<!-- settings go inert while a job runs; the CTA in the action card stays live -->
	<div
		class="transition-opacity duration-300 {isCompressing ? 'pointer-events-none opacity-50' : ''}"
		inert={isCompressing}
	>
		<div class="panel-grid">
			{#if isImage}
				<ImageControls {format} bind:settings={imageSettings} {totalOriginalSize} />
			{:else if format === 'svg'}
				<SvgControls bind:settings={svgSettings} />
			{:else if format === 'pdf'}
				<PdfControls bind:settings={pdfSettings} />
			{:else if format === 'video'}
				<VideoControls bind:settings={videoSettings} {estimatedSize} />
			{:else if format === 'audio'}
				<AudioControls bind:settings={audioSettings} {estimatedSize} />
			{:else if format === 'font'}
				<FontControls bind:settings={fontSettings} {fontAxes} />
			{:else if format === 'zip'}
				<ArchiveControls bind:settings={zipSettings} />
			{:else if format === 'exif'}
				<ExifControls bind:settings={exifSettings} />
			{/if}
		</div>
		{#if hasAdvanced}
			<AdvancedDisclosure bind:open={advancedOpen} summary={advancedSummary}>
				{#if isImage}
					<ImageAdvanced {format} bind:settings={imageSettings} />
				{:else if format === 'video'}
					<VideoAdvanced bind:settings={videoSettings} />
				{:else if format === 'svg'}
					<SvgAdvanced bind:settings={svgSettings} />
				{/if}
			</AdvancedDisclosure>
		{/if}
	</div>
</div>
