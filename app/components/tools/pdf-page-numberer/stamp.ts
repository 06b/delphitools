import {
	StandardFontEmbedder,
	StandardFonts,
	degrees,
	rgb,
	PDFDocument,
} from 'pdf-lib';
import {
	expandNumber,
	placeText,
	resolvePageNumbers,
	type Anchor,
	type NumberSection,
} from 'delphitools-v2/lib/pdf-stamp';

export type FontFamily = 'sans' | 'serif' | 'mono';
export type StampMode = 'label' | 'watermark';

export const FONTS: FontFamily[] = ['sans', 'serif', 'mono'];
export const MODES: StampMode[] = ['label', 'watermark'];

/** The iOS PDFStampEngine.Options. */
export interface StampOptions {
	numbersOn: boolean;
	template: string;
	numberAnchor: Anchor;
	font: FontFamily;
	/** PDF points. */
	fontSize: number;
	margin: number;
	stampOn: boolean;
	stampText: string;
	stampAnchor: Anchor;
	stampMode: StampMode;
	/** 0 to 1. */
	opacity: number;
	sections: NumberSection[];
}

export const minFontSize = 4;

const FACES: Record<FontFamily, StandardFonts> = {
	sans: StandardFonts.Helvetica,
	serif: StandardFonts.TimesRoman,
	mono: StandardFonts.Courier,
};
const embedders = new Map<FontFamily, StandardFontEmbedder>();

// size-1 advance; unencodable "?"
export function unitWidth(text: string, font: FontFamily): number {
	let face = embedders.get(font);
	if (!face) {
		face = StandardFontEmbedder.for(
			// same strings, cast safe
			FACES[font] as unknown as Parameters<
				typeof StandardFontEmbedder.for
			>[0],
		);
		embedders.set(font, face);
	}
	let width = 0;
	for (const ch of text) {
		try {
			width += face.widthOfTextAtSize(ch, 1);
		} catch {
			width += face.widthOfTextAtSize('?', 1);
		}
	}
	return width;
}

// rotated box: 80% min-side
export function watermarkSize(
	pageW: number,
	pageH: number,
	text: string,
	font: FontFamily,
) {
	return (
		(0.8 * Math.min(pageW, pageH)) /
		((unitWidth(text, font) + 1) * Math.SQRT1_2)
	);
}

// baseline 0.175em below centre
export function watermarkAt(
	pageW: number,
	pageH: number,
	text: string,
	font: FontFamily,
) {
	const size = watermarkSize(pageW, pageH, text, font);
	const w = unitWidth(text, font) * size;
	const k = Math.SQRT1_2;
	const half = (size * 0.35) / 2;
	return {
		x: pageW / 2 - (w / 2) * k + half * k,
		y: pageH / 2 - (w / 2) * k - half * k,
		size,
	};
}

/** The stamp drawn, or none when it is off or blank. */
export const stampOf = (o: StampOptions) =>
	o.stampOn && o.stampText.trim() !== '' ? o.stampText : null;

/** The number line of each page; none where numbers are off or no section has started. */
export function numberLines(o: StampOptions, count: number) {
	const total = String(count);
	return resolvePageNumbers(o.sections, count).map((label) =>
		o.numbersOn && label != null
			? expandNumber(o.template, label, total)
			: null,
	);
}

/** Draws the numbers and the stamp into every page with the base-14 fonts. */
export async function stampPdf(
	bytes: ArrayBuffer,
	o: StampOptions,
): Promise<Uint8Array> {
	const doc = await PDFDocument.load(bytes, { updateMetadata: false });
	const font = await doc.embedFont(FACES[o.font]);
	const size = Math.max(minFontSize, o.fontSize);
	const pages = doc.getPages();
	const lines = numberLines(o, pages.length);
	const stamp = stampOf(o);

	pages.forEach((page, index) => {
		const { width, height } = page.getSize();
		const line = lines[index];
		if (line != null) {
			const w = font.widthOfTextAtSize(line, size);
			const at = placeText(
				width,
				height,
				w,
				size,
				o.numberAnchor,
				o.margin,
			);
			page.drawText(line, {
				...at,
				size,
				font,
				color: rgb(0, 0, 0),
			});
		}
		if (stamp == null) return;
		if (o.stampMode === 'watermark') {
			page.drawText(stamp, {
				...watermarkAt(width, height, stamp, o.font),
				font,
				color: rgb(0, 0, 0),
				opacity: o.opacity,
				rotate: degrees(45),
			});
		} else {
			const w = font.widthOfTextAtSize(stamp, size);
			const at = placeText(
				width,
				height,
				w,
				size,
				o.stampAnchor,
				o.margin,
			);
			page.drawText(stamp, {
				...at,
				size,
				font,
				color: rgb(0.4, 0.4, 0.4),
			});
		}
	});

	return doc.save();
}
