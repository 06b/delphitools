import type { PageRect } from 'delphicanon/components/canon-page-strip';
import { MM_TO_POINTS } from 'delphitools-v2/lib/imposition';
import {
	fitPlacement,
	MATCH_IMAGE_SIZE,
	pageSetupPt,
	type FitMode,
	type PageOrientation,
} from 'delphitools-v2/lib/pdf-pages';

export interface Options {
	sizeId: string;
	orientation: PageOrientation;
	fit: FitMode;
	marginMm: number;
}

export interface Layout {
	page: { width: number; height: number };
	area: PageRect;
	placement: PageRect;
}

/** PDF points, bottom-left origin; the same layout feeds the strip and the build (iOS ImageToPDFEngine.layout). */
export function layout(
	width: number,
	height: number,
	options: Options,
): Layout {
	const margin = options.marginMm * MM_TO_POINTS;
	const page = pageSetupPt(
		options.sizeId,
		options.orientation,
		width,
		height,
		margin,
	);
	const inner = {
		width: Math.max(page.width - margin * 2, 1),
		height: Math.max(page.height - margin * 2, 1),
	};
	const placed = fitPlacement(
		width,
		height,
		inner.width,
		inner.height,
		options.sizeId === MATCH_IMAGE_SIZE ? 'contain' : options.fit,
	);
	return {
		page,
		area: { x: margin, y: margin, ...inner },
		placement: {
			x: placed.x + margin,
			y: placed.y + margin,
			width: placed.width,
			height: placed.height,
		},
	};
}

/** The empty picture: the chosen paper and margin, A4 portrait when each page matches its image. */
export function blankPage(options: Options) {
	const sizeId =
		options.sizeId === MATCH_IMAGE_SIZE ? 'a4' : options.sizeId;
	const orientation =
		options.sizeId === MATCH_IMAGE_SIZE
			? 'portrait'
			: options.orientation;
	const { page, area } = layout(1, 1, {
		...options,
		sizeId,
		orientation,
	});
	return { size: page, area };
}

const collator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: 'base',
});

/** Finder-style numeric order by name (iOS localizedStandardCompare). */
export function sortedByName<T extends { name: string }>(
	items: T[],
	ascending: boolean,
): T[] {
	return [...items].sort(
		(a, b) =>
			collator.compare(a.name, b.name) * (ascending ? 1 : -1),
	);
}
