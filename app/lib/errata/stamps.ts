import { StandardFontEmbedder, StandardFonts } from 'pdf-lib';
import { parsePageRanges } from '../pdf-pages';
import { expandNumber, placeText, type Anchor } from '../pdf-stamp';
import {
	newId,
	pageSize,
	type ErrataDoc,
	type ErrataPage,
	type Stamped,
	type TextObject,
} from './doc-model';
import { store } from './store';

export type PageScope = 'all' | 'current' | 'range';

// itext line 1.13em, baseline 0.778
const LINE = 1.13;
const BASELINE = 0.778;
const MARGIN = 24;

/** page indices the scope covers; null when the range does not parse */
export function scopePages(
	scope: PageScope,
	range: string,
	count: number,
	current: number,
): number[] | null {
	if (scope === 'all') return [...Array(count).keys()];
	if (scope === 'current') return [current];
	try {
		const pages = new Set(parsePageRanges(range, count).flat());
		return [...pages].sort((a, b) => a - b);
	} catch {
		return null;
	}
}

let helvetica: StandardFontEmbedder | undefined;

// export uses helvetica widths
export function textWidth(text: string, size: number): number {
	// same strings, cast safe
	const font = (helvetica ??= StandardFontEmbedder.for(
		StandardFonts.Helvetica as unknown as Parameters<
			typeof StandardFontEmbedder.for
		>[0],
	));
	let width = 0;
	for (const ch of text) {
		try {
			width += font.widthOfTextAtSize(ch, size);
		} catch {
			width += font.widthOfTextAtSize('?', size);
		}
	}
	return width;
}

function textObject(
	text: string,
	size: number,
	colour: string,
	cx: number,
	cy: number,
	extra: Partial<TextObject> = {},
	w = textWidth(text, size),
): TextObject {
	return {
		id: newId(),
		kind: 'text',
		cx,
		cy,
		w,
		h: size * LINE,
		scaleX: 1,
		scaleY: 1,
		angle: 0,
		text,
		fontSize: size,
		colour,
		...extra,
	};
}

// pdf y-up to canvas
function anchored(
	page: ErrataPage,
	text: string,
	size: number,
	anchor: Anchor,
	colour: string,
): TextObject {
	const { width, height } = pageSize(page);
	const w = textWidth(text, size);
	const { x, y } = placeText(width, height, w, size, anchor, MARGIN);
	const top = height - y - size * LINE * BASELINE;
	return textObject(
		text,
		size,
		colour,
		x + w / 2,
		top + (size * LINE) / 2,
		{},
		w,
	);
}

export function pageNumberObjects(
	doc: ErrataDoc,
	indices: number[],
	format: string,
	anchor: Anchor,
	size: number,
): Stamped[] {
	const total = String(doc.pages.length);
	return indices.flatMap((index) => {
		const text = expandNumber(format, String(index + 1), total);
		if (text.trim() === '') return [];
		return [
			{
				index,
				object: anchored(
					doc.pages[index]!,
					text,
					size,
					anchor,
					'#000000',
				),
			},
		];
	});
}

/** centred, sized so the rotated line spans 80% of the page either way */
export function watermarkObjects(
	doc: ErrataDoc,
	indices: number[],
	text: string,
	opacity: number,
	angle: number,
): Stamped[] {
	if (text.trim() === '') return [];
	const t = (Math.abs(angle) * Math.PI) / 180;
	const cos = Math.cos(t);
	const sin = Math.sin(t);
	const w1 = textWidth(text, 1);
	return indices.map((index) => {
		const { width, height } = pageSize(doc.pages[index]!);
		const size = Math.min(
			(0.8 * width) / (w1 * cos + LINE * sin),
			(0.8 * height) / (w1 * sin + LINE * cos),
		);
		return {
			index,
			object: textObject(
				text,
				size,
				'#000000',
				width / 2,
				height / 2,
				{ angle, opacity },
			),
		};
	});
}

export function stampObjects(
	doc: ErrataDoc,
	indices: number[],
	label: string,
	anchor: Anchor,
	size: number,
): Stamped[] {
	return indices.map((index) => ({
		index,
		object: anchored(
			doc.pages[index]!,
			label,
			size,
			anchor,
			'#d1242f',
		),
	}));
}

/** one undo step for the lot */
export function addStamped(items: Stamped[]): void {
	if (items.length === 0) return;
	const byPage = Map.groupBy(items, (s) => s.index);
	store.update((doc) => ({
		...doc,
		pages: doc.pages.map((page, i) => {
			const add = byPage.get(i)?.map((s) => s.object);
			return add
				? {
						...page,
						objects: [
							...page.objects,
							...add,
						],
					}
				: page;
		}),
	}));
}
