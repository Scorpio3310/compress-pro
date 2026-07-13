import type { FileFormat, SettingsMap } from '$lib/types';
import { isImageFormat } from '$lib/types';
import { validatePageRangeSyntax } from '$lib/pdf-range';

/** Any tab's settings — the union of all SettingsMap values. */
export type ToolSettings = SettingsMap[FileFormat];

/** CTA label. Exact strings are asserted by e2e (e.g. B-02 `/Compress 3 files/`). */
export function actionLabel(
	format: FileFormat,
	settings: ToolSettings,
	filesCount: number
): string {
	const plural = filesCount !== 1 ? 's' : '';
	if (format === 'exif') return `Remove metadata from ${filesCount} file${plural}`;
	if (format === 'audio') return `Convert ${filesCount} file${plural}`;
	if (format === 'font') {
		return (settings as SettingsMap['font']).op === 'subset'
			? `Subset ${filesCount} font${plural}`
			: `Convert ${filesCount} file${plural}`;
	}
	if (format === 'zip') {
		return (settings as SettingsMap['zip']).op === 'create'
			? `Create ZIP from ${filesCount} file${plural}`
			: `Extract ${filesCount} archive${plural}`;
	}
	if (format !== 'pdf') return `Compress ${filesCount} file${plural}`;
	const pdf = settings as SettingsMap['pdf'];
	switch (pdf.op) {
		case 'merge':
			return `Merge ${filesCount} files`;
		case 'pages':
			return pdf.pageMode === 'keep' ? 'Extract pages' : 'Remove pages';
		case 'toImages':
			return `Convert ${filesCount} file${plural} to images`;
		case 'fromImages':
			return `Create PDF from ${filesCount} image${plural}`;
		case 'unlock':
			return `Unlock ${filesCount} PDF${plural}`;
		case 'protect':
			return `Protect ${filesCount} PDF${plural}`;
		default:
			return `Compress ${filesCount} file${plural}`;
	}
}

export function busyLabel(format: FileFormat, settings: ToolSettings): string {
	if (format === 'exif') return 'Cleaning…';
	if (format === 'audio') return 'Converting…';
	if (format === 'font') {
		return (settings as SettingsMap['font']).op === 'subset' ? 'Subsetting…' : 'Converting…';
	}
	if (format === 'zip') return 'Working…';
	if (format === 'pdf' && (settings as SettingsMap['pdf']).op !== 'compress') return 'Working…';
	return 'Compressing…';
}

/** True when the current settings can't produce a valid run (CTA disabled). */
export function actionInvalid(
	format: FileFormat,
	settings: ToolSettings,
	filesCount: number
): boolean {
	if (format === 'pdf') {
		const pdf = settings as SettingsMap['pdf'];
		const targetInvalid = pdf.mode === 'target' && !(pdf.targetMb > 0);
		return (
			(pdf.op === 'compress' && targetInvalid) ||
			(pdf.op === 'merge' && (filesCount < 2 || (pdf.mergeCompress && targetInvalid))) ||
			(pdf.op === 'pages' && validatePageRangeSyntax(pdf.pageRange) !== null) ||
			((pdf.op === 'unlock' || pdf.op === 'protect') && pdf.password.trim() === '')
		);
	}
	if (isImageFormat(format)) {
		const image = settings as SettingsMap['jpg'];
		// Target mode exists for quality-parametric encoders only (not GIF/ICO) —
		// in those modes the target input is hidden, so it must not gate the CTA.
		return (
			image.outputFormat !== 'gif' &&
			image.outputFormat !== 'ico' &&
			image.mode === 'target' &&
			!(image.targetKb > 0)
		);
	}
	if (format === 'video') {
		const video = settings as SettingsMap['video'];
		return video.mode === 'target' && !(video.targetMb > 0);
	}
	if (format === 'audio') {
		const audio = settings as SettingsMap['audio'];
		return audio.outputFormat !== 'wav' && audio.mode === 'target' && !(audio.targetMb > 0);
	}
	return false;
}
