import type { NumberSection, NumeralStyle } from 'delphitools-v2/lib/pdf-stamp';

export interface Section extends NumberSection {
	id: number;
}

/** In the order of the iOS NumeralStyle, with its labels. */
export const STYLES: { id: NumeralStyle; label: string }[] = [
	{ id: 'arabic', label: '1, 2, 3' },
	{ id: 'roman-lower', label: 'i, ii, iii' },
	{ id: 'roman-upper', label: 'I, II, III' },
	{ id: 'alpha-lower', label: 'a, b, c' },
	{ id: 'alpha-upper', label: 'A, B, C' },
];

let lastId = 0;

export function section(
	fromPage = 1,
	style: NumeralStyle = 'arabic',
	startAt = 1,
): Section {
	return { id: ++lastId, fromPage, style, startAt };
}

export const byStart = (sections: Section[]) =>
	[...sections].sort((a, b) => a.fromPage - b.fromPage);

/** The section that numbers a 1-based page; none before the first one starts. */
export function sectionAt(sections: Section[], page: number) {
	let found: Section | undefined;
	for (const s of sections)
		if (
			s.fromPage <= page &&
			(!found || s.fromPage > found.fromPage)
		)
			found = s;
	return found;
}

/**
 * A new section at the first page from `page` (1-based) that starts none,
 * in the style of the section it splits; none when every later page starts one.
 */
export function splitAt(sections: Section[], page: number, count: number) {
	const starts = new Set(sections.map((s) => s.fromPage));
	for (let p = page; p <= Math.max(page, count); p++)
		if (!starts.has(p))
			return section(
				p,
				sectionAt(sections, p)?.style ?? 'arabic',
			);
	return undefined;
}

/** A start for the section at `index` of `ordered`, kept between its neighbours so starts stay unique. */
export function clampStart(
	ordered: Section[],
	index: number,
	value: number,
	count: number,
) {
	const low = index > 0 ? ordered[index - 1]!.fromPage + 1 : 1;
	const high =
		index < ordered.length - 1
			? ordered[index + 1]!.fromPage - 1
			: Math.max(1, count);
	return Math.min(Math.max(value, low), Math.max(low, high));
}

/** Sections that start inside a document of `count` pages; the default one when none does. */
export function fitSections(sections: Section[], count: number) {
	const kept = sections.filter((s) => s.fromPage <= count);
	return kept.length ? kept : [section()];
}

/** The iOS -ppnSections flag: `2:roman-lower,4:arabic:5` is from, style and an optional start. */
export function parseSections(spec: string): Section[] {
	const styles = new Set(STYLES.map((s) => s.id));
	return spec.split(',').flatMap((part) => {
		const [from, style, start] = part.split(':');
		const fromPage = Number.parseInt(from ?? '', 10);
		if (
			!Number.isFinite(fromPage) ||
			!styles.has(style as NumeralStyle)
		)
			return [];
		const startAt = Number.parseInt(start ?? '', 10);
		return [
			section(
				fromPage,
				style as NumeralStyle,
				Number.isFinite(startAt) ? startAt : 1,
			),
		];
	});
}
