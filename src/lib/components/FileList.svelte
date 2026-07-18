<script lang="ts">
	import type {
		FileFormat,
		UploadedFile,
		CompressedFile,
		FileFailure,
		FileProgress
	} from '$lib/types';
	import { formatBytes, formatSignedPercent } from '$lib/utils';
	import { isImageFormat } from '$lib/types';
	import { displayableImageMime } from '$lib/file-visual';
	import { canCopyToClipboard, copyResultToClipboard } from '$lib/clipboard';
	import { createFlash } from '$lib/flash.svelte';
	import { flip } from 'svelte/animate';
	import { quintOut } from 'svelte/easing';
	import { motionOK } from '$lib/motion/prefs.svelte';
	import { reveal, pop } from '$lib/motion/reveal';
	import { pressable } from '$lib/motion/gestures';
	import AnimatedNumber from './AnimatedNumber.svelte';
	import FileVisual from './FileVisual.svelte';
	import Icon from './Icon.svelte';
	import Spinner from './Spinner.svelte';

	interface Props {
		files: UploadedFile[];
		results: CompressedFile[];
		/** Files that failed in the last run — their rows show the error. */
		failures?: FileFailure[];
		format: FileFormat;
		onremove: (id: string) => void;
		oncompare: (id: string) => void;
		ondownload: (id: string) => void;
		/** Show move up/down arrows (PDF merge / images→PDF order matters). */
		reorderable?: boolean;
		onmove?: (id: string, dir: -1 | 1) => void;
		/** Single output built from ALL inputs (merge / images→PDF). */
		combinedResult?: CompressedFile | null;
		ondownloadcombined?: () => void;
		compareEnabled?: boolean;
		/** A compression job is running — rows show status instead of actions. */
		busy?: boolean;
		/** Per-row live status, aligned to `files` (parallel completion). */
		fileProgress?: FileProgress[];
	}

	let {
		files,
		results,
		failures = [],
		format,
		onremove,
		oncompare,
		ondownload,
		reorderable = false,
		onmove,
		combinedResult = null,
		ondownloadcombined,
		compareEnabled = true,
		busy = false,
		fileProgress = []
	}: Props = $props();

	const copied = createFlash<string>(1500);
	const copyFailed = createFlash<string>(1500);

	function handleCopy(result: CompressedFile) {
		copied.clear();
		copyFailed.clear();
		// copyResultToClipboard must run synchronously in the click handler (Safari).
		copyResultToClipboard(result)
			.then(() => copied.trigger(result.id))
			.catch(() => copyFailed.trigger(result.id));
	}

	// Brief "✓" confirmation after any download click (same pattern as the copy flash).
	const downloaded = createFlash<string>(2000);
	const combinedDone = createFlash(2000);

	function handleDownload(id: string) {
		ondownload(id);
		downloaded.trigger(id);
	}

	function handleDownloadCombined() {
		ondownloadcombined?.();
		combinedDone.trigger();
	}

	function getResult(id: string): CompressedFile | undefined {
		return results.find((r) => r.id === id);
	}

	function getFailure(id: string): FileFailure | undefined {
		return failures.find((f) => f.id === id);
	}

	// Results whose id matches no upload (ZIP extraction entries) render as
	// standalone rows after the upload rows.
	let orphanResults = $derived(results.filter((r) => !files.some((f) => f.id === r.id)));

	function savingsText(savings: number): string {
		if (savings >= 30) return 'text-ok-solid';
		if (savings >= 10) return 'text-warn-solid';
		return 'text-muted';
	}
</script>

{#if files.length > 0}
	<!-- Ledger rows + combined output; divide-y draws the row hairlines.
	     The "Download All as ZIP" button lives in the page's action card. -->
	<div class="divide-y divide-line">
		{#each files as file, index (file.id)}
			{@const result = getResult(file.id)}
			{@const failure = getFailure(file.id)}
			<div
				data-testid="file-row"
				class="flex flex-wrap items-center gap-3 px-4 py-4 sm:flex-nowrap sm:px-5"
				animate:flip={{ duration: motionOK() ? 280 : 0, easing: quintOut }}
				{@attach reveal({ y: 6 })}
			>
				<!-- Ledger index -->
				<span class="w-6 shrink-0 font-mono text-[11px] text-faint tabular-nums" aria-hidden="true"
					>{String(index + 1).padStart(2, '0')}</span
				>
				<FileVisual name={file.name} objectUrl={file.objectUrl} />

				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium text-ink">{result?.name ?? file.name}</p>
					<div class="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted tabular-nums">
						<span>{formatBytes(file.size)}</span>
						{#if result}
							<span class="text-faint">→</span>
							<span class="text-ink">{formatBytes(result.compressedSize)}</span>
							{#if result.autoConverted}
								<!-- own testid on purpose: row-warning/info/error are e2e-loaded -->
								<span
									data-testid="row-format"
									title="Auto picked the smallest format"
									class="microlabel text-faint"
								>
									{result.name.split('.').pop()}
								</span>
							{/if}
						{/if}
					</div>
					{#if result?.warning}
						<p data-testid="row-warning" class="mt-0.5 hint text-warn-solid">{result.warning}</p>
					{/if}
					{#if result?.info}
						<p data-testid="row-info" class="mt-0.5 hint text-muted">{result.info}</p>
					{/if}
					{#if failure}
						<p data-testid="row-error" class="mt-1 text-xs text-danger">{failure.error}</p>
					{/if}
				</div>

				<!-- The row's loudest element: the measured saving -->
				{#if result}
					<p
						class="shrink-0 font-mono text-sm font-semibold tabular-nums {savingsText(
							result.savings
						)}"
						{@attach pop()}
					>
						<AnimatedNumber value={result.savings} format={formatSignedPercent} />
					</p>
				{/if}

				{#if busy}
					{@const stage = fileProgress[index]?.stage ?? 'queued'}
					<div class="flex shrink-0 items-center pr-1">
						{#if stage === 'done'}
							<Icon name="check" class="icon-draw size-4 text-ok" label="Done" />
						{:else if stage === 'error'}
							<Icon name="close" class="icon-draw size-4 text-danger" label="Failed" />
						{:else if stage === 'processing'}
							<span class="inline-flex" {@attach pop({ from: 0.6 })}>
								<Spinner class="size-4 text-accent" label="Compressing" />
							</span>
						{:else}
							<span class="microlabel text-faint">queued</span>
						{/if}
					</div>
				{:else}
					<div
						class="flex items-center gap-1 max-sm:ml-auto max-sm:w-full max-sm:justify-end max-sm:gap-1.5"
					>
						{#if reorderable}
							<div class="flex flex-col">
								<button
									onclick={() => onmove?.(file.id, -1)}
									disabled={index === 0}
									class="grid size-6 place-items-center rounded-full text-faint transition-colors hover:bg-card-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent max-sm:size-7"
									aria-label="Move {file.name} up"
								>
									<Icon name="chevron-up" class="size-3.5" />
								</button>
								<button
									onclick={() => onmove?.(file.id, 1)}
									disabled={index === files.length - 1}
									class="grid size-6 place-items-center rounded-full text-faint transition-colors hover:bg-card-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent max-sm:size-7"
									aria-label="Move {file.name} down"
								>
									<Icon name="chevron-down" class="size-3.5" />
								</button>
							</div>
						{/if}
						{#if result}
							<!-- Image rows compare via <img>, so BOTH sides must be browser-
							     renderable — hides Compare for HEIC/TIFF/RAW/JXL/PSD originals
							     and JXL results. Non-image tabs (PDF) gate at the page level. -->
							{#if compareEnabled && (!isImageFormat(format) || (displayableImageMime(file.name) !== null && displayableImageMime(result.name) !== null))}
								<button
									onclick={() => oncompare(file.id)}
									class="rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap text-muted transition-colors hover:bg-card-2 hover:text-ink max-sm:py-2"
									{@attach pressable()}
								>
									Compare
								</button>
							{/if}
							{#if canCopyToClipboard(result)}
								<button
									onclick={() => handleCopy(result)}
									class="rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors max-sm:py-2 {copied.current ===
									result.id
										? 'text-ok'
										: copyFailed.current === result.id
											? 'text-danger'
											: 'text-muted hover:bg-card-2 hover:text-ink'}"
									{@attach pressable()}
								>
									{#if copied.current === result.id}
										<span class="inline-block" {@attach pop({ from: 0.7 })}>Copied ✓</span>
									{:else if copyFailed.current === result.id}
										Failed
									{:else}
										Copy
									{/if}
								</button>
							{/if}
							<button
								onclick={() => handleDownload(file.id)}
								class="grid size-9 shrink-0 place-items-center rounded-full text-ink ring-1 ring-line-strong transition-colors hover:bg-card-2 max-sm:size-11"
								aria-label="Download"
								{@attach pressable()}
							>
								<span
									class="col-start-1 row-start-1 grid place-items-center transition-opacity duration-200 {downloaded.current ===
									file.id
										? 'opacity-0'
										: 'opacity-100'}"
								>
									<Icon name="download" class="size-4" />
								</span>
								<span
									class="ease-pop col-start-1 row-start-1 grid place-items-center transition-all duration-200 {downloaded.current ===
									file.id
										? 'scale-100 opacity-100'
										: 'scale-50 opacity-0'}"
									aria-hidden={downloaded.current !== file.id}
								>
									{#if downloaded.current === file.id}
										<Icon name="check" class="icon-draw size-4 text-ok" />
									{/if}
								</span>
							</button>
						{/if}
						<button
							onclick={() => onremove(file.id)}
							class="grid size-8 place-items-center rounded-full text-faint transition-colors hover:bg-card-2 hover:text-ink max-sm:size-9"
							aria-label="Remove {file.name}"
							{@attach pressable()}
						>
							<Icon name="close" class="icon-rotate size-4" />
						</button>
					</div>
				{/if}
			</div>
		{/each}

		{#each orphanResults as extra, i (extra.id)}
			<div
				data-testid="file-row"
				class="flex flex-wrap items-center gap-3 px-4 py-4 sm:flex-nowrap sm:px-5"
				{@attach reveal({ y: 6 })}
			>
				<span class="w-6 shrink-0 font-mono text-[11px] text-faint tabular-nums" aria-hidden="true"
					>{String(files.length + i + 1).padStart(2, '0')}</span
				>
				<FileVisual name={extra.name} objectUrl={extra.objectUrl} />
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium text-ink">{extra.name}</p>
					<p class="mt-0.5 font-mono text-[11px] text-muted tabular-nums">
						{formatBytes(extra.compressedSize)}
					</p>
					{#if extra.info}
						<!-- Extraction notes ride the first entry row (chain hops, skipped symlinks). -->
						<p data-testid="row-info" class="mt-0.5 hint text-muted">{extra.info}</p>
					{/if}
				</div>
				{#if !busy}
					<button
						onclick={() => handleDownload(extra.id)}
						class="grid size-9 shrink-0 place-items-center rounded-full text-ink ring-1 ring-line-strong transition-colors hover:bg-card-2 max-sm:size-11"
						aria-label="Download"
						{@attach pressable()}
					>
						{#if downloaded.current === extra.id}
							<Icon name="check" class="icon-draw size-4 text-ok" />
						{:else}
							<Icon name="download" class="size-4" />
						{/if}
					</button>
				{/if}
			</div>
		{/each}
	</div>

	{#if combinedResult}
		<div
			data-testid="combined-result"
			class="flex flex-wrap items-center gap-3 bg-info-tint px-4 py-4 sm:flex-nowrap sm:px-5"
			{@attach reveal({ y: 6 })}
		>
			<div class="grid size-10 shrink-0 place-items-center rounded-lg bg-card/60">
				<Icon name="document-arrow-down" class="size-5 text-info" />
			</div>
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium text-ink">{combinedResult.name}</p>
				<div class="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted tabular-nums">
					<span>{formatBytes(combinedResult.originalSize)}</span>
					<span class="text-faint">→</span>
					<span class="text-ink">{formatBytes(combinedResult.compressedSize)}</span>
					{#if combinedResult.savings > 0}
						<span class="font-semibold {savingsText(combinedResult.savings)}">
							{formatSignedPercent(combinedResult.savings)}
						</span>
					{/if}
				</div>
				{#if combinedResult.warning}
					<p data-testid="row-warning" class="mt-0.5 hint text-warn-solid">
						{combinedResult.warning}
					</p>
				{/if}
			</div>
			<button
				onclick={handleDownloadCombined}
				class="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-ink px-4 text-xs font-medium whitespace-nowrap text-ink-contrast transition-colors hover:bg-ink/90 max-sm:ml-auto"
				{@attach pressable()}
			>
				<span class="grid">
					<span
						class="col-start-1 row-start-1 transition-opacity duration-200 {combinedDone.current
							? 'opacity-0'
							: 'opacity-100'}">Download</span
					>
					<span
						class="ease-pop col-start-1 row-start-1 grid place-items-center transition-all duration-200 {combinedDone.current
							? 'scale-100 opacity-100'
							: 'scale-50 opacity-0'}"
						aria-hidden={!combinedDone.current}
					>
						{#if combinedDone.current}
							<Icon name="check" class="icon-draw size-3.5" />
						{/if}
					</span>
				</span>
			</button>
		</div>
	{/if}
{/if}
