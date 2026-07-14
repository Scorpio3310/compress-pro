/**
 * OS-level peak-memory sampling for the bench suite (darwin only). The browser
 * under test is a child of THIS Playwright worker process, while the wrangler
 * webServer belongs to the runner process — so summing RSS over strict
 * descendants of process.pid counts exactly the browser's process tree.
 *
 * Caveats every consumer note should carry: 250 ms polling can miss shorter
 * spikes, the tree sum double-counts shared pages, and macOS compression makes
 * RSS undercount — these numbers are trends, not budgets.
 */
import { execFile } from 'node:child_process';
import type { Page } from '@playwright/test';

export interface RssSnapshot {
	/** Sum over the whole browser process tree, MB. */
	treeMb: number;
	/** Largest single process, MB — what an OS memory kill would target. */
	maxProcMb: number;
}

function psSnapshot(): Promise<Map<number, { ppid: number; rssKb: number }>> {
	return new Promise((resolve, reject) => {
		execFile('ps', ['-axo', 'pid=,ppid=,rss='], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
			if (err) return reject(err);
			const procs = new Map<number, { ppid: number; rssKb: number }>();
			for (const line of stdout.split('\n')) {
				const parts = line.trim().split(/\s+/);
				if (parts.length < 3) continue;
				const [pid, ppid, rssKb] = parts.map(Number);
				if (Number.isFinite(pid) && Number.isFinite(ppid)) {
					procs.set(pid, { ppid, rssKb: rssKb || 0 });
				}
			}
			resolve(procs);
		});
	});
}

export class RssSampler {
	private timer: NodeJS.Timeout | null = null;
	private busy = false;
	private peakTreeMb = 0;
	private peakProcMb = 0;

	constructor(
		private readonly rootPid: number = process.pid,
		private readonly intervalMs = 250
	) {}

	/** One-shot reading (baseline / settled). */
	async sample(): Promise<RssSnapshot> {
		const procs = await psSnapshot();
		const children = new Map<number, number[]>();
		for (const [pid, { ppid }] of procs) {
			const list = children.get(ppid);
			if (list) list.push(pid);
			else children.set(ppid, [pid]);
		}
		let treeKb = 0;
		let maxProcKb = 0;
		// Strict descendants only: the node worker's own RSS must never win maxProc.
		const stack = [...(children.get(this.rootPid) ?? [])];
		while (stack.length > 0) {
			const pid = stack.pop()!;
			const rssKb = procs.get(pid)?.rssKb ?? 0;
			treeKb += rssKb;
			if (rssKb > maxProcKb) maxProcKb = rssKb;
			const kids = children.get(pid);
			if (kids) stack.push(...kids);
		}
		return { treeMb: treeKb / 1024, maxProcMb: maxProcKb / 1024 };
	}

	start(): void {
		this.stop();
		this.timer = setInterval(() => {
			// A ps scan on a loaded machine can outlast the interval — skip, not overlap.
			if (this.busy) return;
			this.busy = true;
			this.sample()
				.then((s) => {
					if (s.treeMb > this.peakTreeMb) this.peakTreeMb = s.treeMb;
					if (s.maxProcMb > this.peakProcMb) this.peakProcMb = s.maxProcMb;
				})
				.catch(() => {}) // processes vanishing mid-scan is normal
				.finally(() => {
					this.busy = false;
				});
		}, this.intervalMs);
	}

	/** Between back-to-back runs, so run 2 gets its own peak. */
	resetPeaks(): void {
		this.peakTreeMb = 0;
		this.peakProcMb = 0;
	}

	peaks(): RssSnapshot {
		return { treeMb: this.peakTreeMb, maxProcMb: this.peakProcMb };
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
}

export interface UasmReading {
	totalMb: number;
	windowMb: number;
	workerMb: number;
	otherMb: number;
	/** Top realms by size, for the case note. */
	top: string;
}

interface UasmResult {
	bytes: number;
	breakdown: { bytes: number; attribution: { url?: string; scope?: string }[] }[];
}

/**
 * Chromium-only retained-memory breakdown (resolves after the next GC, so it
 * measures what SURVIVES a run — the leak signal — not the peak). Returns null
 * where the API is missing (firefox/webkit) or the call fails.
 */
export async function measureUasm(page: Page): Promise<UasmReading | null> {
	const raw = await page
		.evaluate(async () => {
			const perf = performance as unknown as {
				measureUserAgentSpecificMemory?: () => Promise<unknown>;
			};
			if (!perf.measureUserAgentSpecificMemory) return null;
			return (await perf.measureUserAgentSpecificMemory()) as UasmResult;
		})
		.catch(() => null);
	if (!raw) return null;

	let windowB = 0;
	let workerB = 0;
	let otherB = 0;
	const realms: [string, number][] = [];
	for (const b of raw.breakdown) {
		const scope = b.attribution[0]?.scope ?? 'shared';
		if (scope === 'Window') windowB += b.bytes;
		else if (scope.includes('Worker')) workerB += b.bytes;
		else otherB += b.bytes;
		if (b.bytes > 0) realms.push([`${scope}:${b.attribution[0]?.url ?? '?'}`, b.bytes]);
	}
	realms.sort((a, b) => b[1] - a[1]);
	const mb = (n: number) => Number((n / 1048576).toFixed(1));
	return {
		totalMb: mb(raw.bytes),
		windowMb: mb(windowB),
		workerMb: mb(workerB),
		otherMb: mb(otherB),
		top: realms
			.slice(0, 4)
			.map(([k, v]) => `${k}=${mb(v)}MB`)
			.join(', ')
	};
}
