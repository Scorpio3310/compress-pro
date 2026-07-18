<script lang="ts">
	import type { SubtitleSettings } from '$lib/types';
	import SegmentedControl from './SegmentedControl.svelte';

	interface Props {
		settings: SubtitleSettings;
	}

	let { settings = $bindable() }: Props = $props();

	const targets = [
		{ id: 'vtt', label: 'To VTT' },
		{ id: 'srt', label: 'To SRT' }
	];
</script>

<div class="panel-span">
	<SegmentedControl
		items={targets}
		selected={settings.to}
		onselect={(id) => (settings.to = id as SubtitleSettings['to'])}
	/>
</div>
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
