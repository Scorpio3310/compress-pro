<script lang="ts">
	import PageHead from '$lib/components/PageHead.svelte';
	import { resolve } from '$app/paths';
</script>

<PageHead
	title="Privacy — Compress Pro"
	description="Compress Pro’s privacy in plain words: files never leave your device, nothing is stored server-side, no ads, no cookies, no analytics, no third parties."
	image="/og/privacy.jpg"
	path="/privacy"
/>

<div
	class="divide-y divide-line text-sm leading-relaxed text-muted [&>*]:py-9 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0"
>
	<div class="reveal-css" style="--reveal-i: 0">
		<h1 class="text-display text-ink">Privacy.</h1>
		<p class="mt-3.5 max-w-xl">
			Written in plain words, because there is genuinely little to disclose — the tool is designed
			so we never see your files in the first place.
		</p>
	</div>

	<div class="reveal-css spec-row" style="--reveal-i: 1">
		<h2 class="microlabel text-muted">Your files never leave your device</h2>
		<p class="mt-3 max-w-xl">
			Compression and conversion run entirely inside your browser tab, on your own device. There is
			no upload endpoint — the server’s only job is to deliver this page’s static files. Files and
			results live in your browser’s memory and disappear when you close the tab. The same applies
			to metadata: the
			<a
				href={resolve('/remove-exif')}
				class="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
			>
				EXIF remover</a
			> reads and strips it locally too.
		</p>
	</div>

	<div class="reveal-css spec-row" style="--reveal-i: 2">
		<h2 class="microlabel text-muted">What is stored</h2>
		<p class="mt-3 max-w-xl">
			Practically nothing. No accounts and no databases exist. Your browser’s localStorage keeps two
			things on your own device: your theme choice and your last-used tool settings — never file
			contents or file names. The compression engines are cached by the browser so repeat visits
			load fast — which also means the app keeps working offline: the clearest proof that your files
			are not being sent anywhere.
		</p>
	</div>

	<div class="reveal-css spec-row" style="--reveal-i: 3">
		<h2 class="microlabel text-muted">Hosting</h2>
		<p class="mt-3 max-w-xl">
			The site is served by Cloudflare. Like any host, Cloudflare briefly processes standard request
			metadata — such as your IP address — in its infrastructure logs when your browser fetches the
			page. Your files are never part of any request, so they never appear in any log.
		</p>
	</div>

	<div class="reveal-css spec-row" style="--reveal-i: 4">
		<h2 class="microlabel text-muted">No ads, no cookies, no analytics</h2>
		<p class="mt-3 max-w-xl">
			The site shows no ads, sets no cookies, runs no analytics or tracking scripts, and loads
			nothing from third-party domains — fonts and code are served from this site itself. That is
			also why there is no cookie banner: there is nothing to consent to.
		</p>
	</div>

	<div class="reveal-css spec-row" style="--reveal-i: 5">
		<h2 class="microlabel text-muted">Questions</h2>
		<p class="mt-3 max-w-xl">
			The app is open source, so every claim above is verifiable in the code —
			<a
				href="https://github.com/Scorpio3310/compress-pro"
				target="_blank"
				rel="noopener"
				class="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
			>
				read it on GitHub</a
			> or open an issue there.
		</p>
	</div>

	<div class="reveal-css spec-row" style="--reveal-i: 6">
		<h2 class="microlabel text-muted">Who is responsible</h2>
		<p class="mt-3 max-w-xl">
			The data controller for this site is Nik Klemenc, Slovenia (EU). For anything privacy-related,
			<a
				href="https://github.com/Scorpio3310/compress-pro/issues"
				target="_blank"
				rel="noopener"
				class="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
			>
				open a GitHub issue</a
			>, or reach him through the website linked on his
			<a
				href="https://github.com/Scorpio3310"
				target="_blank"
				rel="noopener"
				class="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
			>
				GitHub profile</a
			>.
		</p>
	</div>
</div>
