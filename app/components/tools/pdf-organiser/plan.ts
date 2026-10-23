import { normaliseRotation } from 'delphitools-v2/lib/pdf-pages';

export interface Size {
	width: number;
	height: number;
}

/** A page size after a quarter-turn rotation in degrees. */
export function turned(size: Size, rotation: number): Size {
	return normaliseRotation(rotation) % 180 === 0
		? size
		: { width: size.height, height: size.width };
}

/** `list` with the item at `from` moved to `to`. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
	const next = [...list];
	const [item] = next.splice(from, 1);
	if (item !== undefined) next.splice(to, 0, item);
	return next;
}

/** The file name of each split part, as the web tool and iOS name them. */
export function partNames(
	groups: number[][],
	base: string,
	every: boolean,
): string[] {
	return groups.map((group, index) =>
		every
			? `${base}-page-${group[0]! + 1}.pdf`
			: `${base}-part-${index + 1}.pdf`,
	);
}

/** The caption under a part in the parts strip: `3` or `1–4`. */
export function partLabel(group: number[]): string {
	const first = group[0]! + 1;
	const last = group[group.length - 1]! + 1;
	return first === last ? `${first}` : `${first}–${last}`;
}
