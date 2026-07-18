<script module lang="ts">
	/**
	 * Geometric icon set: round caps/joins (softened at Nik's request — only the
	 * brand glyph in +layout and favicon.svg stay sharp butt/miter), uniform
	 * stroke-width 1.75, strokes locked to 0°/90°/45°. Sole organic exception:
	 * `github` (brand silhouette, Feather outline). Every glyph is path `d`
	 * string(s) — circles
	 * are arc subpaths and the info dot is a sub-stroke-width circle the stroke
	 * floods into a solid disc — so the markup stays plain dynamic attributes
	 * (SSR/client divergence, e.g. the theme icon, self-corrects on hydration;
	 * {@html} would keep the server value and warn). Array values split a glyph
	 * into parts that CSS animates independently (see "Icon micro-interactions"
	 * in layout.css); `pathLength={1}` normalizes dash math for `.icon-draw`.
	 */
	const GLYPHS = {
		'arrow-left': 'M20 12H4M10 6l-6 6 6 6',
		'chevron-left': 'M15 5l-7 7 7 7',
		'chevron-right': 'M9 5l7 7-7 7',
		'chevron-up': 'M5 15l7-7 7 7',
		'chevron-down': 'M5 9l7 7 7-7',
		close: 'M5 5l14 14M19 5 5 19',
		check: 'M4 13l5 5L20 7',
		download: 'M12 3v13M6 10l6 6 6-6M4 21h16',
		upload: ['M12 15V3M7 8l5-5 5 5', 'M4 16v5h16v-5'],
		// text lines split out so the PDF tab activation can draw them in
		document: ['M6.5 3h8l5 5v13h-13zM14.5 3v5h5', 'M9.5 13.5h5', 'M9.5 16.5h5'],
		'document-arrow-down': 'M6 3h9l5 5v13H6zM15 3v5h5M12 11v6M9 14l3 3 3-3',
		maximize: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
		minimize: 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
		// disc/rays split: the header theme toggle sweeps the rays on hover
		sun: [
			'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8',
			'M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M19.07 4.93l-2.12 2.12M7.05 16.95l-2.12 2.12'
		],
		moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
		monitor: 'M3 4h18v12H3zM12 16v4M8 20h8',
		// ring/stem/dot split: the header About link hops the dot on hover
		info: [
			'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18',
			'M12 11v6',
			'M12 7a.5.5 0 1 0 0 1 .5.5 0 1 0 0-1'
		],
		// tail/body split (tail's relative `m14 6` rewritten absolute `M16 22`):
		// the header GitHub link flicks the tail + perks the ears on hover
		github: [
			'M9 19c-5 1.5-5-2.5-7-3',
			'M16 22v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22'
		],
		lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
		'slider-handle': 'M9 8l-4 4 4 4M15 8l4 4-4 4',
		// Primary-tab glyphs — parts split so the tab-activation moves in
		// layout.css can animate them independently.
		image: [
			'M3.5 5h17v14h-17z',
			'M6.5 15.5l3.5-3.5 2.5 2.5 2-2 3 3',
			'M16 8.25a.5.5 0 1 0 0 1 .5.5 0 1 0 0-1'
		],
		video: ['M3.5 7h11v10h-11z', 'M20.5 7.5v9l-6-4.5z'],
		audio: ['M5.5 9v6', 'M10 5.5v13', 'M14.5 8v8', 'M19 10v4'],
		// crossbar/stem/baseline split — the tab activation draws stem + baseline
		font: ['M6 5h12', 'M12 5v14', 'M8.5 19h7'],
		archive: ['M3.5 5h17v4h-17z', 'M5.5 9v10h13V9', 'M10 12.5h4'],
		tag: ['M4 4h8l8 8-8 8-8-8z', 'M8.5 8a.5.5 0 1 0 0 1 .5.5 0 1 0 0-1'],
		// OCR: scan-frame corners around a text line.
		scan: ['M4 8V5.5h3', 'M20 8V5.5h-3', 'M4 16v2.5h3', 'M20 16v2.5h-3', 'M8 12h8'],
		// Subtitles: caption box with two ragged text rows.
		captions: ['M3.5 6h17v12h-17z', 'M7 12.5h4', 'M13.5 12.5h3.5', 'M7 15.5h2.5', 'M12 15.5h5'],
		// Data: spreadsheet grid — frame + one row line + two column lines.
		table: ['M3.5 5h17v14h-17z', 'M3.5 10h17', 'M9.5 10v9', 'M15.5 10v9'],
		// 3D: isometric cube — top face + front edges.
		cube: [
			'M12 3.5l7.5 4.25v8.5L12 20.5l-7.5-4.25v-8.5z',
			'M4.5 7.75L12 12l7.5-4.25',
			'M12 12v8.5'
		],
		// E-books: open book — two page halves meeting at the spine.
		book: [
			'M12 6.5C10.5 5 8 4.5 4.5 4.75V18c3.5-.25 6 .25 7.5 1.75',
			'M12 6.5C13.5 5 16 4.5 19.5 4.75V18c-3.5-.25-6 .25-7.5 1.75',
			'M12 6.5v13.25'
		],
		// Almond built from two mirrored arcs, pupil a circle subpath.
		eye: [
			'M2.5 12A11 11 0 0 1 21.5 12A11 11 0 0 1 2.5 12z',
			'M12 9.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 1 0 0-5.5'
		],
		'eye-off': [
			'M2.5 12A11 11 0 0 1 21.5 12A11 11 0 0 1 2.5 12z',
			'M12 9.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 1 0 0-5.5',
			'M4 4l16 16'
		]
	} as const;

	export type IconName = keyof typeof GLYPHS;
</script>

<script lang="ts">
	interface Props {
		name: IconName;
		/** Size/color utility classes. */
		class?: string;
		/** Accessible name; omitted → the icon is decorative (aria-hidden). */
		label?: string;
	}

	let { name, class: className = 'size-4', label }: Props = $props();

	let paths: readonly string[] = $derived.by(() => {
		const glyph: string | readonly string[] = GLYPHS[name];
		return typeof glyph === 'string' ? [glyph] : glyph;
	});
</script>

<svg
	class={className}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.75"
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : true}
>
	{#each paths as d (d)}
		<path {d} pathLength={1} />
	{/each}
</svg>
