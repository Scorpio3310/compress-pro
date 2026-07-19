/**
 * Rasterizes static/favicon.svg into the icon set referenced by app.html and
 * site.webmanifest: favicon.ico (16/32/48), apple-touch-icon.png (180,
 * full-bleed), icon-192.png and icon-512.png (rounded tile), plus
 * icon-maskable-192.png and icon-maskable-512.png (full-bleed, glyph shrunk
 * into the maskable safe zone). Run `pnpm icons` after any favicon.svg
 * change — the rasters never update themselves.
 *
 * librsvg (sharp's SVG rasterizer) ignores <style> media queries, so the
 * light-scheme colors are re-applied as inline attributes here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const STATIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'static');

// Pull the glyph group out of favicon.svg so this script can never drift from
// it — attributes (stroke-width, caps) come along, only the class is replaced
// by the light-scheme stroke color.
const source = readFileSync(join(STATIC, 'favicon.svg'), 'utf8');
const g = source.match(/<g([^>]*)>([\s\S]*?)<\/g>/);
if (!g) throw new Error('static/favicon.svg: no <g> glyph group found');
const glyph = `<g${g[1].replace(/\s*class="glyph"/, ' stroke="#ffffff"')}>${g[2]}</g>`;

// rx=8 mirrors favicon.svg's tile; rx=0 is the full-bleed Apple variant
// (iOS applies its own corner mask, baked corners would double-round).
const iconSvg = (rx) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
	`<rect fill="#0b0c0e" width="32" height="32" rx="${rx}"/>${glyph}</svg>`;

// Maskable variant: full-bleed tile (the platform applies its own mask shape)
// with the glyph scaled to 80% so it sits comfortably inside the 40%-radius
// safe zone — at full size its extremes graze the zone's edge.
const maskableSvg =
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
	`<rect fill="#0b0c0e" width="32" height="32"/>` +
	`<g transform="translate(16 16) scale(0.8) translate(-16 -16)">${glyph}</g></svg>`;

const render = (svg, size) =>
	sharp(Buffer.from(svg), { density: (72 * size) / 32 })
		.resize(size, size)
		.png()
		.toBuffer();

/** Minimal ICO container with PNG-compressed entries (valid since Vista). */
function ico(images) {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(1, 2); // type: icon
	header.writeUInt16LE(images.length, 4);
	const entries = [];
	let offset = 6 + 16 * images.length;
	for (const { size, bytes } of images) {
		const entry = Buffer.alloc(16);
		entry.writeUInt8(size === 256 ? 0 : size, 0);
		entry.writeUInt8(size === 256 ? 0 : size, 1);
		entry.writeUInt16LE(1, 4); // color planes
		entry.writeUInt16LE(32, 6); // bits per pixel
		entry.writeUInt32LE(bytes.length, 8);
		entry.writeUInt32LE(offset, 12);
		entries.push(entry);
		offset += bytes.length;
	}
	return Buffer.concat([header, ...entries, ...images.map((i) => i.bytes)]);
}

const write = (name, bytes) => {
	writeFileSync(join(STATIC, name), bytes);
	console.log(`${name}  ${(bytes.length / 1024).toFixed(1)} kB`);
};

write('icon-512.png', await render(iconSvg(8), 512));
write('icon-192.png', await render(iconSvg(8), 192));
write('icon-maskable-512.png', await render(maskableSvg, 512));
write('icon-maskable-192.png', await render(maskableSvg, 192));
write('apple-touch-icon.png', await render(iconSvg(0), 180));

const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(
	icoSizes.map(async (size) => ({ size, bytes: await render(iconSvg(8), size) }))
);
write('favicon.ico', ico(icoImages));
