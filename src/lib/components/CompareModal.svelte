<script lang="ts">
	import type { FileFormat, UploadedFile, CompressedFile } from '$lib/types';
	import { formatBytes } from '$lib/utils';
	import { openPdfPreview, type PdfPreviewHandle } from '$lib/pdf-preview';
	import ImageSlider from './ImageSlider.svelte';
	import Icon from './Icon.svelte';
	import Spinner from './Spinner.svelte';
	import { fade } from 'svelte/transition';
	import { fadeScale } from '$lib/motion/transitions';
	import { reveal, pop } from '$lib/motion/reveal';
	import { pressable } from '$lib/motion/gestures';
	import { trapFocus } from '$lib/focus-trap';

	interface Props {
		original: UploadedFile | null;
		compressed: CompressedFile | null;
		format: FileFormat;
		onclose: () => void;
	}

	let { original, compressed, format, onclose }: Props = $props();

	let isImage = $derived(format !== 'pdf');
	let fullscreen = $state(false);

	// PDFs: pages are rasterized on demand; both docs stay open while the modal is.
	let page = $state(1);
	let pageCount = $state(1);
	let rendering = $state(false);
	let pageUrls = $state<{ before: string; after: string } | null>(null);
	let renderError = $state<string | null>(null);

	let handles: { before: PdfPreviewHandle; after: PdfPreviewHandle } | null = null;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- render cache, not reactive state
	const cache = new Map<number, { before: string; after: string }>();
	let session = 0;

	$effect(() => {
		if (!(original && compressed && format === 'pdf')) return;
		const id = ++session;
		renderError = null;
		page = 1;
		pageCount = 1;
		pageUrls = null;

		Promise.all([openPdfPreview(original.file), openPdfPreview(compressed.blob)])
			.then(async ([before, after]) => {
				if (id !== session) {
					await Promise.all([before.destroy(), after.destroy()]);
					return;
				}
				handles = { before, after };
				pageCount = Math.min(before.numPages, after.numPages);
				await showPage(1, id);
			})
			.catch((error) => {
				if (id === session) {
					renderError = error instanceof Error ? error.message : 'Preview failed';
				}
			});

		return () => {
			session++;
			const h = handles;
			handles = null;
			h?.before.destroy();
			h?.after.destroy();
			for (const urls of cache.values()) {
				URL.revokeObjectURL(urls.before);
				URL.revokeObjectURL(urls.after);
			}
			cache.clear();
			pageUrls = null;
		};
	});

	async function showPage(n: number, id = session) {
		if (!handles) return;
		const target = Math.max(1, Math.min(pageCount, n));
		const cached = cache.get(target);
		if (cached) {
			page = target;
			pageUrls = cached;
			return;
		}
		rendering = true;
		try {
			// allSettled, not all: renderPage returns a fresh object URL that the
			// caller owns — a half-failed pair must still revoke the half that
			// rendered, or it leaks a full page PNG per failed flip.
			const settled = await Promise.allSettled([
				handles.before.renderPage(target),
				handles.after.renderPage(target)
			]);
			const before = settled[0].status === 'fulfilled' ? settled[0].value : null;
			const after = settled[1].status === 'fulfilled' ? settled[1].value : null;
			if (id !== session || !before || !after) {
				if (before) URL.revokeObjectURL(before);
				if (after) URL.revokeObjectURL(after);
				if (id === session) {
					const reason = settled.find((s) => s.status === 'rejected')?.reason;
					renderError = reason instanceof Error ? reason.message : 'Preview failed';
				}
				return;
			}
			cache.set(target, { before, after });
			page = target;
			pageUrls = { before, after };
		} catch (error) {
			// allSettled absorbs rejections, so this only sees a SYNCHRONOUS
			// throw from renderPage — still surface it instead of leaving an
			// unhandled rejection and a spinner that ends with no message.
			if (id === session) {
				renderError = error instanceof Error ? error.message : 'Preview failed';
			}
		} finally {
			if (id === session) rendering = false;
		}
	}

	let beforeSrc = $derived(isImage ? (original?.objectUrl ?? null) : (pageUrls?.before ?? null));
	let afterSrc = $derived(isImage ? (compressed?.objectUrl ?? null) : (pageUrls?.after ?? null));
	let showPager = $derived(format === 'pdf' && pageCount > 1);

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (fullscreen) {
				fullscreen = false;
			} else {
				onclose();
			}
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet pager(overlay: boolean)}
	{@const btn = overlay
		? 'grid size-7 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent'
		: 'grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-card-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent'}
	<button
		onclick={() => showPage(page - 1)}
		disabled={page <= 1 || rendering}
		class={btn}
		aria-label="Previous page"
		{@attach pressable()}
	>
		<Icon name="chevron-left" class="icon-nudge-left size-4" />
	</button>
	<span
		class={overlay
			? 'px-1.5 text-xs font-medium whitespace-nowrap tabular-nums'
			: 'min-w-20 text-center text-xs font-medium whitespace-nowrap text-muted tabular-nums'}
	>
		{#if rendering}
			<Spinner class="mr-1 inline size-3" />
		{/if}
		{overlay ? `${page}/${pageCount}` : `Page ${page}/${pageCount}`}
	</span>
	<button
		onclick={() => showPage(page + 1)}
		disabled={page >= pageCount || rendering}
		class={btn}
		aria-label="Next page"
		{@attach pressable()}
	>
		<Icon name="chevron-right" class="icon-nudge-right size-4" />
	</button>
{/snippet}

{#snippet stat(label: string, value: string, emphasize: boolean, overlay: boolean)}
	{#if overlay}
		<div
			class="pointer-events-auto rounded-full bg-black/60 px-4 py-2 text-center text-white backdrop-blur-sm"
		>
			<p class="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
			<p class="text-sm font-semibold tabular-nums {emphasize ? 'text-green-400' : ''}">{value}</p>
		</div>
	{:else}
		<div
			class="rounded-xl bg-card-2 p-4 max-sm:flex max-sm:items-center max-sm:justify-between max-sm:p-3"
			{@attach reveal({ y: 8 })}
		>
			<p class="text-[11px] font-medium tracking-label text-muted uppercase">{label}</p>
			<p
				class="mt-1 text-xl font-semibold tracking-tight tabular-nums max-sm:mt-0 max-sm:text-base {emphasize
					? 'text-ok'
					: 'text-ink'}"
			>
				{value}
			</p>
		</div>
	{/if}
{/snippet}

{#if original && compressed}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		transition:fade={{ duration: 200 }}
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm {fullscreen
			? 'p-0'
			: 'p-4'}"
		onclick={handleBackdropClick}
		role="dialog"
		aria-modal="true"
		aria-label="File comparison"
		tabindex="-1"
		{@attach trapFocus()}
	>
		<div
			class="flex flex-col {fullscreen
				? 'h-full w-full bg-black'
				: 'max-h-[calc(100dvh-2rem)] w-full max-w-3xl rounded-card bg-modal shadow-pop ring-1 ring-line'}"
			{@attach pop({ from: 0.96 })}
			out:fadeScale={{ duration: 150 }}
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between {fullscreen
					? 'absolute top-0 right-0 left-0 z-30 bg-gradient-to-b from-black/50 to-transparent px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-white'
					: 'px-6 pt-5 pb-2'}"
			>
				<h2 class="truncate text-sm font-semibold {fullscreen ? '' : 'text-ink'}">
					{original.name}
				</h2>
				<div class="flex items-center gap-1">
					<button
						onclick={() => (fullscreen = !fullscreen)}
						class="grid size-9 place-items-center rounded-full transition-colors {fullscreen
							? 'text-white/80 hover:bg-white/20 hover:text-white'
							: 'text-muted hover:bg-card-2 hover:text-ink'}"
						aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
						{@attach pressable()}
					>
						{#if fullscreen}
							<Icon name="minimize" class="icon-shrink size-5" />
						{:else}
							<Icon name="maximize" class="icon-grow size-5" />
						{/if}
					</button>
					<button
						onclick={onclose}
						class="grid size-9 place-items-center rounded-full transition-colors {fullscreen
							? 'text-white/80 hover:bg-white/20 hover:text-white'
							: 'text-muted hover:bg-card-2 hover:text-ink'}"
						aria-label="Close"
						{@attach pressable()}
					>
						<Icon name="close" class="icon-rotate size-5" />
					</button>
				</div>
			</div>

			<!-- Content -->
			{#if fullscreen}
				<div class="relative flex-1 overflow-hidden">
					{#if beforeSrc && afterSrc}
						<ImageSlider
							{beforeSrc}
							{afterSrc}
							beforeLabel="Original — {formatBytes(original.size)}"
							afterLabel="Compressed — {formatBytes(compressed.compressedSize)}"
							fill
						/>
					{:else}
						<div class="flex h-full items-center justify-center text-sm text-white/70">
							{renderError ?? 'Rendering preview…'}
						</div>
					{/if}
					<!-- Pager + stats overlay -->
					<div
						class="pointer-events-none absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-20 flex flex-wrap items-center justify-center gap-3"
					>
						{#if showPager}
							<div
								class="pointer-events-auto flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-1 text-white backdrop-blur-sm"
							>
								{@render pager(true)}
							</div>
						{/if}
						{@render stat('Original', formatBytes(original.size), false, true)}
						{@render stat('Compressed', formatBytes(compressed.compressedSize), false, true)}
						{@render stat('Saved', `${compressed.savings}%`, true, true)}
					</div>
				</div>
			{:else}
				<div class="flex-1 overflow-auto p-6 pt-3">
					{#if beforeSrc && afterSrc}
						<ImageSlider
							{beforeSrc}
							{afterSrc}
							beforeLabel="Original — {formatBytes(original.size)}"
							afterLabel="Compressed — {formatBytes(compressed.compressedSize)}"
						/>
					{:else}
						<div class="flex h-48 items-center justify-center text-sm text-muted">
							{#if renderError}
								{renderError}
							{:else}
								<Spinner class="mr-2 size-4" />
								Rendering preview…
							{/if}
						</div>
					{/if}

					{#if showPager}
						<div class="mt-4 flex items-center justify-center gap-1">
							{@render pager(false)}
						</div>
					{/if}

					<!-- Stats -->
					<div
						class="mt-5 grid grid-cols-3 gap-3 text-center max-sm:grid-cols-1 max-sm:gap-2 max-sm:text-left"
					>
						{@render stat('Original', formatBytes(original.size), false, false)}
						{@render stat('Compressed', formatBytes(compressed.compressedSize), false, false)}
						{@render stat('Saved', `${compressed.savings}%`, true, false)}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
