<script lang="ts">
	import { engine } from '$lib/motion/engine';
	import { motionOK } from '$lib/motion/prefs.svelte';
	import { SPRING_GENTLE } from '$lib/motion/tokens';

	interface Props {
		value: number;
		format?: (n: number) => string;
		initial?: number;
		/** motion transition options; defaults to a gentle spring */
		transition?: Record<string, unknown>;
		class?: string;
	}

	let {
		value,
		format = (n) => `${Math.round(n)}`,
		initial = 0,
		transition,
		class: klass = ''
	}: Props = $props();

	let el: HTMLSpanElement | undefined = $state();
	// The initial value is exactly what we want to start counting from.
	// svelte-ignore state_referenced_locally
	let current = initial;
	let controls: { stop: () => void } | undefined;

	$effect(() => {
		const target = value; // sole reactive dep (plus motionOK)
		const node = el;
		if (!node) return;
		// Skip no-op retargets (e.g. sub-1% progress ticks) — this is the throttle.
		// Engine still cold (first ~200 ms) → settle instantly, same as reduced
		// motion; the next value change tweens.
		const m = engine();
		if (!m || !motionOK() || format(target) === format(current)) {
			controls?.stop();
			current = target;
			node.textContent = format(target);
			return;
		}
		controls?.stop();
		controls = m.animate(current, target, {
			...(transition ?? SPRING_GENTLE),
			onUpdate: (v: number) => {
				current = v;
				node.textContent = format(v); // bypasses Svelte reactivity — no invalidation storm
			}
		});
		return () => controls?.stop();
	});
</script>

<span bind:this={el} class="tabular-nums {klass}">{format(initial)}</span>
