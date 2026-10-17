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

// 80% diagonal; helvetica caps ~0.55em
export function watermarkSize(pageW: number, pageH: number, textLen: number) {
	const raw =
		(0.8 * Math.hypot(pageW, pageH)) /
		(0.55 * Math.max(1, textLen));
	return Math.min(raw, Math.min(pageW, pageH) * 0.9);
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
	const { PDFDocument, StandardFonts, rgb, degrees } =
		await import('pdf-lib');
	const doc = await PDFDocument.load(bytes, { updateMetadata: false });
	const font = await doc.embedFont(
		o.font === 'serif'
			? StandardFonts.TimesRoman
			: o.font === 'mono'
				? StandardFonts.Courier
				: StandardFonts.Helvetica,
	);
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
			const wmSize = watermarkSize(
				width,
				height,
				stamp.length,
			);
			const w = font.widthOfTextAtSize(stamp, wmSize);
			const k = Math.cos(Math.PI / 4);
			const half = (wmSize * 0.35) / 2;
			page.drawText(stamp, {
				x: width / 2 - (w / 2) * k + half * k,
				y: height / 2 - (w / 2) * k - half * k,
				size: wmSize,
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
