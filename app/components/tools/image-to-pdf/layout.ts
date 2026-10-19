import type { PageRect } from 'delphicanon/components/canon-page-strip';
import { MM_TO_POINTS } from 'delphitools-v2/lib/imposition';
import { BLEED_MM } from 'delphitools-v2/components/tools/zine-imposer/images';
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
	bleed: boolean;
}

export interface Layout {
	/** The media box: the trim plus the bleed on each side. */
	page: { width: number; height: number };
	trim: PageRect;
	area: PageRect;
	placement: PageRect;
}

/**
 * PDF points, bottom-left origin; the same layout feeds the strip and the
 * build (iOS ImageToPDFEngine.layout). The margin is measured from the trim;
 * with no margin, the area is the whole page, bleed included.
 */
export function layout(
	width: number,
	height: number,
	options: Options,
): Layout {
	const margin = options.marginMm * MM_TO_POINTS;
	const bleed = options.bleed ? BLEED_MM * MM_TO_POINTS : 0;
	const trim = pageSetupPt(
		options.sizeId,
		options.orientation,
		width,
		height,
		margin,
	);
	const page = {
		width: trim.width + bleed * 2,
		height: trim.height + bleed * 2,
	};
	const inset = margin ? bleed + margin : 0;
	const inner = {
		width: Math.max(page.width - inset * 2, 1),
		height: Math.max(page.height - inset * 2, 1),
	};
	// a matched page has the image's shape; cover runs it into the bleed
	const matchFit = inset === 0 && bleed ? 'cover' : 'contain';
	const placed = fitPlacement(
		width,
		height,
		inner.width,
		inner.height,
		options.sizeId === MATCH_IMAGE_SIZE ? matchFit : options.fit,
	);
	return {
		page,
		trim: { x: bleed, y: bleed, ...trim },
		area: { x: inset, y: inset, ...inner },
		placement: {
			x: placed.x + inset,
			y: placed.y + inset,
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
