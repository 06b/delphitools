import {
	CATEGORIES,
	SEVERITY_ICON,
	formatSize,
	plural,
	ptsToMm,
	type PageInfo,
	type PreflightIssue,
	type PreflightReport,
} from 'delphitools-v2/lib/pdf-preflight';

export const DASH = '—';

export interface Tile {
	label: string;
	value: string;
}

export interface IssueRow extends PreflightIssue {
	key: string;
	icon: string;
}

const RANK = { error: 0, warning: 1, info: 2 } as const;

export const isError = (issue: PreflightIssue) => issue.severity === 'error';
export const isWarning = (issue: PreflightIssue) =>
	issue.severity === 'warning';

/** Document-wide issues show on every page (iOS `pages(_:)` nil). */
export function onPage(issue: PreflightIssue, page: number | null) {
	return page === null || !issue.page || issue.page === page + 1;
}

/** iOS strip caption: errors, then the other warnings. */
export function marks(issues: PreflightIssue[]) {
	const errors = issues.filter(isError).length;
	const warnings = issues.filter(isWarning).length;
	const parts = [];
	if (errors) parts.push(`✕ ${errors}`);
	if (warnings) parts.push(`! ${warnings}`);
	return parts.join('  ');
}

export function pageMarks(issues: PreflightIssue[], pageCount: number) {
	return Array.from({ length: pageCount }, (_, index) =>
		marks(issues.filter((issue) => issue.page === index + 1)),
	);
}

export function resultTiles(issues: PreflightIssue[] | null): Tile[] {
	const count = (test: (issue: PreflightIssue) => boolean) =>
		issues ? String(issues.filter(test).length) : DASH;
	const passed = issues && !issues.some(isError);
	return [
		{
			label: 'Result',
			value: issues ? (passed ? '✓ Pass' : '✕ Fail') : DASH,
		},
		{ label: 'Errors', value: count(isError) },
		{ label: 'Warnings', value: count(isWarning) },
		{ label: 'Info', value: count((i) => i.severity === 'info') },
	];
}

/** The web verdict line under the tiles. */
export function verdict(issues: PreflightIssue[]) {
	const errors = issues.filter(isError).length;
	return errors === 0
		? 'No critical issues found'
		: `${errors} error${plural(errors)} must be resolved before printing`;
}

export function checkTiles(issues: PreflightIssue[] | null): Tile[] {
	return CATEGORIES.map(({ id, label }) => ({
		label,
		value: issues
			? marks(issues.filter((i) => i.category === id)) || '✓'
			: DASH,
	}));
}

/** Categories with findings, errors first (iOS sorts by severity). */
export function groups(issues: PreflightIssue[]) {
	const rows: IssueRow[] = issues.map((issue, index) => ({
		...issue,
		key: String(index),
		icon: SEVERITY_ICON[issue.severity],
	}));
	return CATEGORIES.map(({ id, label }) => ({
		id,
		label,
		issues: rows
			.filter((row) => row.category === id)
			.sort((a, b) => RANK[a.severity] - RANK[b.severity]),
	})).filter((group) => group.issues.length > 0);
}

export function propertyTiles(report: PreflightReport | null): Tile[] {
	const embedded = report?.fonts.filter((f) => f.embedded).length ?? 0;
	return [
		{ label: 'PDF Version', value: report?.pdfVersion ?? DASH },
		{
			label: 'Pages',
			value: report ? String(report.pageCount) : DASH,
		},
		{
			label: 'File Size',
			value: report ? formatSize(report.fileSize) : DASH,
		},
		{
			label: 'Encrypted',
			value: report
				? report.encrypted
					? 'Yes'
					: 'No'
				: DASH,
		},
		{
			label: 'Fonts',
			value: report
				? `${report.fonts.length} (${embedded} embedded)`
				: DASH,
		},
	];
}

const points = (box: { width: number; height: number }) =>
	`${box.width.toFixed(0)} x ${box.height.toFixed(0)}pt`;

export function dimensionTiles(info: PageInfo): Tile[] {
	const tiles = [
		{
			label: 'Page size',
			value: `${points(info)} (${ptsToMm(info.width).toFixed(0)} x ${ptsToMm(info.height).toFixed(0)}mm)`,
		},
	];
	if (info.trimBox)
		tiles.push({ label: 'Trim', value: points(info.trimBox) });
	if (info.bleedBox)
		tiles.push({ label: 'Bleed', value: points(info.bleedBox) });
	return tiles;
}

/** CSS inset of a viewport rectangle [x1, y1, x2, y2] on a page `width` x `height`. */
export function insetOf(
	[x1, y1, x2, y2]: number[],
	width: number,
	height: number,
) {
	const pct = (value: number) => `${+(value * 100).toFixed(3)}%`;
	const left = Math.min(x1!, x2!) / width;
	const top = Math.min(y1!, y2!) / height;
	const right = 1 - Math.max(x1!, x2!) / width;
	const bottom = 1 - Math.max(y1!, y2!) / height;
	return `inset: ${pct(top)} ${pct(right)} ${pct(bottom)} ${pct(left)}`;
}
