<script lang="ts">
	import { SITE_URL, SITE_NAME } from '$lib/seo';

	interface Props {
		title: string;
		description: string;
		/** Canonical path, e.g. '/about' — never page.url (prerender origin is a placeholder). */
		path: string;
		/** Schema.org page type. */
		type?: 'WebPage' | 'AboutPage';
		/** Maintainer surfaced as the page's mainEntity (about-page E-E-A-T). */
		person?: { name: string; url: string };
		/** Per-page OG image path under static/ — falls back to the generic card. */
		image?: string;
	}

	let { title, description, path, type = 'WebPage', person, image = '/og.jpg' }: Props = $props();

	const canonical = $derived(SITE_URL + path);
	const ogImage = $derived(SITE_URL + image);

	const schema = $derived({
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': type,
				name: title,
				url: canonical,
				description,
				inLanguage: 'en',
				isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL + '/' },
				...(person && {
					mainEntity: {
						'@type': 'Person',
						name: person.name,
						url: person.url,
						sameAs: ['https://github.com/Scorpio3310']
					}
				})
			},
			{
				'@type': 'BreadcrumbList',
				itemListElement: [
					{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
					// "About — Compress Pro" → breadcrumb reads just "About".
					{ '@type': 'ListItem', position: 2, name: title.split(' — ')[0], item: canonical }
				]
			}
		]
	});
	const jsonLd = $derived(JSON.stringify(schema).replace(/</g, '\\u003c'));
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="en_US" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:url" content={canonical} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:type" content="image/jpeg" />
	<meta property="og:image:alt" content={title} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={ogImage} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON.stringify output with `<` escaped -->
	{@html `<script type="application/ld+json">${jsonLd}</scr` + `ipt>`}
</svelte:head>
