<script lang="ts">
	import './layout.css';
	import '@fontsource-variable/plus-jakarta-sans';
	import '@fontsource-variable/geist-mono';
	import fontUrl from '@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2?url';
	import monoUrl from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url';
	import Icon from '$lib/components/Icon.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { pressable } from '$lib/motion/gestures';
	import { logoSqueeze } from '$lib/motion/logo';
	import { TOOL_GROUPS, TOOL_SLUGS, seoFor } from '$lib/seo';
	import { detectPasteKey } from '$lib/paste-key.svelte';
	import { registerWebMcpTools } from '$lib/webmcp';
	import { resolve } from '$app/paths';

	let { children } = $props();

	$effect(() => {
		detectPasteKey();
		// Once per page load — the layout survives client-side navigations.
		registerWebMcpTools();
	});

	// Footer directory — the homepage buckets' curated picks (hub page first);
	// the full 93 live behind the "All tools" link. seo.test.ts asserts every
	// path resolves and the buckets stay a partition.
	const footerColumns = TOOL_GROUPS.map((group) => ({
		title: group.footerTitle ?? group.title,
		links: group.footerPaths.map((path) => seoFor(path.slice(1)))
	}));

	// Baked by Vite's `define` — SSR and client render the same stamp.
	const buildYear = __BUILD_DATE__.slice(0, 4);
	// 'dev' and '-dirty' builds have no commit page to link to.
	const commitLinkable = __COMMIT__ !== 'dev' && !__COMMIT__.endsWith('-dirty');
</script>

<svelte:head>
	<link rel="preload" as="font" type="font/woff2" href={fontUrl} crossorigin="anonymous" />
	<link rel="preload" as="font" type="font/woff2" href={monoUrl} crossorigin="anonymous" />
</svelte:head>

<div class="canvas-grain canvas-haze relative min-h-dvh bg-canvas text-ink antialiased">
	<a
		href="#main"
		class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-contrast"
	>
		Skip to the tool
	</a>
	<header class="relative py-5">
		<div class="mx-auto max-w-3xl px-4 sm:px-6">
			<div class="reveal-css flex items-center justify-between" style="--reveal-i: 0">
				<a
					href={resolve('/')}
					class="flex items-center gap-3"
					{@attach logoSqueeze()}
					{@attach pressable()}
				>
					<span class="grid size-8 place-items-center rounded-[10px] bg-ink text-ink-contrast">
						<svg
							class="size-4.5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="butt"
							stroke-linejoin="miter"
							aria-hidden="true"
						>
							<path d="M8 3l4 4 4-4" />
							<path d="M4 12h16" />
							<path d="M8 21l4-4 4 4" />
						</svg>
					</span>
					<span class="text-[17px] font-semibold tracking-tight">Compress Pro</span>
				</a>
				<div class="flex items-center gap-1.5">
					<a
						href="https://github.com/Scorpio3310/compress-pro"
						target="_blank"
						rel="noopener"
						class="grid size-10 place-items-center rounded-full text-muted transition-colors hover:bg-card/80 hover:text-ink hover:backdrop-blur-xs dark:hover:bg-card-2/80"
						aria-label="View source on GitHub"
						title="Source code"
						{@attach pressable()}
					>
						<Icon name="github" class="icon-octo size-5" />
					</a>
					<a
						href={resolve('/about')}
						class="grid size-10 place-items-center rounded-full text-muted transition-colors hover:bg-card/80 hover:text-ink hover:backdrop-blur-xs dark:hover:bg-card-2/80"
						aria-label="About Compress Pro"
						title="About"
						{@attach pressable()}
					>
						<Icon name="info" class="icon-info-hop size-5" />
					</a>
					<ThemeToggle />
				</div>
			</div>
		</div>
	</header>
	<main id="main" tabindex="-1" class="relative mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
		{@render children()}
	</main>
	<footer
		class="reveal-css relative mx-auto max-w-3xl px-4 pt-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-6"
		style="--reveal-i: 4"
	>
		<div class="border-t border-line pt-10">
			<div class="flex items-center gap-3">
				<span class="grid size-8 place-items-center rounded-[10px] bg-ink text-ink-contrast">
					<svg
						class="size-4.5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="butt"
						stroke-linejoin="miter"
						aria-hidden="true"
					>
						<path d="M8 3l4 4 4-4" />
						<path d="M4 12h16" />
						<path d="M8 21l4-4 4 4" />
					</svg>
				</span>
				<span class="text-sm font-semibold tracking-tight">Compress Pro</span>
			</div>
			<p class="mt-4 max-w-md text-xs leading-relaxed text-muted">
				Free, private file compression — everything runs in your browser. Files are never uploaded.
				No ads, no accounts, no cookies, no analytics.
			</p>

			<nav
				aria-label="Popular tools"
				class="mt-8 grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-3 md:grid-cols-5"
			>
				{#each footerColumns as column (column.title)}
					<div>
						<p class="microlabel text-muted">{column.title}</p>
						<ul class="mt-3 space-y-2">
							{#each column.links as link (link.path)}
								<li>
									<a
										href={resolve(link.path)}
										class="text-xs text-muted transition-colors hover:text-ink"
									>
										{link.label}
									</a>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</nav>

			<!-- Deep link opens the collapsed homepage directory (ToolDirectory). -->
			<a
				href="{resolve('/')}#all-tools"
				class="group mt-8 inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-ink"
			>
				All {TOOL_SLUGS.length} tools
				<Icon
					name="chevron-right"
					class="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
				/>
			</a>

			<div
				class="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-5 text-xs text-faint"
			>
				<p>© {buildYear} Compress Pro</p>
				<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
					<p class="flex items-center gap-x-1.5">
						<a href={resolve('/about')} class="text-muted transition-colors hover:text-ink">About</a
						>
						<span aria-hidden="true">·</span>
						<a href={resolve('/privacy')} class="text-muted transition-colors hover:text-ink"
							>Privacy</a
						>
						<span aria-hidden="true">·</span>
						<a
							href="https://github.com/Scorpio3310/compress-pro"
							target="_blank"
							rel="noopener"
							class="text-muted transition-colors hover:text-ink">GitHub</a
						>
					</p>
					<!-- build stamp chip — metadata, deliberately set apart from the nav links -->
					{#if commitLinkable}
						<a
							href="https://github.com/Scorpio3310/compress-pro/commit/{__COMMIT__}"
							target="_blank"
							rel="noopener"
							title="Built from this commit"
							class="rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium text-muted tabular-nums ring-1 ring-line transition-colors hover:text-ink"
							>{__BUILD_DATE__} · {__COMMIT__}</a
						>
					{:else}
						<span
							class="rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium text-muted tabular-nums ring-1 ring-line"
							>{__BUILD_DATE__} · {__COMMIT__}</span
						>
					{/if}
				</div>
			</div>
		</div>
	</footer>
</div>
