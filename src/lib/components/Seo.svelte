<script lang="ts">
	import { SITE_URL, SITE_NAME, FORMATS, FEATURED_PATHS, seoFor, type SeoEntry } from '$lib/seo';

	interface Props {
		entry: SeoEntry;
		/** Live document title — may carry a `(NN%)` progress prefix while compressing. */
		title: string;
	}

	let { entry, title }: Props = $props();

	// Canonical is built from the seo entry, never from page.url — during
	// prerendering the origin is a placeholder, not the real domain.
	const canonical = $derived(SITE_URL + entry.path);
	const ogImage = $derived(SITE_URL + (entry.ogImage ?? '/og.jpg'));
	// The page's markdown twin (src/lib/markdown.ts) — '/' has no `.md` suffix
	// to append, so the homepage twin lives at /index.md.
	const markdownTwin = $derived(SITE_URL + (entry.path === '/' ? '/index.md' : entry.path + '.md'));

	const webApplication = $derived({
		'@type': 'WebApplication',
		name: SITE_NAME,
		url: canonical,
		description: entry.description,
		inLanguage: 'en',
		applicationCategory: 'UtilitiesApplication',
		operatingSystem: 'Any',
		browserRequirements: 'Requires JavaScript and WebAssembly',
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
		author: {
			'@type': 'Person',
			name: 'Nik Klemenc',
			url: 'https://klemenc.si',
			sameAs: ['https://github.com/Scorpio3310']
		},
		featureList: [
			...new Set([
				...(entry.feature ? [entry.feature] : []),
				// EXIF removal isn't compression — its own feature line wins.
				...FORMATS.map((f) => f.feature ?? `Compress ${f.label}`),
				'No file uploads — everything runs locally in your browser'
			])
		]
	});

	// Homepage only — WebSite is what surfaces "Compress Pro" as the site name in Google.
	const webSite = {
		'@type': 'WebSite',
		name: SITE_NAME,
		alternateName: 'compress-pro.com',
		url: SITE_URL + '/',
		inLanguage: 'en'
	};

	// Homepage only — mirrors the visible "Popular tools" grid.
	const featuredList = {
		'@type': 'ItemList',
		name: 'Popular tools',
		itemListElement: FEATURED_PATHS.map((path, i) => ({
			'@type': 'ListItem',
			position: i + 1,
			name: seoFor(path.slice(1)).h1.replace(/\.$/, ''),
			url: SITE_URL + path
		}))
	};

	const breadcrumbList = $derived({
		'@type': 'BreadcrumbList',
		itemListElement: [
			{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
			{ '@type': 'ListItem', position: 2, name: entry.h1.replace(/\.$/, ''), item: canonical }
		]
	});

	// Mirrors the visible FAQ section; answers are plain strings, safe as Answer.text.
	const faqPage = $derived({
		'@type': 'FAQPage',
		mainEntity: entry.faq.map((f) => ({
			'@type': 'Question',
			name: f.q,
			acceptedAnswer: { '@type': 'Answer', text: f.a }
		}))
	});

	const schema = $derived({
		'@context': 'https://schema.org',
		'@graph': [
			webApplication,
			...(entry.path === '/' ? [webSite, featuredList] : [breadcrumbList]),
			...(entry.faq.length > 0 ? [faqPage] : [])
		]
	});
	const jsonLd = $derived(JSON.stringify(schema).replace(/</g, '\\u003c'));
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={entry.description} />
	<link rel="canonical" href={canonical} />
	<link rel="alternate" type="text/markdown" href={markdownTwin} />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="en_US" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:url" content={canonical} />
	<meta property="og:title" content={entry.title} />
	<meta property="og:description" content={entry.description} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:type" content="image/jpeg" />
	<meta property="og:image:alt" content={entry.title} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={entry.title} />
	<meta name="twitter:description" content={entry.description} />
	<meta name="twitter:image" content={ogImage} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON.stringify output with `<` escaped -->
	{@html `<script type="application/ld+json">${jsonLd}</scr` + `ipt>`}
</svelte:head>
