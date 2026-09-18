import {
	PDFArray,
	PDFDict,
	PDFName,
	PDFNumber,
	PDFRawStream,
	PDFStream,
	StandardFontEmbedder,
	decodePDFRawStream,
	type PDFContext,
	type PDFObject,
} from 'pdf-lib';
import { tokenise } from './tokens';

export interface Glyph {
	code: number;
	/** unicode text, '' when unknown */
	text: string;
	/** advance in text space units of 1/1000 (Type3: already in glyph space × FontMatrix × 1000) */
	width: number;
	isSpace: boolean;
}

export interface FontInfo {
	subtype: string;
	baseFont: string;
	/** bytes per code */
	codeBytes: 1 | 2;
	ascent: number;
	descent: number;
	/** Type3 glyph space to text space */
	fontMatrix: number[] | null;
	decode(bytes: Uint8Array): Glyph[];
	/** unicode → single code, null when the font cannot show it */
	encode(ch: string): number | null;
}

export function streamBytes(stream: PDFStream): Uint8Array {
	if (!(stream instanceof PDFRawStream)) return stream.getContents();
	try {
		return decodePDFRawStream(stream).decode();
	} catch {
		// a /Filter entry on plain bytes is common enough; pdf.js falls back the same way
		return stream.contents;
	}
}

function numOf(o: PDFObject | undefined, fallback: number): number {
	return o instanceof PDFNumber ? o.asNumber() : fallback;
}

// vite's dep optimizer (rolldown) rejects @pdf-lib/standard-fonts' .compressed.json files, so the AFM data comes through pdf-lib
type AfmFont = StandardFontEmbedder['font'];
type AfmEncoding = StandardFontEmbedder['encoding'];
type StandardName = Parameters<typeof StandardFontEmbedder.for>[0];

const STANDARD_ALIASES: Record<string, string> = {
	Arial: 'Helvetica',
	ArialMT: 'Helvetica',
	'Arial-BoldMT': 'Helvetica-Bold',
	'Arial,Bold': 'Helvetica-Bold',
	'Arial-ItalicMT': 'Helvetica-Oblique',
	'Arial-BoldItalicMT': 'Helvetica-BoldOblique',
	TimesNewRoman: 'Times-Roman',
	TimesNewRomanPSMT: 'Times-Roman',
	'TimesNewRoman,Bold': 'Times-Bold',
	'TimesNewRomanPS-BoldMT': 'Times-Bold',
	CourierNew: 'Courier',
	CourierNewPSMT: 'Courier',
};

const STANDARD_NAMES = new Set<string>([
	'Courier',
	'Courier-Bold',
	'Courier-Oblique',
	'Courier-BoldOblique',
	'Helvetica',
	'Helvetica-Bold',
	'Helvetica-Oblique',
	'Helvetica-BoldOblique',
	'Times-Roman',
	'Times-Bold',
	'Times-Italic',
	'Times-BoldItalic',
	'Symbol',
	'ZapfDingbats',
]);

function encodingOf(name: string): AfmEncoding {
	return StandardFontEmbedder.for(name as StandardName).encoding;
}

function standardFont(baseFont: string): AfmFont | null {
	const bare = baseFont.replace(/^[A-Z]{6}\+/, '');
	const name = STANDARD_NAMES.has(bare) ? bare : STANDARD_ALIASES[bare];
	return name
		? StandardFontEmbedder.for(name as StandardName).font
		: null;
}

/** code → glyph name for a simple font's encoding, then unicode via the AFM encodings */
function buildEncoding(
	dict: PDFDict,
	ctx: PDFContext,
	symbolic: boolean,
	baseFont: string,
) {
	const codeToName = new Map<number, string>();
	const nameToUnicode = new Map<string, number>();
	const fill = (enc: AfmEncoding) => {
		for (const cp of enc.supportedCodePoints) {
			const { code, name } = enc.encodeUnicodeCodePoint(cp);
			codeToName.set(code, name);
			// WinAnsi maps both 32 and 160 to 'space'; keep the lower code point
			if (!nameToUnicode.has(name))
				nameToUnicode.set(name, cp);
		}
	};
	const bare = baseFont.replace(/^[A-Z]{6}\+/, '');
	if (bare === 'Symbol') fill(encodingOf('Symbol'));
	else if (bare === 'ZapfDingbats') fill(encodingOf('ZapfDingbats'));
	else if (!symbolic) fill(encodingOf('Helvetica'));
	// ponytail: StandardEncoding and MacRoman fall back to WinAnsi names for the ASCII range they share
	const encoding = ctx.lookup(dict.get(PDFName.of('Encoding')));
	let hasDifferences = false;
	if (encoding instanceof PDFName && codeToName.size === 0)
		fill(encodingOf('Helvetica'));
	if (encoding instanceof PDFDict) {
		if (codeToName.size === 0) fill(encodingOf('Helvetica'));
		const diffs = ctx.lookupMaybe(
			encoding.get(PDFName.of('Differences')),
			PDFArray,
		);
		if (diffs) {
			let code = 0;
			for (let i = 0; i < diffs.size(); i++) {
				const item = ctx.lookup(diffs.get(i));
				if (item instanceof PDFNumber)
					code = item.asNumber();
				else if (item instanceof PDFName) {
					codeToName.set(
						code++,
						item.decodeText(),
					);
					hasDifferences = true;
				}
			}
		}
	}
	if (!symbolic && codeToName.size === 0) fill(encodingOf('Helvetica'));
	// uniXXXX and gXX names carry no unicode in the AFM tables
	for (const name of codeToName.values()) {
		if (nameToUnicode.has(name)) continue;
		const m = /^uni([0-9A-Fa-f]{4})/.exec(name);
		if (m) nameToUnicode.set(name, parseInt(m[1]!, 16));
	}
	return { codeToName, nameToUnicode, hasDifferences };
}

interface CMapResult {
	codeBytes: 1 | 2;
	map: Map<number, string>;
}

/** ToUnicode CMap (Adobe Technical Note #5014 syntax): bfchar and bfrange only */
function parseToUnicode(bytes: Uint8Array): CMapResult {
	const ops = tokenise(bytes);
	const map = new Map<number, string>();
	let codeBytes: 1 | 2 = 1;
	let sawCodespace = false;
	const codeOf = (b: Uint8Array) => {
		let v = 0;
		for (const x of b) v = v * 256 + x;
		return v;
	};
	const textOf = (b: Uint8Array) => {
		let s = '';
		for (let i = 0; i + 1 < b.length; i += 2)
			s += String.fromCharCode(b[i]! * 256 + b[i + 1]!);
		if (b.length === 1) s = String.fromCharCode(b[0]!);
		return s;
	};
	for (const op of ops) {
		const a = op.args;
		if (op.op === 'endcodespacerange') {
			for (let i = 0; i + 1 < a.length; i += 2) {
				const lo = a[i]!;
				if (lo.t === 'str' && !sawCodespace) {
					codeBytes = lo.v.length >= 2 ? 2 : 1;
					sawCodespace = true;
				}
			}
		} else if (op.op === 'endbfchar') {
			for (let i = 0; i + 1 < a.length; i += 2) {
				const src = a[i]!;
				const dst = a[i + 1]!;
				if (src.t === 'str' && dst.t === 'str')
					map.set(codeOf(src.v), textOf(dst.v));
				else if (src.t === 'str' && dst.t === 'name')
					map.set(codeOf(src.v), '');
			}
		} else if (op.op === 'endbfrange') {
			for (let i = 0; i + 2 < a.length; i += 3) {
				const lo = a[i]!;
				const hi = a[i + 1]!;
				const dst = a[i + 2]!;
				if (lo.t !== 'str' || hi.t !== 'str') continue;
				const from = codeOf(lo.v);
				const to = Math.min(codeOf(hi.v), from + 65535);
				if (dst.t === 'str') {
					const base = textOf(dst.v);
					const last = base.charCodeAt(
						base.length - 1,
					);
					for (let c = from; c <= to; c++)
						map.set(
							c,
							base.slice(0, -1) +
								String.fromCharCode(
									last +
										(c -
											from),
								),
						);
				} else if (dst.t === 'arr') {
					dst.v.forEach((d, k) => {
						if (d.t === 'str')
							map.set(
								from + k,
								textOf(d.v),
							);
					});
				}
			}
		}
	}
	return { codeBytes, map };
}

/** CIDFont /W array: c [w1 w2 ...] | cfirst clast w */
function parseW(w: PDFArray, ctx: PDFContext): Map<number, number> {
	const out = new Map<number, number>();
	const items: PDFObject[] = [];
	for (let i = 0; i < w.size(); i++) items.push(ctx.lookup(w.get(i))!);
	let i = 0;
	while (i < items.length) {
		const a = items[i];
		const b = items[i + 1];
		if (!(a instanceof PDFNumber)) break;
		if (b instanceof PDFArray) {
			for (let k = 0; k < b.size(); k++)
				out.set(
					a.asNumber() + k,
					numOf(ctx.lookup(b.get(k)), 1000),
				);
			i += 2;
		} else if (
			b instanceof PDFNumber &&
			items[i + 2] instanceof PDFNumber
		) {
			const last = Math.min(
				b.asNumber(),
				a.asNumber() + 65535,
			);
			const width = (items[i + 2] as PDFNumber).asNumber();
			for (let c = a.asNumber(); c <= last; c++)
				out.set(c, width);
			i += 3;
		} else break;
	}
	return out;
}

export function loadFont(dict: PDFDict, ctx: PDFContext): FontInfo {
	const subtype =
		ctx
			.lookupMaybe(dict.get(PDFName.of('Subtype')), PDFName)
			?.decodeText() ?? '';
	const baseFont =
		ctx
			.lookupMaybe(dict.get(PDFName.of('BaseFont')), PDFName)
			?.decodeText() ?? '';
	const toUnicodeStream = ctx.lookupMaybe(
		dict.get(PDFName.of('ToUnicode')),
		PDFStream,
	);
	let toUnicode: CMapResult | null = null;
	if (toUnicodeStream) {
		try {
			toUnicode = parseToUnicode(
				streamBytes(toUnicodeStream),
			);
		} catch {
			toUnicode = null;
		}
	}

	if (subtype === 'Type0')
		return loadType0(dict, ctx, baseFont, toUnicode);
	return loadSimple(dict, ctx, subtype, baseFont, toUnicode);
}

function descriptorMetrics(
	desc: PDFDict | undefined,
	ctx: PDFContext,
	scale = 1 / 1000,
) {
	const ascent = desc
		? numOf(ctx.lookup(desc.get(PDFName.of('Ascent'))), 0)
		: 0;
	const descent = desc
		? numOf(ctx.lookup(desc.get(PDFName.of('Descent'))), 0)
		: 0;
	const flags = desc
		? numOf(ctx.lookup(desc.get(PDFName.of('Flags'))), 0)
		: 0;
	const missing = desc
		? numOf(ctx.lookup(desc.get(PDFName.of('MissingWidth'))), 0)
		: 0;
	return {
		ascent: ascent ? ascent * scale : 0.9,
		descent: descent ? descent * scale : -0.22,
		symbolic: (flags & 4) !== 0 && (flags & 32) === 0,
		missing,
	};
}

function loadSimple(
	dict: PDFDict,
	ctx: PDFContext,
	subtype: string,
	baseFont: string,
	toUnicode: CMapResult | null,
): FontInfo {
	const desc = ctx.lookupMaybe(
		dict.get(PDFName.of('FontDescriptor')),
		PDFDict,
	);
	const fm = ctx.lookupMaybe(
		dict.get(PDFName.of('FontMatrix')),
		PDFArray,
	);
	const fontMatrix =
		subtype === 'Type3' && fm
			? Array.from({ length: 6 }, (_, i) =>
					numOf(ctx.lookup(fm.get(i)), 0),
				)
			: null;
	const m = descriptorMetrics(desc, ctx);
	const firstChar = numOf(
		ctx.lookup(dict.get(PDFName.of('FirstChar'))),
		0,
	);
	const widthsArr = ctx.lookupMaybe(
		dict.get(PDFName.of('Widths')),
		PDFArray,
	);
	const widths = new Map<number, number>();
	if (widthsArr) {
		for (let i = 0; i < widthsArr.size(); i++) {
			const w = ctx.lookup(widthsArr.get(i));
			if (w instanceof PDFNumber)
				widths.set(firstChar + i, w.asNumber());
		}
	}
	const { codeToName, nameToUnicode, hasDifferences } = buildEncoding(
		dict,
		ctx,
		m.symbolic,
		baseFont,
	);
	const afm = widths.size === 0 || !desc ? standardFont(baseFont) : null;
	// symbolic TrueType fonts map codes straight to glyphs, so the names are meaningless unless Differences said otherwise
	const namesUsable = !m.symbolic || hasDifferences || afm !== null;

	// Type3 widths are in glyph space; scale to 1/1000 text space through FontMatrix
	const type3Scale = fontMatrix ? fontMatrix[0]! * 1000 : 1;

	const widthOf = (code: number): number => {
		const w = widths.get(code);
		if (w !== undefined) return w * type3Scale;
		if (afm) {
			const name = codeToName.get(code);
			const aw = name ? afm.getWidthOfGlyph(name) : undefined;
			if (typeof aw === 'number') return aw;
		}
		return m.missing;
	};
	const textOf = (code: number): string => {
		const u = toUnicode?.map.get(code);
		if (u !== undefined) return u;
		if (namesUsable) {
			const name = codeToName.get(code);
			const cp = name ? nameToUnicode.get(name) : undefined;
			if (cp !== undefined) return String.fromCodePoint(cp);
		}
		if (!m.symbolic && code >= 32 && code < 127)
			return String.fromCharCode(code);
		return '';
	};

	let reverse: Map<string, number> | null = null;
	const encode = (ch: string): number | null => {
		if (!reverse) {
			reverse = new Map();
			const codes = new Set<number>([
				...widths.keys(),
				...codeToName.keys(),
				...(toUnicode?.map.keys() ?? []),
			]);
			for (const code of codes) {
				const t = textOf(code);
				if (t && !reverse.has(t)) reverse.set(t, code);
			}
		}
		const code = reverse.get(ch);
		if (code === undefined) return null;
		// a glyph without a width entry in an embedded subset is not there
		if (widths.size > 0 && !widths.has(code) && !afm) return null;
		return code;
	};

	return {
		subtype,
		baseFont,
		codeBytes: 1,
		ascent: m.ascent,
		descent: m.descent,
		fontMatrix,
		decode(bytes) {
			const out: Glyph[] = [];
			for (const code of bytes)
				out.push({
					code,
					text: textOf(code),
					width: widthOf(code),
					isSpace: code === 32,
				});
			return out;
		},
		encode,
	};
}

function loadType0(
	dict: PDFDict,
	ctx: PDFContext,
	baseFont: string,
	toUnicode: CMapResult | null,
): FontInfo {
	const descendants = ctx.lookupMaybe(
		dict.get(PDFName.of('DescendantFonts')),
		PDFArray,
	);
	const cid = descendants
		? ctx.lookupMaybe(descendants.get(0), PDFDict)
		: undefined;
	const desc = cid
		? ctx.lookupMaybe(
				cid.get(PDFName.of('FontDescriptor')),
				PDFDict,
			)
		: undefined;
	const m = descriptorMetrics(desc, ctx);
	const dw = cid
		? numOf(ctx.lookup(cid.get(PDFName.of('DW'))), 1000)
		: 1000;
	const wArr = cid
		? ctx.lookupMaybe(cid.get(PDFName.of('W')), PDFArray)
		: undefined;
	const widths = wArr ? parseW(wArr, ctx) : new Map<number, number>();
	const encoding = ctx.lookup(dict.get(PDFName.of('Encoding')));
	const encName =
		encoding instanceof PDFName ? encoding.decodeText() : '';
	// ponytail: only Identity CMaps are handled; a predefined or embedded CMap keeps the 2-byte assumption and CID = code
	const codeBytes: 1 | 2 = encName.startsWith('Identity')
		? 2
		: (toUnicode?.codeBytes ?? 2);

	let reverse: Map<string, number> | null = null;
	return {
		subtype: 'Type0',
		baseFont,
		codeBytes,
		ascent: m.ascent,
		descent: m.descent,
		fontMatrix: null,
		decode(bytes) {
			const out: Glyph[] = [];
			for (let i = 0; i < bytes.length; i += codeBytes) {
				const code =
					codeBytes === 2
						? (bytes[i]! << 8) |
							(bytes[i + 1] ?? 0)
						: bytes[i]!;
				out.push({
					code,
					text: toUnicode?.map.get(code) ?? '',
					width: widths.get(code) ?? dw,
					isSpace: codeBytes === 1 && code === 32,
				});
			}
			return out;
		},
		encode(ch) {
			if (!toUnicode) return null;
			if (!reverse) {
				reverse = new Map();
				for (const [code, t] of toUnicode.map)
					if (t && !reverse.has(t))
						reverse.set(t, code);
			}
			return reverse.get(ch) ?? null;
		},
	};
}

/** WinAnsi code for a character, for text written in the substitute font */
export function winAnsiCode(ch: string): number | null {
	const cp = ch.codePointAt(0);
	if (cp === undefined) return null;
	const enc = encodingOf('Helvetica');
	return enc.canEncodeUnicodeCodePoint(cp)
		? enc.encodeUnicodeCodePoint(cp).code
		: null;
}
