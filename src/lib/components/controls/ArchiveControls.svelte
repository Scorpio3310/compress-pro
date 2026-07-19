<script lang="ts">
	import type { ArchiveOutputFormat, ZipSettings } from '$lib/types';
	import { BUNDLING_ARCHIVE_FORMATS, isBundlingArchiveFormat } from '$lib/types';
	import { ARCHIVE_FORMAT_LABELS } from '$lib/action-labels';
	import Pill from './Pill.svelte';

	interface Props {
		settings: ZipSettings;
	}

	let { settings = $bindable() }: Props = $props();

	const ALL_FORMATS: ArchiveOutputFormat[] = [
		'zip',
		'7z',
		'tar',
		'tgz',
		'tbz2',
		'txz',
		'gz',
		'bz2',
		'xz'
	];

	const levels: { id: ZipSettings['level']; label: string; hint: string }[] = [
		{ id: 0, label: 'Store', hint: 'No compression — fastest' },
		{ id: 1, label: 'Fast', hint: 'Light compression' },
		{ id: 6, label: 'Balanced', hint: 'The usual default' },
		{ id: 9, label: 'Max', hint: 'Smallest, slowest' }
	];

	const formatHints: Record<ArchiveOutputFormat, string> = {
		zip: 'Opens everywhere — the safe default for sharing.',
		'7z': 'Best compression of the bunch; needs 7-Zip or a modern unarchiver.',
		tar: 'Uncompressed bundle — the unix way to keep files together.',
		tgz: 'tar + gzip — the standard unix/dev distribution format.',
		tbz2: 'tar + bzip2 — smaller than tar.gz, slower to build.',
		txz: 'tar + xz — smallest tarball, slowest to build.',
		gz: 'gzip compresses each file on its own (report.pdf → report.pdf.gz).',
		bz2: 'bzip2 compresses each file on its own — no bundling.',
		xz: 'xz compresses each file on its own — strongest single-file squeeze.'
	};

	// Password applies where the container supports encryption.
	let canEncrypt = $derived(
		settings.op === 'create' && (settings.outputFormat === 'zip' || settings.outputFormat === '7z')
	);
	let showPassword = $state(false);

	let outputChoices = $derived(
		settings.op === 'convert'
			? (BUNDLING_ARCHIVE_FORMATS as readonly ArchiveOutputFormat[])
			: ALL_FORMATS
	);

	function selectFormat(format: ArchiveOutputFormat) {
		settings.outputFormat = format;
		// Create-op passwords belong to zip/7z only; convert keeps its SOURCE
		// password regardless of the target format.
		if (settings.op === 'create' && format !== 'zip' && format !== '7z') settings.password = '';
	}
</script>

{#if settings.op === 'create' || settings.op === 'convert'}
	<div>
		<p class="microlabel text-muted">Output format</p>
		<div class="mt-2.5 flex flex-wrap gap-2">
			{#each outputChoices as format (format)}
				<Pill active={settings.outputFormat === format} onclick={() => selectFormat(format)}>
					{ARCHIVE_FORMAT_LABELS[format]}
				</Pill>
			{/each}
		</div>
		<p class="mt-2 hint text-faint">{formatHints[settings.outputFormat]}</p>
		<!-- What-happens line rides the format section — standalone it floated
		     between sections with a full section padding of its own. -->
		{#if settings.op === 'create'}
			<p class="mt-1.5 hint text-faint">
				{#if isBundlingArchiveFormat(settings.outputFormat)}
					All listed files land in one archive{settings.outputFormat === 'zip'
						? '.zip'
						: `.${ARCHIVE_FORMAT_LABELS[settings.outputFormat].toLowerCase()}`}, names kept.
				{:else}
					Each file becomes its own compressed download — bundling isn't part of this format.
				{/if}
			</p>
		{:else}
			<p class="mt-1.5 hint text-faint">
				Each archive is unpacked and repacked as {ARCHIVE_FORMAT_LABELS[settings.outputFormat]},
				folder structure kept. The output is not encrypted.
			</p>
		{/if}
	</div>

	{#if settings.outputFormat !== 'tar'}
		<div>
			<p class="microlabel text-muted">Compression level</p>
			<div class="mt-2.5 flex flex-wrap gap-2">
				{#each levels as level (level.id)}
					<Pill active={settings.level === level.id} onclick={() => (settings.level = level.id)}>
						{level.label}
					</Pill>
				{/each}
			</div>
			<p class="mt-2 hint text-faint">
				{levels.find((l) => l.id === settings.level)?.hint}. Already-compressed files (photos,
				video) barely shrink at any level.
			</p>
		</div>
	{/if}

{:else}
	<p class="text-xs text-faint">
		Every file inside the archive becomes its own row — download them individually or all at once.
		Works with ZIP, RAR, 7Z, TAR, ISO, CAB and more.
	</p>
{/if}

{#if canEncrypt || settings.op === 'extract' || settings.op === 'convert'}
	<div>
		<label for="archive-password" class="microlabel mb-2.5 block text-muted">
			{settings.op === 'create' ? 'Password (optional)' : 'Password — only for protected archives'}
		</label>
		<div class="relative">
			<input
				id="archive-password"
				type={showPassword ? 'text' : 'password'}
				autocomplete="off"
				placeholder={settings.op === 'create'
					? 'Leave empty for no encryption'
					: 'The password that opens the archive'}
				bind:value={settings.password}
				class="h-11 w-full rounded-field border border-line-strong bg-card px-4 pr-16 text-base text-ink transition-colors placeholder:text-faint focus-visible:border-accent sm:text-sm"
			/>
			<button
				type="button"
				class="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted transition-colors hover:text-ink"
				aria-pressed={showPassword}
				aria-label={showPassword ? 'Hide password' : 'Show password'}
				onclick={() => (showPassword = !showPassword)}
			>
				{showPassword ? 'Hide' : 'Show'}
			</button>
		</div>
		<p class="mt-1.5 hint text-faint">
			The password never leaves your device — everything runs locally.
		</p>
		{#if settings.op === 'create' && settings.password}
			{#if settings.outputFormat === '7z'}
				<label class="mt-2.5 flex items-center gap-2.5 text-sm text-ink">
					<input type="checkbox" bind:checked={settings.encryptNames} class="accent-accent" />
					Also hide file names inside the archive
				</label>
				<!-- pl aligns with the checkbox label text (16px box + 10px gap) -->
				<p class="mt-1.5 pl-6.5 hint text-faint">AES-256; without this, names stay listable.</p>
			{:else}
				<p class="mt-1.5 hint text-faint">
					AES-256 encryption — needs 7-Zip, WinRAR or a modern unarchiver to open (not Windows'
					built-in extractor).
				</p>
			{/if}
		{/if}
	</div>
{/if}
