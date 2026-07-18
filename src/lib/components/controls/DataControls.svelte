<script lang="ts">
	import type { DataSettings } from '$lib/types';
	import SegmentedControl from './SegmentedControl.svelte';

	interface Props {
		settings: DataSettings;
	}

	let { settings = $bindable() }: Props = $props();

	const delimiters = [
		{ id: ',', label: 'Comma' },
		{ id: ';', label: 'Semicolon' },
		{ id: 'tab', label: 'Tab' }
	];
	const jsonStyles = [
		{ id: '2', label: 'Pretty' },
		{ id: '0', label: 'Minified' }
	];
</script>

<div>
	<p class="microlabel text-muted">CSV delimiter</p>
	<div class="mt-2.5">
		<SegmentedControl
			fit
			items={delimiters}
			selected={settings.csvDelimiter}
			onselect={(id) => (settings.csvDelimiter = id as DataSettings['csvDelimiter'])}
		/>
	</div>
	<p class="mt-2 hint text-faint">
		For CSV output (Excel → CSV) — semicolon matches European Excel locales. Input files are
		detected automatically.
	</p>
</div>
<div>
	<p class="microlabel text-muted">JSON output</p>
	<div class="mt-2.5">
		<SegmentedControl
			fit
			items={jsonStyles}
			selected={String(settings.jsonIndent)}
			onselect={(id) => (settings.jsonIndent = Number(id) as DataSettings['jsonIndent'])}
		/>
	</div>
	<p class="mt-2 hint text-faint">
		For YAML → JSON. Drop any of the four formats — the direction follows the file: CSV → Excel,
		Excel → CSV, JSON → YAML, YAML → JSON.
	</p>
</div>
