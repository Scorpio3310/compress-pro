<script lang="ts">
	import PageHead from '$lib/components/PageHead.svelte';
	import { pasteKey } from '$lib/paste-key.svelte';
	import { resolve } from '$app/paths';
</script>

<PageHead
	title="About — Compress Pro"
	description="What Compress Pro is, how the in-browser compression works, and who builds it. Free, open source, and files never leave your device."
	path="/about"
	type="AboutPage"
	image="/og/about.jpg"
	person={{ name: 'Nik Klemenc', url: 'https://klemenc.si' }}
/>

<div
	class="divide-y divide-line text-sm leading-relaxed text-muted [&>*]:py-9 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0"
>
	<div class="reveal-css" style="--reveal-i: 0">
		<h1 class="text-display text-ink">About Compress Pro.</h1>
		<p class="mt-3.5 max-w-xl">
			Compress Pro is a free, open-source tool for compressing, converting, zipping and cleaning
			metadata from images, video, audio and PDFs — built on one uncompromising idea: your files
			never leave your device.
		</p>
	</div>

	<div class="reveal-css spec-row" style="--reveal-i: 1">
		<h2 class="microlabel text-muted">How it works</h2>
		<p class="mt-3 max-w-xl">
			Everything happens in your browser. Files are processed right on your device by proven
			open-source compression engines — the same technology behind professional image, video and PDF
			tools, running locally instead of on someone’s server. The server only delivers this page;
			there is no upload endpoint at all, so there is nothing to trust — you can verify it in the
			network tab, or more simply: run one file through, switch your connection off, and run
			another. It still works, because nothing ever left. Curious about the exact tech? It’s all in
			the open on GitHub below.
		</p>
	</div>

	<div class="reveal-css spec-row" style="--reveal-i: 2">
		<h2 class="microlabel text-muted">Tips</h2>
		<p class="mt-3 max-w-xl">
			{pasteKey()} pastes screenshots straight in · drop files anywhere on the page · Copy puts a result
			back on your clipboard · target-size modes find the best quality under a size limit.
		</p>
	</div>

	<div class="reveal-css spec-row" style="--reveal-i: 3">
		<h2 class="microlabel text-muted">Open source</h2>
		<p class="mt-3 max-w-xl">
			The entire app is open source. Read the code, open an issue, or run your own copy —
			<a
				href="https://github.com/Scorpio3310/compress-pro"
				target="_blank"
				rel="noopener"
				class="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
			>
				github.com/Scorpio3310/compress-pro</a
			>.
		</p>
		<p class="mt-3 max-w-xl">
			Every deployment is built automatically from that repository — no hand-rolled uploads. The
			version and commit hash in the footer tell you exactly which state of the code you’re running;
			click the hash to see that very commit on GitHub.
		</p>
	</div>

	<div class="reveal-css spec-row" style="--reveal-i: 4">
		<h2 class="microlabel text-muted">Who builds it</h2>
		<p class="mt-3 max-w-xl">
			Compress Pro is built and maintained by Nik Klemenc, a developer from Slovenia (EU) —
			originally as a personal tool, opened up because private, no-upload compression deserved to
			exist for everyone. Questions and ideas are welcome on GitHub issues.
		</p>
	</div>

	<div class="reveal-css spec-row" style="--reveal-i: 5">
		<h2 class="microlabel text-muted">Privacy</h2>
		<p class="mt-3 max-w-xl">
			The short version: no uploads, no ads, no accounts, no cookies, no analytics. The details live
			on the
			<a
				href={resolve('/privacy')}
				class="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
			>
				privacy page</a
			>.
		</p>
	</div>
</div>
