<script lang="ts">
	import type {
		FileFormat,
		FontOp,
		UploadedFile,
		CompressedFile,
		TabState,
		PdfOp,
		ProgressInfo
	} from '$lib/types';
	import { IMAGE_FORMATS, isLosslessAudioFormat } from '$lib/types';
	import { compressFiles, runPdfTool, runZipTool } from '$lib/compress';
	import { settings } from '$lib/stores/settings.svelte';
	import { abortAll } from '$lib/workers/rpc';
	import type { WorkerKind } from '$lib/workers/protocol';
	import { downloadFile, downloadAllAsZip } from '$lib/download';
	import { familyOf, matchesAccept, routeFileToFormat, TAB_ACCEPT } from '$lib/routing';
	import { formatBytes, toUploadedFiles } from '$lib/utils';
	import { mediaMeta, probeMedia, removeMeta } from '$lib/media-meta.svelte';
	import { fontMeta, probeFont, removeFontMeta } from '$lib/font-meta.svelte';
	import { estimateAudioBytes, estimateVideoBytes } from '$lib/video-estimate';
	import * as actionLabels from '$lib/action-labels';
	import Tabs, { type TabBadgeStatus } from '$lib/components/Tabs.svelte';
	import FileUpload from '$lib/components/FileUpload.svelte';
	import CompressionControls from '$lib/components/CompressionControls.svelte';
	import CompressButton from '$lib/components/controls/CompressButton.svelte';
	import DownloadAllZip from '$lib/components/DownloadAllZip.svelte';
	import FileList from '$lib/components/FileList.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import CompareModal from '$lib/components/CompareModal.svelte';
	import SavingsSummary from '$lib/components/SavingsSummary.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import FormatInfo from '$lib/components/FormatInfo.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { seoFor, converterFor, pathFor } from '$lib/seo';
	import { page } from '$app/state';
	import { goto, afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { fade } from 'svelte/transition';
	import { reveal, pop } from '$lib/motion/reveal';
	import { heroSqueeze } from '$lib/motion/logo';

	// Tabs are real routes (/compress-jpg …) sharing this one page component, so
	// navigating between them never remounts — per-tab state below survives.
	const seo = $derived(seoFor(page.params.tool));
	const conv = $derived(converterFor(page.params.tool));
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
		exif: emptyTab()
	});

	// Persisted per-tab settings (localStorage-backed store).

	const IMAGE_ACCEPT =
		'image/jpeg,image/png,image/webp,image/gif,image/avif,.jpg,.jpeg,.png,.webp,.gif,.avif';

	let pdfOp = $derived(settings.pdf.op);
	let zipOp = $derived(settings.zip.op);
	let fontOp = $derived(settings.font.op);

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
	let pageTitle = $derived.by(() => {
		const running = Object.values(tabStates).find((s) => s.isCompressing);
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

	function handleFiles(files: UploadedFile[], format: FileFormat = activeTab) {
		const state = tabStates[format];
		if (state.isCompressing) return; // additions mid-run would desync files ↔ results
		state.files = [...state.files, ...files];
		clearResults(state);
		state.error = null;
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
	// entry (graceful cancel keeps those expensive workers alive); zip and exif
	// run on the main thread and need no worker teardown.
	// Cancels are owner-scoped: every callWorker reachable from these kinds must
	// pass `opts.owner` (the run's signal), or it becomes unkillable mid-call.
	const CANCEL_KINDS: Partial<Record<FileFormat, WorkerKind[]>> = {
		jpg: ['image'],
		png: ['image'],
		webp: ['image'],
		gif: ['image'],
		heic: ['image'],
		svg: ['svg', 'image'], // raster (PNG/ICO) output encodes via the image worker
		pdf: ['gs', 'image'], // fromImages re-encodes pages via the image worker
		font: ['font'] // synchronous brotli — terminate is the only mid-encode cancel
	};

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
			const pdfSettings = settings.pdf;
			if (tab === 'zip') {
				const out = await runZipTool(state.files, settings.zip, onProgress, controller.signal);
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
	}

	function handleZipOpChange(op: 'create' | 'extract') {
		if (op === settings.zip.op) return;
		const state = tabStates.zip;
		clearResults(state);
		state.error = null;
		// Create takes anything, extract takes archives — mixing makes no sense.
		for (const f of state.files) URL.revokeObjectURL(f.objectUrl);
		state.files = [];
		settings.zip.op = op;
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
	afterNavigate(() => {
		const preset = converterFor(page.params.tool)?.preset;
		if (!preset) return;
		if (preset.kind === 'image') {
			settings[preset.tab].outputFormat = preset.to;
			if (preset.quality != null) settings[preset.tab].quality = preset.quality;
			// Target-size landing pages ship the mode flipped and the cap typed in.
			if (preset.mode) settings[preset.tab].mode = preset.mode;
			if (preset.targetKb != null) settings[preset.tab].targetKb = preset.targetKb;
		} else if (preset.kind === 'image-any') {
			// Universal image intake — the tab defaults (Auto format) ARE the preset.
		} else if (preset.kind === 'svg') {
			settings.svg.outputFormat = preset.to;
		} else if (preset.kind === 'video') {
			settings.video.container = preset.container;
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
		} else if (preset.kind === 'resize') {
			for (const tab of IMAGE_FORMATS) {
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
		if (!groups.size) {
			if (firstUnknown) {
				tabStates[activeTab].error =
					`Unsupported file type: ${firstUnknown}` +
					(unknownCount > 1 ? ` (+${unknownCount - 1} more)` : '');
			}
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
		// Unroutable files in a mixed drop must not vanish silently — banner the
		// tab the user will actually be looking at. Placed AFTER the handleFiles
		// loop, which clears each parked tab's error.
		if (firstUnknown) {
			const dest = navigate && first ? first : activeTab;
			tabStates[dest].error =
				`Unsupported file type: ${firstUnknown}` +
				(unknownCount > 1 ? ` (+${unknownCount - 1} more)` : '');
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
		return () => {
			for (const state of Object.values(tabStates)) {
				for (const f of state.files) URL.revokeObjectURL(f.objectUrl);
				for (const r of state.results) URL.revokeObjectURL(r.objectUrl);
				// Mid-run teardown: finished-but-uncommitted results aren't in
				// state.results yet (they merge when the run settles).
				for (const r of state.finished) URL.revokeObjectURL(r.objectUrl);
				if (state.combinedResult) URL.revokeObjectURL(state.combinedResult.objectUrl);
			}
		};
	});
</script>

<Seo entry={seo} title={pageTitle} />

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
<div class="reveal-css mb-6 sm:mb-8" style="--reveal-i: 1">
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
		<span class="rounded-full bg-card/70 px-3 py-1.5 backdrop-blur-xs">No uploads</span>
		<span class="rounded-full bg-card/70 px-3 py-1.5 backdrop-blur-xs">No ads</span>
		<span class="rounded-full bg-card/70 px-3 py-1.5 backdrop-blur-xs">Free & open source</span>
	</div>
</div>

<!-- THE TOOL -->
<div class="reveal-css space-y-3" style="--reveal-i: 2">
	<!-- Intake card: tabs + dropzone -->
	<div class="overflow-hidden rounded-card bg-card">
		<Tabs
			{activeTab}
			counts={tabCounts}
			progress={tabProgress}
			status={tabStatus}
			{pdfOp}
			{zipOp}
			{fontOp}
			onpdfop={handlePdfOpChange}
			onzipop={handleZipOpChange}
			onfontop={handleFontOpChange}
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
						: activeTab === 'zip'
							? zipOp === 'create'
								? 'files'
								: 'ZIP archives'
							: undefined)}
			compact={currentState.files.length > 0}
			disabled={currentState.isCompressing}
		/>
	</div>

	{#if currentState.files.length > 0}
		<!-- Settings card -->
		<div class="overflow-hidden rounded-card bg-card">
			<CompressionControls
				format={activeTab}
				bind:settings={settings[activeTab]}
				bind:advancedOpen
				isCompressing={currentState.isCompressing}
				{totalOriginalSize}
				{estimatedSize}
				{fontAxes}
			/>
		</div>

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

<p
	class="reveal-css mt-3 flex items-center justify-center gap-1.5 text-xs text-faint"
	style="--reveal-i: 2.5"
>
	<Icon name="lock" class="size-3 shrink-0" />
	Files never leave your device — everything runs in your browser.
</p>

<FormatInfo entry={seo} />

<CompareModal
	original={compareData?.original ?? null}
	compressed={compareData?.compressed ?? null}
	format={compareData?.format ?? activeTab}
	onclose={() => (compareData = null)}
/>
