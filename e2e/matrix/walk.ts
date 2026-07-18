/**
 * Runtime enumeration of tests/fixtures/real/ — always recursive, never a
 * hardcoded list (files keep being added; the matrix must adapt). The app's own
 * router (src/lib/routing.ts formatFromName) is the single source of truth for
 * "which tab would accept this file"; anything it rejects is negative-test
 * material (must produce the honest unsupported-format error, never a hang).
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { formatFromName } from '../../src/lib/routing';
import type { FileFormat } from '../../src/lib/types';
import { REAL } from '../fixtures';

const JUNK = /(^|\/)(\.DS_Store|Thumbs\.db|__MACOSX(\/|$))|\.md$|(^|\/)(OFL|README)\.txt$/;

/** Above this, a file runs in the giant tier only (matrix-giant.spec.ts). */
export const GIANT_BYTES = 60_000_000;

export interface RealFile {
	abs: string;
	/** Path relative to tests/fixtures/real — the stable identity in cell ids. */
	rel: string;
	name: string;
	ext: string;
	bytes: number;
	/** The tab the app's router assigns; null = unroutable (negative material). */
	format: FileFormat | null;
	giant: boolean;
}

let cache: RealFile[] | null = null;

/** Every real file, junk-filtered, MATRIX_FILE-filtered, deterministically sorted. */
export function walkReal(): RealFile[] {
	if (cache) return cache;
	const out: RealFile[] = [];
	const filter = process.env.MATRIX_FILE ? new RegExp(process.env.MATRIX_FILE, 'i') : null;
	const visit = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const abs = join(dir, entry.name);
			const rel = relative(REAL, abs);
			if (JUNK.test(rel)) continue;
			if (entry.isDirectory()) {
				visit(abs);
				continue;
			}
			if (!entry.isFile()) continue;
			if (filter && !filter.test(rel)) continue;
			const bytes = statSync(abs).size;
			const dot = entry.name.lastIndexOf('.');
			out.push({
				abs,
				rel,
				name: entry.name,
				ext: dot >= 0 ? entry.name.slice(dot + 1).toLowerCase() : '',
				bytes,
				format: formatFromName(entry.name),
				giant: bytes > GIANT_BYTES
			});
		}
	};
	visit(REAL);
	out.sort((a, b) => a.rel.localeCompare(b.rel));
	cache = out;
	return cache;
}

/** Routable files for one tab format, normal tier by default. */
export function realByFormat(formats: FileFormat[], opts: { giant?: boolean } = {}): RealFile[] {
	const wantGiant = opts.giant ?? false;
	return walkReal().filter(
		(f) => f.format !== null && formats.includes(f.format) && f.giant === wantGiant
	);
}

/** Files the router rejects — the negative track. (.md/OFL/README are junk-filtered.) */
export function realNegative(): RealFile[] {
	return walkReal().filter((f) => f.format === null && !f.giant);
}

/** Stable, filesystem-safe cell id. */
export function cellId(family: string, fileRel: string, action: string, level: string): string {
	const slug = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, '_');
	return `${family}__${slug(fileRel)}__${slug(action)}__${slug(level)}`;
}
