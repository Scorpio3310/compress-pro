<script lang="ts">
	import type { SubtitleSettings } from '$lib/types';

	interface Props {
		settings: SubtitleSettings;
	}

	// The target itself (To VTT | To SRT) lives in the tab rail, visible
	// before upload; this panel keeps the target-keyed explainer.
	let { settings = $bindable() }: Props = $props();
</script>

<div>
	{#if settings.to === 'vtt'}
		<p class="hint text-faint">
			WebVTT is the caption format the web speaks — HTML5 <code>&lt;track&gt;</code>, YouTube and
			every modern player. Drop SRT or ASS files; the format is detected automatically.
		</p>
	{:else}
		<p class="hint text-faint">
			SRT is the classic format virtually every player and TV accepts. Drop VTT or ASS files; ASS
			styling tags are stripped, the text and timing stay.
		</p>
	{/if}
</div>
