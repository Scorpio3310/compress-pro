<script lang="ts">
	import type { FileFormat, UploadedFile } from '$lib/types';
	import { TAB_ACCEPT } from '$lib/routing';
	import { toUploadedFiles } from '$lib/utils';
	import { fade } from 'svelte/transition';
	import { springScale } from '$lib/motion/progress.svelte';
	import { pulse } from '$lib/motion/reveal';
	import { pointerCoarse } from '$lib/motion/prefs.svelte';
	import { pasteKey } from '$lib/paste-key.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		format: FileFormat;
		onfiles: (files: UploadedFile[]) => void;
		/** Overrides for special modes (e.g. images→PDF, converter pages). */
		accept?: string;
		/** Dropzone noun, e.g. "AVIF files" — defaults to the tab's format. */
		subject?: string;
		/** Slim single-row variant once files are present. */
		compact?: boolean;
		/** Frozen while a compression job runs. */
		disabled?: boolean;
		/** Park gate for DROPPED files; without both routing props every drop parks here. */
		shouldPark?: (file: File) => boolean;
		/** Receives dropped files that fail shouldPark (cross-family drops re-route). */
		onforeign?: (files: File[], parkedAny: boolean) => void;
		/** Route PICKED files through the same park/foreign partition as drops —
		 *  the home dropzone accepts every type, so its picker can't pre-filter. */
		routePicks?: boolean;
		/** Home meta line: says any type works instead of the drop-anywhere tip. */
		universalNote?: boolean;
	}

	let {
		format,
		onfiles,
		accept,
		subject: subjectProp,
		compact = false,
		disabled = false,
		shouldPark,
		onforeign,
		routePicks = false,
		universalNote = false
	}: Props = $props();

	let isDragging = $state(false);
	let inputEl: HTMLInputElement | undefined = $state();
	let rootEl: HTMLDivElement | undefined = $state();

	// WEBP/VIDEO/AUDIO/FONT are not acronyms — the subject sits mid-sentence ("Drop … here").
	const SUBJECT_LABEL: Partial<Record<FileFormat, string>> = {
		webp: 'WebP',
		video: 'video',
		audio: 'audio',
		font: 'font'
	};

	// The accept override means "this dropzone takes images", not the tab's format.
	let subject = $derived(
		subjectProp ?? (accept ? 'images' : `${SUBJECT_LABEL[format] ?? format.toUpperCase()} files`)
	);

	/** Park what belongs on this tab, hand the rest to the router. */
	function partitionFiles(files: File[]) {
		if (!shouldPark || !onforeign) {
			onfiles(toUploadedFiles(files));
			return;
		}
		const park = files.filter((f) => shouldPark(f));
		const foreign = files.filter((f) => !shouldPark(f));
		if (park.length) onfiles(toUploadedFiles(park));
		if (foreign.length) onforeign(foreign, park.length > 0);
	}

	function processFiles(fileList: FileList | null) {
		if (!fileList || fileList.length === 0) return;
		// The picker normally pre-filters via `accept`; the universal home intake
		// accepts everything, so picks partition/route exactly like drops there.
		if (routePicks) partitionFiles([...fileList]);
		else onfiles(toUploadedFiles([...fileList]));
		if (inputEl) inputEl.value = '';
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		pulse(rootEl);
		const files = [...(e.dataTransfer?.files ?? [])];
		if (!files.length) return;
		// The file picker filters by `accept` on its own; drops don't — partition
		// them so a cross-family file (video on an image tab) re-routes instead
		// of parking somewhere it can only fail at compress time.
		partitionFiles(files);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}
</script>

<div
	bind:this={rootEl}
	data-testid="dropzone"
	role="button"
	tabindex="0"
	inert={disabled}
	class="group relative cursor-pointer overflow-hidden text-center [transition:height_0.5s_var(--ease-swift),background-color_0.15s_ease,opacity_0.3s_ease] motion-reduce:transition-none {compact
		? 'h-24'
		: 'h-52 sm:h-72'} {disabled ? 'opacity-60' : ''} {isDragging ? 'dragging' : ''}"
	ondrop={handleDrop}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	onclick={() => inputEl?.click()}
	onkeydown={(e) => {
		// Space must activate like a native button (and not scroll the page).
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			inputEl?.click();
		}
	}}
	{@attach springScale(() => isDragging)}
>
	<input
		bind:this={inputEl}
		type="file"
		multiple
		accept={accept ?? TAB_ACCEPT[format]}
		class="hidden"
		onchange={(e) => processFiles(e.currentTarget.files)}
	/>

	{#key compact}
		<div
			class="absolute inset-0"
			in:fade={{ duration: 150, delay: 120 }}
			out:fade={{ duration: 100 }}
		>
			<!-- Dashed drop frame (both states) — opens slightly on hover, wider +
			     accent while a file is dragged over; the hover/drag tint fills the
			     inside of the frame (`.dz-frame` rules in layout.css). -->
			<div class="pointer-events-none absolute inset-3" aria-hidden="true">
				<span class="dz-frame absolute rounded-2xl border-2 border-dashed"></span>
			</div>
			{#if compact}
				<div class="relative grid h-full place-items-center">
					<div class="flex items-center gap-3 px-4">
						<div
							class="ease-pop grid size-9 shrink-0 place-items-center rounded-full bg-card-2 text-muted transition-all duration-300 group-hover:-translate-y-0.5 group-hover:text-ink"
						>
							<Icon name="upload" class="icon-upload size-4.5" />
						</div>
						<p class="text-sm text-muted">
							{#if pointerCoarse()}
								Add more {subject} —
								<span
									class="font-medium text-ink underline decoration-line underline-offset-4 group-hover:decoration-ink"
									>tap to browse</span
								>
							{:else}
								Drop more {subject} here or
								<span
									class="font-medium text-ink underline decoration-line underline-offset-4 group-hover:decoration-ink"
									>browse</span
								>
							{/if}
						</p>
					</div>
				</div>
			{:else}
				<!-- Column layout: the action centers in the free space, the meta strip
				     sits at the bottom IN FLOW — however many lines it wraps to, it can
				     never climb into the centered block (the old absolute strip did).
				     `relative` lifts the content above the dz-frame's hover/drag fill
				     (the frame is positioned, so it would otherwise paint over text). -->
				<div class="relative flex h-full flex-col">
					<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 max-sm:gap-3">
						<div
							class="ease-pop grid size-12 place-items-center rounded-full bg-card-2 text-muted transition-all duration-300 group-hover:-translate-y-0.5 group-hover:text-ink"
						>
							<Icon name="upload" class="icon-upload icon-hop size-6" />
						</div>
						<div class="space-y-1.5">
							{#if pointerCoarse()}
								<p class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
									Add {subject}
								</p>
								<p class="text-sm text-muted">
									tap anywhere to <span
										class="font-medium text-ink underline decoration-line underline-offset-4"
										>browse</span
									>
								</p>
							{:else}
								<p class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
									Drop {subject} here
								</p>
								<p class="text-sm text-muted">
									or <span
										class="font-medium text-ink underline decoration-line underline-offset-4 group-hover:decoration-ink"
										>browse</span
									> your files
								</p>
							{/if}
						</div>
					</div>
					{#if !pointerCoarse()}
						<p class="hidden px-6 pb-4 text-[11px] text-faint sm:block sm:pb-5">
							{#if universalNote}
								Paste with {pasteKey()} · any file type — the right tool opens automatically
							{:else}
								Paste with {pasteKey()} · or drop files anywhere on the page
							{/if}
						</p>
					{/if}
				</div>
			{/if}
		</div>
	{/key}
</div>
