<script lang="ts">
	import type { OcrSettings } from '$lib/types';
	import { OCR_LANGUAGES } from '$lib/types';

	interface Props {
		settings: OcrSettings;
	}

	// The op itself (Extract text | Searchable PDF) lives in the tab rail —
	// it swaps the accepted inputs, so it must be visible before upload.
	let { settings = $bindable() }: Props = $props();
</script>

<div>
	<label for="ocr-language" class="microlabel mb-2.5 block text-muted">Document language</label>
	<select
		id="ocr-language"
		bind:value={settings.language}
		class="h-11 w-full rounded-field border border-line-strong bg-card px-4 text-base text-ink transition-colors focus-visible:border-accent sm:text-sm"
	>
		{#each OCR_LANGUAGES as lang (lang.code)}
			<option value={lang.code}>{lang.label}</option>
		{/each}
	</select>
	<p class="mt-1.5 hint text-faint">
		The language model (1–2 MB) downloads on first use and stays cached for offline runs.
	</p>
</div>
<div>
	{#if settings.op === 'toPdf'}
		<p class="hint text-faint">
			Every page is recognized locally and an invisible text layer is laid over the original — the
			document looks identical, but becomes selectable and searchable.
		</p>
	{:else}
		<p class="hint text-faint">
			Each image becomes a .txt file with the recognized text — everything runs on your device.
		</p>
	{/if}
</div>
