<script lang="ts">
	import { engine } from '$lib/motion/engine';
	import { motionOK } from '$lib/motion/prefs.svelte';
	import { SPRING_UI } from '$lib/motion/tokens';
	import Icon from './Icon.svelte';

	interface Props {
		beforeSrc: string;
		afterSrc: string;
		beforeLabel: string;
		afterLabel: string;
		fill?: boolean;
		/** Intrinsic dimensions — set on both imgs so the aspect ratio is
		 *  reserved before load (zero CLS for below-fold static usage). */
		width?: number;
		height?: number;
		lazy?: boolean;
		beforeAlt?: string;
		afterAlt?: string;
	}

	let {
		beforeSrc,
		afterSrc,
		beforeLabel,
		afterLabel,
		fill = false,
		width,
		height,
		lazy = false,
		beforeAlt = 'Original',
		afterAlt = 'Compressed'
	}: Props = $props();

	let position = $state(50);
	let isDragging = $state(false);
	let containerEl: HTMLDivElement | undefined = $state();
	let handleEl: HTMLDivElement | undefined = $state();

	// One-shot "you can drag this" hint once the slider is actually SEEN —
	// nudges the whole divider (line + handle) so the handle stays on its line.
	// IntersectionObserver instead of a bare mount timer: in the modal the
	// slider is visible at mount (fires immediately, timing unchanged), but on
	// a below-fold page section the hint would otherwise play unseen.
	let dividerEl: HTMLDivElement | undefined = $state();
	let hintAnim: { stop: () => void } | undefined;
	$effect(() => {
		if (!dividerEl || !containerEl || !motionOK()) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const io = new IntersectionObserver(
			(entries) => {
				if (!entries.some((e) => e.isIntersecting)) return;
				io.disconnect();
				timer = setTimeout(() => {
					// One-shot: engine still cold (slow first visit) → skip the nudge.
					const m = engine();
					if (!m) return;
					hintAnim = m.animate(
						dividerEl!,
						{ x: [0, 7, -5, 0] },
						{ duration: 0.9, ease: 'easeInOut' }
					);
				}, 600);
			},
			{ threshold: 0.5 }
		);
		io.observe(containerEl);
		return () => {
			io.disconnect();
			clearTimeout(timer);
			hintAnim?.stop();
		};
	});

	function updatePosition(clientX: number) {
		if (!containerEl) return;
		const rect = containerEl.getBoundingClientRect();
		const x = clientX - rect.left;
		position = Math.max(0, Math.min(100, (x / rect.width) * 100));
	}

	function handlePointerDown(e: PointerEvent) {
		isDragging = true;
		hintAnim?.stop();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		updatePosition(e.clientX);
		const m = engine();
		if (handleEl && m && motionOK()) m.animate(handleEl, { scale: 1.15 }, SPRING_UI);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging) return;
		updatePosition(e.clientX);
	}

	function handlePointerUp() {
		isDragging = false;
		const m = engine();
		if (handleEl && m && motionOK()) m.animate(handleEl, { scale: 1 }, SPRING_UI);
	}
</script>

<div
	bind:this={containerEl}
	class="relative cursor-ew-resize touch-none select-none overflow-hidden bg-card-2 {fill
		? 'h-full w-full'
		: 'rounded-xl'}"
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	role="slider"
	aria-valuenow={Math.round(position)}
	aria-valuemin={0}
	aria-valuemax={100}
	aria-label="Image comparison slider"
	tabindex="0"
	onkeydown={(e) => {
		if (e.key === 'ArrowLeft') position = Math.max(0, position - 2);
		if (e.key === 'ArrowRight') position = Math.min(100, position + 2);
	}}
>
	<!-- After (compressed) - full background -->
	<img
		src={afterSrc}
		alt={afterAlt}
		{width}
		{height}
		loading={lazy ? 'lazy' : undefined}
		decoding={lazy ? 'async' : undefined}
		class={fill ? 'h-full w-full object-contain' : 'block w-full'}
		draggable="false"
	/>

	<!-- Before (original) - clipped with clip-path -->
	<img
		src={beforeSrc}
		alt={beforeAlt}
		{width}
		{height}
		loading={lazy ? 'lazy' : undefined}
		decoding={lazy ? 'async' : undefined}
		class="absolute inset-0 {fill ? 'h-full w-full object-contain' : 'block w-full'}"
		style="clip-path: inset(0 {100 - position}% 0 0);"
		draggable="false"
	/>

	<!-- Divider line -->
	<div
		bind:this={dividerEl}
		class="absolute top-0 bottom-0 z-10 w-0.5 bg-white shadow-lg"
		style="left: {position}%"
	>
		<!-- centered via margins, not transform — motion animates the handle's scale -->
		<div
			bind:this={handleEl}
			class="absolute top-1/2 left-1/2 -mt-4.5 -ml-4.5 grid size-9 place-items-center rounded-full bg-white shadow-lg ring-1 ring-black/10"
		>
			<Icon name="slider-handle" class="size-4 text-gray-700" />
		</div>
	</div>

	<!-- Labels (hidden on phones: they collide over narrow images and the sizes are in the stats anyway) -->
	<div
		class="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white tabular-nums max-sm:hidden"
	>
		{beforeLabel}
	</div>
	<div
		class="pointer-events-none absolute right-3 bottom-3 z-10 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white tabular-nums max-sm:hidden"
	>
		{afterLabel}
	</div>
</div>
