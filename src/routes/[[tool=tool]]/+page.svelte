<script lang="ts">
	import type {
		FileFormat,
		FontOp,
		UploadedFile,
		CompressedFile,
		TabState,
		PdfOp,
		ProgressInfo,
		ZipSettings
	} from '$lib/types';
	import { IMAGE_FORMATS, isBundlingArchiveFormat, isLosslessAudioFormat } from '$lib/types';
	import { settings } from '$lib/stores/settings.svelte';
	import { abortAll, warmUp } from '$lib/workers/rpc';
	import type { WorkerKind } from '$lib/workers/protocol';
	import { downloadFile, downloadAllAsZip } from '$lib/download';
	import { familyOf, matchesAccept, routeFileToFormat, TAB_ACCEPT } from '$lib/routing';
	import { formatBytes, toUploadedFiles } from '$lib/utils';
	import { mediaMeta, probeMedia, removeMeta } from '$lib/media-meta.svelte';
	import { fontMeta, probeFont, removeFontMeta } from '$lib/font-meta.svelte';
	import { estimateAudioBytes, estimateVideoBytes } from '$lib/video-estimate';
	import * as actionLabels from '$lib/action-labels';
	import { FONT_OPS, PDF_OPS, ZIP_OPS, type Rail } from '$lib/rails';
	import Tabs, { type TabBadgeStatus } from '$lib/components/Tabs.svelte';
	import FileUpload from '$lib/components/FileUpload.svelte';
	import CompressButton from '$lib/components/controls/CompressButton.svelte';
	import DownloadAllZip from '$lib/components/DownloadAllZip.svelte';
	import FileList from '$lib/components/FileList.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import CompareModal from '$lib/components/CompareModal.svelte';
	import SavingsSummary from '$lib/components/SavingsSummary.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import FormatInfo from '$lib/components/FormatInfo.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { pathFor, type ConverterPreset } from '$lib/seo';
	import { busyTabsMessage, pickTitleRun } from '$lib/tab-ui';
	import { page } from '$app/state';
	import { goto, afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { fade } from 'svelte/transition';
	import { reveal, pop } from '$lib/motion/reveal';
	import { heroSqueeze } from '$lib/motion/logo';
	import type { PageData } from './$types';

	// Page-split entry/detail/body + demo/directory chunks from +page.ts
	// (converter/demo/directory are undefined/null on pages without them).
	let { data }: { data: PageData } = $props();

	// Tabs are real routes (/compress-jpg …) sharing this one page component, so
	// navigating between them never remounts — per-tab state below survives.
	// The merged entry (lite ⊕ lazy detail) arrives via load, so SSR, hydration
	// and client navigations all see the full head/meta + preset data.
	const seo = $derived(data.entry);
	const conv = $derived(data.converter);
	const activeTab: FileFormat = $derived(seo.format ?? 'jpg');

	// The h1's last word carries the one-shot "squeeze" entrance (heroSqueeze);
	// textContent stays identical, so SEO and h1 assertions are unaffected.
	const h1Parts = $derived.by(() => {
		const match = seo.h1.match(/^(.*\s)?(\S+)$/);
		return { head: match?.[1] ?? '', tail: match?.[2] ?? seo.h1 };
	});

	const emptyTab = (): TabState => ({
		files: [],
		results: [],
		failures: [],
		combinedResult: null,
		isCompressing: false,
		progress: 0,
		progressInfo: null,
		fileProgress: [],
		finished: [],
		etaSeconds: null,
		error: null
	});

	let tabStates: Record<FileFormat, TabState> = $state({
		jpg: emptyTab(),
		png: emptyTab(),
		webp: emptyTab(),
		gif: emptyTab(),
		heic: emptyTab(),
		svg: emptyTab(),
		pdf: emptyTab(),
		video: emptyTab(),
		audio: emptyTab(),
		font: emptyTab(),
		zip: emptyTab(),
		exif: emptyTab(),
		ocr: emptyTab(),
		subtitle: emptyTab(),
		ebook: emptyTab(),
		model: emptyTab(),
		data: emptyTab()
	});

	// Persisted per-tab settings (localStorage-backed store).

	const IMAGE_ACCEPT =
		'image/jpeg,image/png,image/webp,image/gif,image/avif,.jpg,.jpeg,.png,.webp,.gif,.avif';

	let pdfOp = $derived(settings.pdf.op);
	let zipOp = $derived(settings.zip.op);
	let fontOp = $derived(settings.font.op);

	// The active tab's secondary op rail. Image tabs return null — their rail
	// is format links, derived inside Tabs. Item ids/labels are e2e contracts
	// (see rails.ts); the click side effects live in the handle*Change handlers.
	const rail = $derived.by<Rail | null>(() => {
		switch (activeTab) {
			case 'pdf':
				return {
					group: 'pdf',
					label: 'PDF tool',
					items: PDF_OPS,
					value: pdfOp,
					onselect: (id) => handlePdfOpChange(id as PdfOp)
				};
			case 'zip':
				return {
					group: 'zip',
					label: 'ZIP mode',
					items: ZIP_OPS,
					value: zipOp,
					onselect: (id) => handleZipOpChange(id as ZipSettings['op'])
				};
			case 'font':
				return {
					group: 'font',
					label: 'Font tool',
					items: FONT_OPS,
					value: fontOp,
					onselect: (id) => handleFontOpChange(id as FontOp)
				};
			default:
				return null;
		}
	});

	// `/` is the universal intake: it takes any file, parks what belongs on its
	// default tab and routes everything else to the right tool — a first-time
	// visitor never has to pick a tab. Tool pages keep converter semantics.
	let isHome = $derived(!page.params.tool);

	// undefined = FileUpload falls back to the tab default (keeps its "JPG
	// files" subject wording); effectiveAccept is what actually governs drops.
	let dropzoneAccept = $derived(
		conv?.accept ??
			(isHome
				? ''
				: activeTab === 'pdf' && pdfOp === 'fromImages'
					? IMAGE_ACCEPT
					: activeTab === 'zip' && zipOp === 'create'
						? ''
						: activeTab === 'ocr'
							? settings.ocr.op === 'toPdf'
								? 'application/pdf,.pdf'
								: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'
							: undefined)
	);
	let effectiveAccept = $derived(dropzoneAccept ?? TAB_ACCEPT[activeTab]);

	/**
	 * Dropzone park gate: anything the accept attribute admits parks here (a
	 * PNG on the jpg tab means "convert to JPG" — converter-page UX), plus
	 * same-family routed files. Cross-family drops go back through
	 * routeIncomingFiles. The pdf-fromImages carve-out keeps a dropped PDF from
	 * stranding on an images-only op (routeIncomingFiles flips the op instead).
	 *
	 * Home can't use the accept-first rule (its accept is '' = everything) —
	 * only files that ROUTE to the default tab park there; the rest re-route.
	 */
	function shouldParkOnActiveTab(file: File): boolean {
		if (isHome) return routeFileToFormat(file) === activeTab;
		if (matchesAccept(effectiveAccept, file.name, file.type)) return true;
		const routed = routeFileToFormat(file);
		return (
			routed !== null &&
			familyOf(routed) === familyOf(activeTab) &&
			!(activeTab === 'pdf' && pdfOp === 'fromImages' && routed === 'pdf')
		);
	}

	// Carries its own format so the modal survives a tab switch while open.
	let compareData: {
		original: UploadedFile;
		compressed: CompressedFile;
		format: FileFormat;
	} | null = $state(null);

	let currentState = $derived(tabStates[activeTab]);
	let totalOriginalSize = $derived(currentState.files.reduce((sum, f) => sum + f.size, 0));
	// CTA label/validity live here so the button can sit in the action card
	// at the bottom of the flow, detached from the settings panel.
	let ctaLabel = $derived(
		actionLabels.actionLabel(activeTab, settings[activeTab], currentState.files.length)
	);
	let ctaBusyLabel = $derived(actionLabels.busyLabel(activeTab, settings[activeTab]));
	let ctaInvalid = $derived(
		actionLabels.actionInvalid(activeTab, settings[activeTab], currentState.files.length)
	);
	// Live output-size estimate for the video/audio tabs — null while probes
	// are pending or when any file's metadata couldn't be read (no fake math).
	let estimatedSize = $derived.by(() => {
		if (activeTab === 'video' && settings.video.mode === 'quality') {
			const inputs = [];
			for (const f of tabStates.video.files) {
				const meta = mediaMeta(f.id);
				if (!meta) return null;
				inputs.push({ meta, bytes: f.size });
			}
			const est = estimateVideoBytes(inputs, settings.video);
			return est === null ? null : formatBytes(est);
		}
		if (
			activeTab === 'audio' &&
			settings.audio.mode === 'quality' &&
			!isLosslessAudioFormat(settings.audio.outputFormat)
		) {
			const durations = [];
			for (const f of tabStates.audio.files) {
				const meta = mediaMeta(f.id);
				if (!meta) return null;
				durations.push(meta.durationSec);
			}
			const est = estimateAudioBytes(durations, settings.audio.bitrateKbps);
			return est === null ? null : formatBytes(est);
		}
		return null;
	});
	// Union of the probed variable axes across the font tab's files (by tag:
	// widest bounds, first-seen default) — drives the subset op's axis inputs.
	// A font lacking a pinned tag simply ignores it (the worker prunes).
	let fontAxes = $derived.by(() => {
		if (activeTab !== 'font') return [];
		// Plain-object accumulator (local, never reactive) — insertion-ordered.
		const byTag: Record<
			string,
			{ tag: string; min: number; def: number; max: number; hidden: boolean }
		> = {};
		for (const f of tabStates.font.files) {
			const meta = fontMeta(f.id);
			if (!meta) continue;
			for (const axis of meta.axes) {
				const prev = byTag[axis.tag];
				if (!prev) byTag[axis.tag] = { ...axis };
				else {
					prev.min = Math.min(prev.min, axis.min);
					prev.max = Math.max(prev.max, axis.max);
					prev.hidden = prev.hidden && axis.hidden;
				}
			}
		}
		return Object.values(byTag);
	});
	// Advanced disclosure state — survives tab switches (this component never
	// remounts), resets on reload; deliberately not persisted.
	let advancedOpen = $state(false);
	// Soft heads-up only — huge inputs are legitimate, they just take a while.
	const HUGE_FILE_BYTES = 200_000_000;
	let hasHugeFile = $derived(currentState.files.some((f) => f.size > HUGE_FILE_BYTES));
	let tabCounts = $derived(
		Object.fromEntries(
			Object.entries(tabStates).map(([format, state]) => [format, state.files.length])
		) as Partial<Record<FileFormat, number>>
	);
	let tabProgress = $derived(
		Object.fromEntries(
			Object.entries(tabStates).map(([format, state]) => [
				format,
				state.isCompressing ? state.progress : null
			])
		) as Partial<Record<FileFormat, number | null>>
	);
	// Traffic-light badge state per tab: surface problems over finished work,
	// finished over still-waiting. Structural changes (add/remove/reorder) call
	// clearResults, so a touched tab falls back to 'pending' on its own.
	let tabStatus = $derived(
		Object.fromEntries(
			Object.entries(tabStates).map(([format, state]) => [
				format,
				state.isCompressing
					? 'running'
					: state.error || state.failures.length > 0
						? 'error'
						: state.results.length > 0 || state.combinedResult
							? 'done'
							: state.files.length > 0
								? 'pending'
								: null
			])
		) as Partial<Record<FileFormat, TabBadgeStatus | null>>
	);
	// The ACTIVE tab's run wins the title when it is compressing — with runs on
	// several tabs, object order must not decide which one the user watches.
	let pageTitle = $derived.by(() => {
		const running = pickTitleRun(tabStates, activeTab);
		return running ? `(${Math.round(running.progress * 100)}%) ${seo.title}` : seo.title;
	});

	function clearResults(state: TabState) {
		for (const r of state.results) URL.revokeObjectURL(r.objectUrl);
		state.results = [];
		state.failures = [];
		if (state.combinedResult) URL.revokeObjectURL(state.combinedResult.objectUrl);
		state.combinedResult = null;
	}

	/** One failure reads as its own message; several summarize above the rows. */
	function failureBanner(failures: TabState['failures'], fileCount: number): string {
		if (failures.length === 1) return `${failures[0].name}: ${failures[0].error}`;
		return `${failures.length} of ${fileCount} files failed — details are shown on each file`;
	}

	// The settings panel (11 format sub-panels) only renders once a file is added,
	// so load it on demand — keeps it and its panels out of the initial per-page
	// bundle. handleFiles kicks this off the moment a file lands.
	type ControlsComponent = typeof import('$lib/components/CompressionControls.svelte').default;
	let ControlsComp = $state<ControlsComponent | null>(null);
	let controlsLoading = false;
	function loadControls() {
		if (ControlsComp || controlsLoading) return;
		controlsLoading = true;
		void import('$lib/components/CompressionControls.svelte')
			.then((m) => {
				ControlsComp = m.default;
			})
			.catch(() => {
				// Failed chunk fetch (offline before the SW cached it): unlatch so
				// the next file-add retries instead of leaving the panel gone for
				// the rest of the session.
				controlsLoading = false;
			});
	}

	function handleFiles(files: UploadedFile[], format: FileFormat = activeTab) {
		const state = tabStates[format];
		if (state.isCompressing) {
			// Additions mid-run would desync files ↔ results. routeIncomingFiles
			// gates busy tabs before any object URLs exist; any other caller
			// reaching here must not leak the eagerly-created ones.
			for (const f of files) URL.revokeObjectURL(f.objectUrl);
			return;
		}
		state.files = [...state.files, ...files];
		clearResults(state);
		state.error = null;
		// Warm this tab's engine now: a drop precedes the Compress click by
		// seconds, so the worker + its wasm (the 15 MB gs module especially) load
		// during think time instead of stalling behind a dead progress bar.
		const warmKind = warmKindFor(format);
		if (warmKind) warmUp(warmKind);
		// The settings panel + codec orchestration are interaction-gated chunks;
		// load them now (a file just landed) so they're ready when the panel renders
		// / the user clicks Compress, without weighing down first paint.
		loadControls();
		void import('$lib/compress').catch(() => {});
		// duration/dimensions feed the live output-size estimate on these tabs
		if (format === 'video' || format === 'audio') files.forEach(probeMedia);
		// variable axes + glyph counts feed the subset op's axis inputs
		if (format === 'font') files.forEach(probeFont);
	}

	// One controller per tab; runs on different tabs are independent. A cancel
	// on the video tab is graceful (conversion.cancel() via the signal); other
	// tabs run synchronous wasm, so their cancel terminates their worker pools —
	// scoped by kind, so a concurrent run on an unrelated tab keeps its workers.
	const abortControllers: Partial<Record<FileFormat, AbortController>> = {};

	// Worker kinds each tab's pipeline can have in flight. video/audio have no
	// entry (graceful cancel keeps those expensive workers alive).
	// Cancels are owner-scoped: every callWorker reachable from these kinds must
	// pass `opts.owner` (the run's signal), or it becomes unkillable mid-call.
	const CANCEL_KINDS: Partial<Record<FileFormat, WorkerKind[]>> = {
		jpg: ['image', 'vtracer'], // SVG output vectorizes via the vtracer worker
		png: ['image', 'vtracer'],
		webp: ['image'],
		gif: ['image'],
		heic: ['image'],
		svg: ['svg', 'image'], // raster (PNG/ICO) output encodes via the image worker
		pdf: ['gs', 'qpdf', 'image'], // fromImages re-encodes pages via the image worker
		font: ['font'], // synchronous brotli — terminate is the only mid-encode cancel
		zip: ['archive'], // 7zz is synchronous wasm too; fflate fast paths cancel cooperatively
		exif: ['image'], // metadata strip runs in the image worker (transferred buffers)
		ebook: ['archive', 'image'], // CBR/exotic zips read via 7zz; pages re-encode via the image pool
		model: ['model'] // synchronous draco/meshopt wasm — terminate is the only mid-encode cancel
	};

	// The primary worker each tab warms on file-drop (see handleFiles). Only the
	// kind on the critical path is listed; pdf resolves per op in warmKindFor —
	// its worker depends on which tool page the drop lands on.
	const WARM_KIND: Partial<Record<FileFormat, WorkerKind>> = {
		jpg: 'image',
		png: 'image',
		webp: 'image',
		gif: 'image',
		heic: 'image',
		svg: 'svg',
		video: 'video',
		audio: 'video',
		font: 'font',
		zip: 'archive',
		exif: 'image',
		// The re-encode pool is the critical path (EPUB/CBZ read via fflate,
		// no wasm); CBR's 7zz fetches lazily on first extract.
		ebook: 'image',
		// The model worker warm-fetches its draco/meshopt wasm on construction.
		model: 'model'
	};

	// Ghostscript (a 15 MB wasm fetch + compile) backs only compress — and
	// merge when its "compress result" toggle is on; unlock/protect run on the
	// small qpdf worker. pages and toImages run on pdf-lib/pdf.js, which
	// aren't pooled workers; fromImages' critical path is the image worker
	// re-encoding the pages.
	function warmKindFor(format: FileFormat): WorkerKind | null {
		// jpg/png flip to the vtracer engine when SVG output is selected (the
		// /png-to-svg and /jpg-to-svg pages preset it).
		if ((format === 'jpg' || format === 'png') && settings[format].outputFormat === 'svg') {
			return 'vtracer';
		}
		if (format !== 'pdf') return WARM_KIND[format] ?? null;
		const { op, mergeCompress } = settings.pdf;
		if (op === 'compress' || op === 'grayscale' || op === 'toPdfa') return 'gs';
		if (op === 'unlock' || op === 'protect') return 'qpdf';
		if (op === 'merge') return mergeCompress ? 'gs' : null;
		if (op === 'fromImages') return 'image';
		return null;
	}

	async function handleCompress() {
		// Snapshot the tab: activeTab is $derived from the route, so a read after
		// an await sees the tab the user is LOOKING at, not the tab this run
		// belongs to — the finally below would then delete the wrong controller.
		const tab = activeTab;
		const state = tabStates[tab];
		if (state.files.length === 0 || state.isCompressing) return;

		state.isCompressing = true;
		state.progress = 0;
		state.progressInfo = null;
		state.fileProgress = state.files.map(() => ({ fraction: 0, stage: 'queued' }));
		state.finished = [];
		state.etaSeconds = null;
		state.error = null;
		clearResults(state);

		const controller = new AbortController();
		abortControllers[tab] = controller;
		const runStart = performance.now();

		// Files complete in parallel and out of order — track each row on its
		// own and derive the aggregate as the mean of per-file fractions.
		const onProgress = (p: ProgressInfo) => {
			state.fileProgress[p.fileIndex] = {
				fraction: p.stage === 'processing' ? p.fileFraction : 1,
				stage: p.stage
			};
			state.progress = Math.min(
				state.fileProgress.reduce((sum, f) => sum + f.fraction, 0) / p.fileCount,
				1
			);
			if (p.stage === 'processing') state.progressInfo = p;
			else if (state.progressInfo?.fileIndex === p.fileIndex) state.progressInfo = null;

			// ETA from overall throughput, EMA-smoothed so it doesn't jitter;
			// held back until there's enough signal to be meaningful.
			const elapsed = (performance.now() - runStart) / 1000;
			const fraction = state.progress;
			if (fraction > 0.03 && fraction < 1 && elapsed > 2) {
				const raw = (elapsed * (1 - fraction)) / fraction;
				state.etaSeconds = state.etaSeconds == null ? raw : state.etaSeconds * 0.7 + raw * 0.3;
			}
		};

		try {
			// Codec orchestration loads on the click (interaction-gated) so compress.ts
			// and every codec wrapper stay out of the initial per-page bundle; it's
			// prefetched on file-add, so this normally resolves from cache instantly.
			// A failed chunk fetch (offline before the SW cached it, flaky network,
			// stale tab across a deploy) rejects with the browser's internal loader
			// text — "Failed to fetch dynamically imported module: <chunk url>" —
			// which must never reach the banner. Translate it here; the catch
			// below renders the message as-is.
			const { compressFiles, runArchiveTool, runPdfTool } = await import('$lib/compress').catch(
				() => {
					throw new Error(
						"Couldn't load the compression engine — check your connection and try again."
					);
				}
			);
			const pdfSettings = settings.pdf;
			if (tab === 'zip') {
				const out = await runArchiveTool(state.files, settings.zip, onProgress, controller.signal);
				state.results = out.results;
				state.failures = out.failures;
				state.combinedResult = out.combined;
			} else if (tab === 'pdf' && pdfSettings.op !== 'compress') {
				const out = await runPdfTool(state.files, pdfSettings, onProgress, controller.signal);
				state.results = out.results;
				state.failures = out.failures;
				state.combinedResult = out.combined;
			} else {
				const out = await compressFiles(
					state.files,
					tab,
					settings[tab],
					onProgress,
					controller.signal,
					(_i, file) => {
						state.finished = [...state.finished, file];
					}
				);
				state.results = out.results;
				state.failures = out.failures;
			}
			if (state.failures.length > 0) {
				state.error = failureBanner(state.failures, state.files.length);
			}
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Compression failed';
		} finally {
			state.isCompressing = false;
			state.progressInfo = null;
			state.fileProgress = [];
			// same object references now live in state.results — just drop them
			state.finished = [];
			state.etaSeconds = null;
			// Identity-guarded: never delete a newer run's controller on this tab.
			if (abortControllers[tab] === controller) delete abortControllers[tab];
		}
	}

	function handleCancel() {
		const controller = abortControllers[activeTab];
		if (!controller) return;
		controller.abort();
		// Kill this run's in-flight worker calls; finished files keep their
		// results. Kind- AND owner-scoped, so a concurrent run on another tab
		// survives even when it shares a worker kind (all image tabs do).
		const kinds = CANCEL_KINDS[activeTab];
		if (kinds) abortAll(kinds, controller.signal);
	}

	function handleRemove(id: string) {
		const state = tabStates[activeTab];
		const file = state.files.find((f) => f.id === id);
		const result = state.results.find((r) => r.id === id);
		if (file) URL.revokeObjectURL(file.objectUrl);
		if (result) URL.revokeObjectURL(result.objectUrl);
		removeMeta(id);
		removeFontMeta(id);
		state.files = state.files.filter((f) => f.id !== id);
		state.results = state.results.filter((r) => r.id !== id);
		state.failures = state.failures.filter((f) => f.id !== id);
		// The failure banner (and the red tab badge derived from it) must not
		// outlive the row it describes — recompute from the failures that
		// remain; non-failure banners clear like they do on file-add.
		state.error =
			state.failures.length > 0 ? failureBanner(state.failures, state.files.length) : null;
		// A combined output no longer matches the remaining inputs.
		if (state.combinedResult) {
			URL.revokeObjectURL(state.combinedResult.objectUrl);
			state.combinedResult = null;
		}
	}

	function handleMove(id: string, dir: -1 | 1) {
		const state = tabStates[activeTab];
		const index = state.files.findIndex((f) => f.id === id);
		const target = index + dir;
		if (index < 0 || target < 0 || target >= state.files.length) return;
		const next = [...state.files];
		[next[index], next[target]] = [next[target], next[index]];
		state.files = next;
		clearResults(state);
		// clearResults just emptied failures — a banner describing them is stale.
		state.error = null;
	}

	function handleZipOpChange(op: ZipSettings['op']) {
		if (op === settings.zip.op) return;
		const state = tabStates.zip;
		clearResults(state);
		state.error = null;
		// Create takes anything, extract/convert take archives — files only
		// survive a switch that keeps the same input kind.
		if ((op === 'create') !== (settings.zip.op === 'create')) {
			for (const f of state.files) URL.revokeObjectURL(f.objectUrl);
			state.files = [];
		}
		settings.zip.op = op;
		// Convert repacks into a multi-entry archive — a stream target can't.
		if (op === 'convert' && !isBundlingArchiveFormat(settings.zip.outputFormat)) {
			settings.zip.outputFormat = 'zip';
		}
	}

	function handlePdfOpChange(op: PdfOp) {
		const pdfSettings = settings.pdf;
		if (op === pdfSettings.op) return;
		const state = tabStates.pdf;
		clearResults(state);
		state.error = null;
		// From-images consumes images, everything else consumes PDFs.
		if ((op === 'fromImages') !== (pdfSettings.op === 'fromImages')) {
			for (const f of state.files) URL.revokeObjectURL(f.objectUrl);
			state.files = [];
		}
		pdfSettings.op = op;
	}

	function handleFontOpChange(op: FontOp) {
		if (op === settings.font.op) return;
		const state = tabStates.font;
		clearResults(state);
		state.error = null;
		// Both ops consume the same inputs — files stay parked across the switch.
		settings.font.op = op;
	}

	// Converter landing pages preset the tool. afterNavigate fires on hydration
	// ('enter') and on every client navigation while this shared component stays
	// mounted — once per navigation, so manual changes afterwards are never
	// fought. Writes go through the persisted settings store: identical to the
	// user clicking the option themselves.

	/** The tab whose files/settings a preset mutates. null = no-op kinds and
	 *  'resize' (spans every image tab; its loop busy-guards per tab). */
	function presetTargetTab(preset: ConverterPreset): FileFormat | null {
		switch (preset.kind) {
			case 'image':
				return preset.tab;
			case 'image-any':
			case 'data':
			case 'resize':
				return null;
			case 'svg':
				return 'svg';
			case 'video':
				return 'video';
			case 'audio':
				return 'audio';
			case 'font':
			case 'font-op':
				return 'font';
			case 'ocr':
				return 'ocr';
			case 'subtitle':
				return 'subtitle';
			case 'ebook':
				return 'ebook';
			case 'archive':
				return 'zip';
			default:
				// pdf-op, pdf-to-images, pdf-from-images
				return 'pdf';
		}
	}

	afterNavigate(() => {
		// data is this navigation's resolved load output — afterNavigate fires
		// only after load settled and the DOM updated, so the preset is current.
		// Format hubs aren't converters, but their detail may still carry a
		// reset preset (the ebook hub clears a persisted txt/pdf output).
		const preset =
			data.converter?.preset ?? (data.entry as { preset?: ConverterPreset }).preset;
		if (!preset) return;
		// "Identical to the user clicking" also means obeying the busy freeze
		// every click-surface has (inert settings, opsDisabled, gated intake):
		// a preset landing on a mid-run tab would clear the running tab's files
		// (pdf/zip op flips) or flip formats under the in-flight job, which
		// reads settings per file. Skip it — the user can still apply anything
		// by hand once the run settles.
		const target = presetTargetTab(preset);
		if (target && tabStates[target].isCompressing) return;
		if (preset.kind === 'image') {
			settings[preset.tab].outputFormat = preset.to;
			if (preset.quality != null) settings[preset.tab].quality = preset.quality;
			// Target-size landing pages ship the mode flipped and the cap typed in.
			if (preset.mode) settings[preset.tab].mode = preset.mode;
			if (preset.targetKb != null) settings[preset.tab].targetKb = preset.targetKb;
		} else if (preset.kind === 'image-any' || preset.kind === 'data') {
			// Universal image intake / data tab — the tab defaults ARE the preset.
			// ('data' previously fell through to the pdf-from-images fallback,
			// silently flipping the pdf tab's op on every data-converter visit.)
		} else if (preset.kind === 'svg') {
			settings.svg.outputFormat = preset.to;
		} else if (preset.kind === 'video') {
			settings.video.container = preset.container;
			if (preset.removeAudio) settings.video.removeAudio = true;
		} else if (preset.kind === 'audio') {
			settings.audio.outputFormat = preset.output;
		} else if (preset.kind === 'font') {
			handleFontOpChange('convert'); // converter pages always land on Convert
			settings.font.outputFormat = preset.to;
		} else if (preset.kind === 'font-op') {
			handleFontOpChange('subset');
			if (preset.op === 'instance') {
				// Instancing is the page's point: static mode, no charset restriction.
				settings.font.variableMode = 'static';
				settings.font.subsetPresets = [];
				settings.font.subsetText = '';
			}
		} else if (preset.kind === 'pdf-op') {
			handlePdfOpChange(preset.op);
			// Pages-op landings normalize the direction (EB-15 discipline: a
			// persisted 'remove' must not leak into /split-pdf's Extract framing).
			// Other pdf ops never touch pageMode.
			if (preset.op === 'pages') settings.pdf.pageMode = preset.pageMode ?? 'keep';
		} else if (preset.kind === 'ocr') {
			settings.ocr.op = preset.op;
		} else if (preset.kind === 'subtitle') {
			settings.subtitle.to = preset.to;
		} else if (preset.kind === 'ebook') {
			if (preset.quality !== undefined) settings.ebook.quality = preset.quality;
			// No `to` in the preset means the page promises compression — a
			// persisted txt/pdf choice from a converter visit must not leak in.
			settings.ebook.to = preset.to ?? 'auto';
		} else if (preset.kind === 'archive') {
			handleZipOpChange(preset.op);
			if (preset.to) settings.zip.outputFormat = preset.to;
		} else if (preset.kind === 'resize') {
			for (const tab of IMAGE_FORMATS) {
				if (tabStates[tab].isCompressing) continue; // same freeze, per tab
				settings[tab].maxDimension = preset.maxDimension;
			}
			// The preset's whole point is the dimension cap — surface it.
			advancedOpen = true;
		} else if (preset.kind === 'pdf-to-images') {
			handlePdfOpChange('toImages');
			settings.pdf.imageFormat = preset.imageFormat;
		} else {
			handlePdfOpChange('fromImages');
		}
	});

	function handleDownloadCombined() {
		const combined = tabStates[activeTab].combinedResult;
		if (combined) downloadFile(combined);
	}

	function handleCompare(id: string) {
		const original = tabStates[activeTab].files.find((f) => f.id === id);
		const compressed = tabStates[activeTab].results.find((r) => r.id === id);
		if (original && compressed) {
			compareData = { original, compressed, format: activeTab };
		}
	}

	function handleDownload(id: string) {
		const result = tabStates[activeTab].results.find((r) => r.id === id);
		if (result) downloadFile(result);
	}

	function handleDownloadAll() {
		downloadAllAsZip(tabStates[activeTab].results);
	}

	// --- Global paste + drop-anywhere routing ---

	let dragDepth = $state(0);

	function collectFiles(dt: DataTransfer | null): File[] {
		if (!dt) return [];
		const files = [...dt.items]
			.filter((item) => item.kind === 'file')
			.map((item) => item.getAsFile())
			.filter((f): f is File => !!f);
		if (!files.length && dt.files.length) files.push(...dt.files);
		// Historic Firefox bug can list entries twice — dedupe.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- function-local, not reactive state
		const seen = new Set<string>();
		return files.filter((f) => {
			const key = `${f.name}|${f.size}|${f.type}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	function routeIncomingFiles(files: File[], opts: { navigate?: boolean } = {}) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- function-local, not reactive state
		const groups = new Map<FileFormat, File[]>();
		let firstUnknown: string | null = null;
		let unknownCount = 0;
		for (const file of files) {
			const format = routeFileToFormat(file);
			if (!format) {
				firstUnknown ??= file.name;
				unknownCount++;
				continue;
			}
			const group = groups.get(format);
			if (group) group.push(file);
			else groups.set(format, [file]);
		}
		// Busy tabs must not take files (mid-run additions would desync files ↔
		// results) — drop their groups BEFORE toUploadedFiles runs, so no object
		// URLs are ever created for refused files. This also keeps a busy pdf
		// tab's op from being switched out from under its run (below).
		const busyTabs: FileFormat[] = [];
		let busyCount = 0;
		for (const [format, group] of [...groups]) {
			if (!tabStates[format].isCompressing) continue;
			busyTabs.push(format);
			busyCount += group.length;
			groups.delete(format);
		}
		// Named by their nav-pill labels (zip → "Archive") — the message points
		// at tabs the user can actually find on screen, never internal ids.
		const busyMsg = busyTabs.length ? busyTabsMessage(busyCount, busyTabs) : null;
		const unknownMsg = firstUnknown
			? `Unsupported file type: ${firstUnknown}` +
				(unknownCount > 1 ? ` (+${unknownCount - 1} more)` : '')
			: null;
		if (!groups.size) {
			const msg = [busyMsg, unknownMsg].filter(Boolean).join(' ');
			if (msg) tabStates[activeTab].error = msg;
			return;
		}
		// A routed PDF while the pdf tab expects images would be stranded.
		if (groups.has('pdf') && settings.pdf.op === 'fromImages') {
			handlePdfOpChange('compress');
		}
		for (const [format, group] of groups) handleFiles(toUploadedFiles(group), format);
		// Files are already parked in tabStates; navigation reuses this component,
		// so nothing is lost on the way to the target tab's route.
		const first = groups.keys().next().value;
		const navigate = opts.navigate !== false && !!first && first !== activeTab;
		// Refused (busy-tab) and unroutable files must not vanish silently —
		// banner the tab the user will actually be looking at. Placed AFTER the
		// handleFiles loop, which clears each parked tab's error.
		if (busyMsg || unknownMsg) {
			const dest = navigate && first ? first : activeTab;
			tabStates[dest].error = [busyMsg, unknownMsg].filter(Boolean).join(' ');
		}
		if (navigate && first) goto(resolve(pathFor(first)), { noScroll: true, keepFocus: true });
	}

	function handlePaste(event: ClipboardEvent) {
		const files = collectFiles(event.clipboardData);
		if (!files.length) return; // plain text pastes flow through untouched
		event.preventDefault();
		routeIncomingFiles(files);
	}

	function handleWindowDragEnter(event: DragEvent) {
		if (event.dataTransfer?.types?.includes('Files')) dragDepth++;
	}

	function handleWindowDragLeave() {
		dragDepth = Math.max(0, dragDepth - 1);
	}

	function handleWindowDragOver(event: DragEvent) {
		event.preventDefault(); // allows dropping + stops the browser navigating to the file
	}

	function handleWindowDrop(event: DragEvent) {
		dragDepth = 0;
		if (event.defaultPrevented) return; // the per-tab dropzone already took it
		event.preventDefault();
		routeIncomingFiles(collectFiles(event.dataTransfer));
	}

	$effect(() => {
		// Retire the app.html pre-hydration drop guard now that our window ondrop
		// handler (below) is live — the guard preventDefaults every drop, which
		// handleWindowDrop reads as "already taken" and would skip, so leaving it on
		// would silently break drop-to-upload. rAF keeps it on until just past
		// hydration, so a drop in the gap is swallowed but the page never navigates.
		requestAnimationFrame(() =>
			(window as unknown as { __dropGuardOff?: () => void }).__dropGuardOff?.()
		);
	});

	$effect(() => {
		return () => {
			for (const state of Object.values(tabStates)) {
				for (const f of state.files) {
					URL.revokeObjectURL(f.objectUrl);
					// Probe metadata lives in module-level maps — after this page
					// unmounts the ids can never be referenced again.
					removeMeta(f.id);
					removeFontMeta(f.id);
				}
				for (const r of state.results) URL.revokeObjectURL(r.objectUrl);
				// Mid-run teardown: finished-but-uncommitted results aren't in
				// state.results yet (they merge when the run settles).
				for (const r of state.finished) URL.revokeObjectURL(r.objectUrl);
				if (state.combinedResult) URL.revokeObjectURL(state.combinedResult.objectUrl);
			}
		};
	});
</script>

<Seo entry={seo} faq={data.body.faq} title={pageTitle} />

<svelte:window
	onpaste={handlePaste}
	ondragenter={handleWindowDragEnter}
	ondragleave={handleWindowDragLeave}
	ondragover={handleWindowDragOver}
	ondrop={handleWindowDrop}
/>

{#if dragDepth > 0}
	<div
		transition:fade={{ duration: 150 }}
		class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-accent/8 ring-4 ring-accent/50 ring-inset"
	>
		<p
			class="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-ink-contrast shadow-pop"
			{@attach pop()}
		>
			Drop files anywhere
		</p>
	</div>
{/if}

<!-- THE TOOL — a stack of soft cards floating on the canvas: intake,
     settings, files, and the action card at the very bottom of the flow. -->
<!-- Nameplate — on the paper, above the cards -->
<div class="reveal-css reveal-css-lcp mb-6 sm:mb-8" style="--reveal-i: 1">
	<h1 class="text-display text-ink" {@attach heroSqueeze()}>
		{h1Parts.head}<span data-squeeze class="inline-block">{h1Parts.tail}</span>
	</h1>
	<!-- Reserve so tab switches never shift the layout below. Taglines are
	     test-locked to 55–58 chars: on sm+ they always fit one line (1lh);
	     below sm the narrower max-w forces every one of them to exactly two
	     lines, so the 2lh reserve is always full. -->
	<p class="mt-3.5 min-h-[2lh] max-w-[21rem] text-sm text-muted sm:min-h-[1lh] sm:max-w-md">
		{seo.tagline}
	</p>
	<div
		class="mt-4 flex flex-wrap items-center gap-2 font-mono text-[10px] font-medium tracking-[0.1em] text-muted uppercase"
	>
		<span class="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-ink-contrast">
			<Icon name="lock" class="size-3 shrink-0" />
			No uploads — 100% local
		</span>
		<span class="rounded-full bg-card/70 px-3 py-1.5 backdrop-blur-xs">No ads</span>
		<span class="rounded-full bg-card/70 px-3 py-1.5 backdrop-blur-xs">Free & open source</span>
	</div>
</div>

<!-- THE TOOL -->
<div class="reveal-css reveal-css-lcp space-y-3" style="--reveal-i: 2">
	<!-- Intake card: tabs + dropzone -->
	<div class="overflow-hidden rounded-card bg-card">
		<Tabs
			{activeTab}
			counts={tabCounts}
			progress={tabProgress}
			status={tabStatus}
			{rail}
			opsDisabled={currentState.isCompressing}
		/>

		<FileUpload
			format={activeTab}
			onfiles={handleFiles}
			accept={dropzoneAccept}
			shouldPark={shouldParkOnActiveTab}
			onforeign={(files, parkedAny) => routeIncomingFiles(files, { navigate: !parkedAny })}
			routePicks={isHome}
			universalNote={isHome}
			subject={conv?.dropSubject ??
				(isHome
					? currentState.files.length > 0
						? 'files'
						: 'any files'
					: activeTab === 'exif'
						? 'photos'
						: activeTab === 'ocr'
							? settings.ocr.op === 'toPdf'
								? 'PDFs'
								: 'images'
							: activeTab === 'subtitle'
								? 'subtitle files'
								: activeTab === 'ebook'
									? 'EPUB, CBZ or CBR files'
									: activeTab === 'model'
										? 'GLB models'
										: activeTab === 'data'
											? 'CSV, Excel, JSON or YAML files'
											: activeTab === 'zip'
												? zipOp === 'create'
													? 'files'
													: 'archives'
												: undefined)}
			compact={currentState.files.length > 0}
			disabled={currentState.isCompressing}
		/>
	</div>

	{#if currentState.files.length > 0}
		<!-- Settings card — loaded on demand (loadControls); the file list + CTA
		     below render immediately, and this pops in a frame later on cold load. -->
		{#if ControlsComp}
			<div class="overflow-hidden rounded-card bg-card">
				<ControlsComp
					format={activeTab}
					bind:settings={settings[activeTab]}
					bind:advancedOpen
					isCompressing={currentState.isCompressing}
					{totalOriginalSize}
					{estimatedSize}
					{fontAxes}
					ebookFileNames={tabStates.ebook.files.map((f) => f.name)}
				/>
			</div>
		{/if}

		<!-- Files + action card: the list flows straight into the CTA at the very
		     bottom; progress appears right under the click point, and the results
		     summary takes the slot it vacates. -->
		<div class="overflow-hidden rounded-card bg-card">
			{#if hasHugeFile}
				<div
					role="status"
					class="bg-warn-tint px-4 py-4 text-sm text-warn sm:px-5"
					{@attach reveal({ y: 6 })}
				>
					Very large file — compression may take a while and use significant memory.
				</div>
			{/if}

			<FileList
				files={currentState.files}
				results={currentState.results}
				failures={currentState.failures}
				format={activeTab}
				busy={currentState.isCompressing}
				fileProgress={currentState.fileProgress}
				onremove={handleRemove}
				oncompare={handleCompare}
				ondownload={handleDownload}
				reorderable={activeTab === 'pdf' && (pdfOp === 'merge' || pdfOp === 'fromImages')}
				onmove={handleMove}
				combinedResult={currentState.combinedResult}
				ondownloadcombined={handleDownloadCombined}
				compareEnabled={activeTab !== 'video' &&
					activeTab !== 'audio' &&
					activeTab !== 'font' &&
					activeTab !== 'zip' &&
					activeTab !== 'ocr' &&
					activeTab !== 'subtitle' &&
					activeTab !== 'ebook' &&
					activeTab !== 'model' &&
					activeTab !== 'data' &&
					(activeTab !== 'pdf' || pdfOp === 'compress')}
			/>

			<CompressButton
				label={ctaLabel}
				busyLabel={ctaBusyLabel}
				oncompress={handleCompress}
				oncancel={handleCancel}
				disabled={currentState.files.length === 0 || ctaInvalid}
				isCompressing={currentState.isCompressing}
				hasError={!!currentState.error}
				secondary={currentState.results.length > 0}
			>
				{#if currentState.results.length > 1}
					<DownloadAllZip ondownloadall={handleDownloadAll} />
				{:else if currentState.results.length === 1}
					<DownloadAllZip
						label="Download file"
						ondownloadall={() => handleDownload(currentState.results[0].id)}
					/>
				{/if}
			</CompressButton>

			<ProgressBar
				progress={currentState.progress}
				visible={currentState.isCompressing}
				info={currentState.progressInfo}
				filesDone={currentState.fileProgress.filter((f) => f.stage === 'done').length}
				fileCount={currentState.fileProgress.length}
				etaSeconds={currentState.etaSeconds}
				finishedCount={currentState.finished.length}
				ondownloadfinished={() => downloadAllAsZip(currentState.finished)}
			/>

			{#if currentState.error}
				<div
					data-testid="error-banner"
					role="alert"
					class="bg-danger-tint px-4 py-4 text-sm text-danger sm:px-5"
					{@attach reveal({ y: 6 })}
				>
					{currentState.error}
				</div>
			{/if}

			{#if currentState.results.length > 0}
				<SavingsSummary results={currentState.results} />
			{/if}
		</div>
	{:else if currentState.error}
		<!-- No files parked (e.g. an unsupported drop on an empty tab) — the
		     gated block above never renders, but the error must stay visible. -->
		<div
			data-testid="error-banner"
			role="alert"
			class="rounded-card bg-danger-tint px-4 py-4 text-sm text-danger sm:px-5"
			{@attach reveal({ y: 6 })}
		>
			{currentState.error}
		</div>
	{/if}
</div>

<p class="reveal-css mt-3 text-center text-xs text-muted" style="--reveal-i: 2.5">
	<span class="font-medium text-ink">
		<Icon name="lock" class="mr-0.5 inline size-3 align-[-0.14em]" />Files never leave your device.
	</span>
	Everything runs in your browser, nothing touches a server — tools you've used even work offline.
</p>

<FormatInfo
	entry={seo}
	body={data.body}
	demoCompare={data.demoCompare}
	toolDirectory={data.toolDirectory}
/>

<CompareModal
	original={compareData?.original ?? null}
	compressed={compareData?.compressed ?? null}
	format={compareData?.format ?? activeTab}
	onclose={() => (compareData = null)}
/>
