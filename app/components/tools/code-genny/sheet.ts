import {
	BARCODE_TYPES,
	BWIP_BCID,
	mod10CheckDigit,
	type BarcodeType,
} from 'delphitools-v2/components/tools/code-genny/barcode';
import {
	pixelSize,
	sizeOf,
	type CodeSheet,
} from 'delphitools-v2/components/tools/qr-genny/code-sheet';

/** What bwip-js `raw` returns for one symbol: a matrix, or bars with their text. */
export type Raw =
	| { pixs: number[]; pixx: number; pixy: number }
	| {
			sbs: number[];
			bhs: number[];
			txt?: [string, number, number | null, string, number][];
	  };

export interface Look {
	/** Margin round the code, in modules. */
	padding: number;
	ink: string;
	/** None: transparent. */
	paper?: string;
	/** The human-readable line under a 1D code. */
	numbers: boolean;
}

export interface Glyph {
	text: string;
	/** Centre in modules from the code's left edge. */
	x: number;
	/** Font size in modules. */
	size: number;
}

export type BarcodeSheet = CodeSheet & {
	glyphs: Glyph[];
	/** Columns of the guard bars, which run into the text band. */
	guards: Set<number>;
};

/** iOS BarcodeGeneratorViewController.bars: bar height and guard drop, in modules. */
export const bars = { height: 60, guardDrop: 5 } as const;
/** The text band under a 1D code, in modules. */
export const digitBand = 11;
const digitSize = 8.5;
const pdfRows = 3;

/** Symbology quiet zones in modules; the picture marks a smaller margin. */
export const quietZones: Record<BarcodeType, number> = {
	microqr: 2,
	datamatrix: 1,
	azteccode: 0,
	pdf417: 2,
	code128: 10,
	code39: 10,
	ean13: 7,
	upca: 9,
};

/** The margin a type starts with: iOS defaultPadding, the quiet zone for the web's extra types. */
export const defaultPadding: Record<BarcodeType, number> = {
	microqr: 2,
	datamatrix: 2,
	azteccode: 2,
	pdf417: 2,
	code128: 10,
	code39: 10,
	ean13: 11,
	upca: 9,
};

export const bwipOptions = (type: BarcodeType, text: string) => ({
	bcid: BWIP_BCID[type],
	text,
	includetext: BARCODE_TYPES[type].category === '1d',
	...(type === 'pdf417' ? { rowmult: pdfRows } : {}),
});

/** The number an EAN-13 or UPC-A code carries, its check digit added. */
export function fullNumber(type: BarcodeType, content: string): string {
	const length = type === 'ean13' ? 12 : type === 'upca' ? 11 : 0;
	if (!length || content.length !== length) return content;
	const [even, odd] = type === 'ean13' ? [1, 3] : [3, 1];
	return content + String(mod10CheckDigit(content, even, odd));
}

const square = new Path2D();
square.rect(0, 0, 1, 1);
const tall = new Path2D();
tall.rect(0, 0, 1, (bars.height + bars.guardDrop) / bars.height);

/** bwip-js raw output as a code sheet: modules, guard bars and the text line. */
export function sheetOf(type: BarcodeType, raw: Raw, look: Look): BarcodeSheet {
	const pad = look.padding;
	const base = {
		margin: { top: pad, left: pad, bottom: pad, right: pad },
		ink: look.ink,
		paper: look.paper,
		quietZone: quietZones[type],
		glyphs: [] as Glyph[],
		guards: new Set<number>(),
	};
	if ('pixs' in raw) {
		// pixy counts rowmult rows
		const rows = raw.pixs.length / raw.pixx;
		const modules: boolean[][] = [];
		for (let y = 0; y < rows; y++)
			modules.push(
				Array.from(
					{ length: raw.pixx },
					(_, x) =>
						raw.pixs[y * raw.pixx + x] ===
						1,
				),
			);
		return {
			...base,
			modules,
			rowHeight: raw.pixy / rows,
			sweep: type === 'azteccode' ? 'rings' : 'columns',
			anchor: type === 'azteccode' ? 'centre' : 'leading',
		};
	}

	const row: boolean[] = [];
	const guards = new Set<number>();
	const lowest = Math.min(...raw.bhs);
	raw.sbs.forEach((width, i) => {
		const bar = i % 2 === 0;
		const guard = bar && (raw.bhs[i / 2] ?? lowest) > lowest + 1e-4;
		for (let k = 0; k < width; k++) {
			if (guard) guards.add(row.length);
			row.push(bar);
		}
	});
	const sheet: BarcodeSheet = {
		...base,
		modules: [row],
		rowHeight: bars.height,
		sweep: 'columns',
		anchor: 'leading',
	};
	const text = raw.txt ?? [];
	if (!look.numbers || !text.length) return sheet;

	sheet.guards = guards;
	if (guards.size)
		sheet.shape = (_, column) =>
			guards.has(column) ? tall : square;
	if (text.length === 1) {
		// one line, fitted to the bars
		const line = text[0]![0];
		sheet.glyphs = [
			{
				text: line,
				x: row.length / 2,
				size: Math.min(
					digitSize,
					row.length /
						Math.max(1, line.length) /
						0.62,
				),
			},
		];
	} else {
		// bwip-js sets each digit 4.25 modules into its 7-module cell
		sheet.glyphs = text.map(([digit, x]) => ({
			text: digit,
			x: x - 0.75,
			size: digitSize,
		}));
		const xs = sheet.glyphs.map((g) => g.x);
		sheet.margin = {
			...sheet.margin,
			left: Math.max(pad, Math.ceil(3.5 - Math.min(...xs))),
			right: Math.max(
				pad,
				Math.ceil(Math.max(...xs) + 3.5 - row.length),
			),
		};
	}
	sheet.footer = digitBand;
	sheet.marks = (context, origin, pitch) =>
		drawGlyphs(context, sheet, origin, pitch);
	sheet.marksKey = `${sheet.glyphs.map((g) => g.text).join('')}|${look.ink}|${sheet.margin.left}`;
	return sheet;
}

function monoFont() {
	return (
		getComputedStyle(document.documentElement)
			.getPropertyValue('--canon-mono-font')
			.trim() || 'monospace'
	);
}

function drawGlyphs(
	context: CanvasRenderingContext2D,
	sheet: BarcodeSheet,
	origin: { x: number; y: number },
	pitch: number,
) {
	const font = monoFont();
	const middle = origin.y + (bars.height + digitBand / 2) * pitch;
	context.fillStyle = sheet.ink;
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	for (const glyph of sheet.glyphs) {
		context.font = `500 ${glyph.size * pitch}px ${font}`;
		context.fillText(
			glyph.text,
			origin.x + glyph.x * pitch,
			middle,
		);
	}
}

/** The written image on a canvas, `pixels` px per module. */
export function canvasOf(sheet: BarcodeSheet, pixels: number) {
	const size = pixelSize(sheet, pixels);
	const canvas = document.createElement('canvas');
	canvas.width = size.width;
	canvas.height = size.height;
	const context = canvas.getContext('2d');
	if (!context) return canvas;
	if (sheet.paper) {
		context.fillStyle = sheet.paper;
		context.fillRect(0, 0, size.width, size.height);
	}
	const origin = {
		x: sheet.margin.left * pixels,
		y: sheet.margin.top * pixels,
	};
	const height = (sheet.rowHeight ?? 1) * pixels;
	const drop = (bars.height + bars.guardDrop) / bars.height;
	context.fillStyle = sheet.ink;
	sheet.modules.forEach((row, r) =>
		row.forEach((dark, c) => {
			if (!dark) return;
			context.fillRect(
				origin.x + c * pixels,
				origin.y + r * height,
				pixels,
				height * (sheet.guards.has(c) ? drop : 1),
			);
		}),
	);
	sheet.marks?.(context, origin, pixels);
	return canvas;
}

export function pngOf(
	sheet: BarcodeSheet,
	pixels: number,
): Promise<Blob | null> {
	return new Promise((resolve) =>
		canvasOf(sheet, pixels).toBlob(resolve, 'image/png'),
	);
}

const escapeXml = (text: string) =>
	text.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The written image as SVG in module units: one rect per run of dark modules, the text as text. */
export function svgOf(sheet: BarcodeSheet, pixels: number): string {
	const size = pixelSize(sheet, pixels);
	const box = sizeOf(sheet);
	const { left, top } = sheet.margin;
	const height = sheet.rowHeight ?? 1;
	const drop = (bars.height + bars.guardDrop) / bars.height;
	const rects: string[] = [];
	sheet.modules.forEach((row, r) => {
		let c = 0;
		while (c < row.length) {
			if (!row[c]) {
				c += 1;
				continue;
			}
			const guard = sheet.guards.has(c);
			let end = c + 1;
			while (
				end < row.length &&
				row[end] &&
				sheet.guards.has(end) === guard
			)
				end += 1;
			rects.push(
				`<rect x="${left + c}" y="${top + r * height}" width="${end - c}" height="${height * (guard ? drop : 1)}"/>`,
			);
			c = end;
		}
	});
	const middle = top + bars.height + digitBand / 2;
	const texts = sheet.glyphs.map(
		(g) =>
			`<text x="${left + g.x}" y="${middle}" font-size="${g.size}">${escapeXml(g.text)}</text>`,
	);
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${box.width} ${box.height}" shape-rendering="crispEdges">`,
		sheet.paper
			? `<rect width="100%" height="100%" fill="${sheet.paper}"/>`
			: '',
		`<g fill="${sheet.ink}">${rects.join('')}</g>`,
		texts.length
			? `<g fill="${sheet.ink}" font-family="ui-monospace, monospace" font-weight="500" text-anchor="middle" dominant-baseline="central">${texts.join('')}</g>`
			: '',
		'</svg>',
	].join('');
}
