/** What the explorer shows of a font file, read from its sfnt tables. */
export interface FontFacts {
	family: string;
	style: string;
	fullName: string;
	postScriptName: string;
	unitsPerEm: number;
	/** In font units; descent positive. */
	ascent: number;
	descent: number;
	lineGap: number;
	capHeight?: number;
	xHeight?: number;
	italicAngle: number;
	box: { width: number; height: number };
	glyphCount: number;
	tables: string[];
	/** Code points the cmap maps to a glyph. */
	covers: (code: number) => boolean;
	/** The cmap's code point ranges, inclusive. */
	ranges: [number, number][];
}

interface Table {
	offset: number;
	length: number;
}

const tag = (view: DataView, at: number) =>
	String.fromCharCode(
		view.getUint8(at),
		view.getUint8(at + 1),
		view.getUint8(at + 2),
		view.getUint8(at + 3),
	);

/** WOFF 1 tables inflated into a plain sfnt; other files come back as they are. */
export async function unwrap(buffer: ArrayBuffer): Promise<ArrayBuffer> {
	const view = new DataView(buffer);
	if (buffer.byteLength < 12 || tag(view, 0) !== 'wOFF') return buffer;
	const count = view.getUint16(12);
	const entries = Array.from({ length: count }, (_, i) => {
		const at = 44 + i * 20;
		return {
			tag: tag(view, at),
			offset: view.getUint32(at + 4),
			compressed: view.getUint32(at + 8),
			length: view.getUint32(at + 12),
		};
	});
	const datas = await Promise.all(
		entries.map(async (entry) => {
			const bytes = new Uint8Array(
				buffer,
				entry.offset,
				entry.compressed,
			);
			if (entry.compressed >= entry.length) return bytes;
			const stream = new Blob([bytes])
				.stream()
				.pipeThrough(
					new DecompressionStream('deflate'),
				);
			return new Uint8Array(
				await new Response(stream).arrayBuffer(),
			);
		}),
	);
	const head = 12 + count * 16;
	const padded = (n: number) => (n + 3) & ~3;
	const size = datas.reduce((sum, d) => sum + padded(d.length), head);
	const out = new Uint8Array(size);
	const outView = new DataView(out.buffer);
	outView.setUint32(0, view.getUint32(4));
	outView.setUint16(4, count);
	let at = head;
	entries.forEach((entry, i) => {
		const data = datas[i]!;
		const record = 12 + i * 16;
		for (let c = 0; c < 4; c++)
			outView.setUint8(record + c, entry.tag.charCodeAt(c));
		outView.setUint32(record + 8, at);
		outView.setUint32(record + 12, data.length);
		out.set(data, at);
		at += padded(data.length);
	});
	return out.buffer;
}

function utf16(view: DataView, at: number, length: number) {
	let text = '';
	for (let i = 0; i + 1 < length; i += 2)
		text += String.fromCharCode(view.getUint16(at + i));
	return text;
}

function latin1(view: DataView, at: number, length: number) {
	let text = '';
	for (let i = 0; i < length; i++)
		text += String.fromCharCode(view.getUint8(at + i));
	return text;
}

function names(view: DataView, table: Table | undefined) {
	const found = new Map<number, string>();
	if (!table) return found;
	const count = view.getUint16(table.offset + 2);
	const strings = table.offset + view.getUint16(table.offset + 4);
	for (let i = 0; i < count; i++) {
		const at = table.offset + 6 + i * 12;
		const platform = view.getUint16(at);
		const encoding = view.getUint16(at + 2);
		const language = view.getUint16(at + 4);
		const id = view.getUint16(at + 6);
		const length = view.getUint16(at + 8);
		const start = strings + view.getUint16(at + 10);
		// Windows English first, then Unicode, then Mac Roman
		if (platform === 3 && (encoding === 1 || encoding === 10)) {
			if (language === 0x409 || !found.has(id))
				found.set(id, utf16(view, start, length));
		} else if (platform === 0 && !found.has(id))
			found.set(id, utf16(view, start, length));
		else if (platform === 1 && encoding === 0 && !found.has(id))
			found.set(id, latin1(view, start, length));
	}
	return found;
}

/** cmap formats 4 and 12, the Unicode subtables; no cmap covers nothing. */
function coverage(view: DataView, table: Table | undefined) {
	const ranges: [number, number][] = [];
	if (!table) return ranges;
	const count = view.getUint16(table.offset + 2);
	let best: { offset: number; format: number } | undefined;
	for (let i = 0; i < count; i++) {
		const at = table.offset + 4 + i * 8;
		const platform = view.getUint16(at);
		const encoding = view.getUint16(at + 2);
		const offset = table.offset + view.getUint32(at + 4);
		const format = view.getUint16(offset);
		const unicode =
			platform === 0 ||
			(platform === 3 && (encoding === 1 || encoding === 10));
		if (!unicode || (format !== 4 && format !== 12)) continue;
		if (!best || format > best.format) best = { offset, format };
	}
	if (!best) return ranges;
	const { offset } = best;
	if (best.format === 12) {
		const groups = view.getUint32(offset + 12);
		for (let i = 0; i < groups; i++) {
			const at = offset + 16 + i * 12;
			ranges.push([
				view.getUint32(at),
				view.getUint32(at + 4),
			]);
		}
		return ranges;
	}
	const segments = view.getUint16(offset + 6) / 2;
	const ends = offset + 14;
	const starts = ends + segments * 2 + 2;
	for (let i = 0; i < segments; i++) {
		const end = view.getUint16(ends + i * 2);
		const start = view.getUint16(starts + i * 2);
		if (start !== 0xffff) ranges.push([start, end]);
	}
	return ranges;
}

/** The facts of the first font in a TrueType, OpenType or collection file; undefined when it is none. */
export function readFont(buffer: ArrayBuffer): FontFacts | undefined {
	if (buffer.byteLength < 12) return undefined;
	const view = new DataView(buffer);
	let base = 0;
	if (tag(view, 0) === 'ttcf') base = view.getUint32(12);
	const version = view.getUint32(base);
	if (
		version !== 0x10000 &&
		tag(view, base) !== 'OTTO' &&
		tag(view, base) !== 'true'
	)
		return undefined;
	const count = view.getUint16(base + 4);
	const tables = new Map<string, Table>();
	for (let i = 0; i < count; i++) {
		const at = base + 12 + i * 16;
		tables.set(tag(view, at), {
			offset: view.getUint32(at + 8),
			length: view.getUint32(at + 12),
		});
	}
	const head = tables.get('head');
	const hhea = tables.get('hhea');
	if (!head || !hhea) return undefined;
	const named = names(view, tables.get('name'));
	const os2 = tables.get('OS/2');
	const os2Version = os2 ? view.getUint16(os2.offset) : 0;
	const post = tables.get('post');
	const maxp = tables.get('maxp');
	const ranges = coverage(view, tables.get('cmap'));
	const family = named.get(16) ?? named.get(1) ?? '';
	const style = named.get(17) ?? named.get(2) ?? 'Regular';
	return {
		family,
		style,
		fullName: named.get(4) ?? `${family} ${style}`.trim(),
		postScriptName: named.get(6) ?? '',
		unitsPerEm: view.getUint16(head.offset + 18),
		ascent: view.getInt16(hhea.offset + 4),
		descent: -view.getInt16(hhea.offset + 6),
		lineGap: view.getInt16(hhea.offset + 8),
		capHeight:
			os2 && os2Version >= 2
				? view.getInt16(os2.offset + 88)
				: undefined,
		xHeight:
			os2 && os2Version >= 2
				? view.getInt16(os2.offset + 86)
				: undefined,
		italicAngle: post ? view.getInt32(post.offset + 4) / 65536 : 0,
		box: {
			width:
				view.getInt16(head.offset + 40) -
				view.getInt16(head.offset + 36),
			height:
				view.getInt16(head.offset + 42) -
				view.getInt16(head.offset + 38),
		},
		glyphCount: maxp ? view.getUint16(maxp.offset + 4) : 0,
		tables: [...tables.keys()].sort(),
		covers: (code) =>
			ranges.some(
				([start, end]) => code >= start && code <= end,
			),
		ranges,
	};
}

/** iOS FontExplorerViewModel.tableDescriptions. */
export const tableDescriptions: Record<string, string> = {
	GDEF: 'Glyph definition — glyph classes, attachment points, ligature carets',
	GPOS: 'Glyph positioning — kerning, mark attachment, cursive connection',
	GSUB: 'Glyph substitution — ligatures, alternates, contextual forms',
	'OS/2': 'OS/2 and Windows metrics — weight, width, type, Unicode ranges',
	cmap: 'Character-to-glyph mapping — Unicode → glyph ID',
	glyf: 'Glyph outlines — TrueType quadratic Bezier contours',
	head: 'Font header — units per em, created/modified dates, flags',
	hhea: 'Horizontal header — ascender, descender, line gap, caret slope',
	hmtx: 'Horizontal metrics — advance widths and left side bearings',
	kern: 'Legacy kerning — pair-based kern values (replaced by GPOS)',
	loca: "Index to location — glyph offset table for 'glyf'",
	maxp: 'Maximum profile — glyph count, max points/contours/components',
	name: 'Naming table — family, style, copyright, license, designer',
	post: 'PostScript — glyph names, italic angle, underline metrics',
	'CFF ': 'Compact Font Format — PostScript cubic Bezier outlines',
	CFF2: 'CFF version 2 — variable font outline data',
	DSIG: 'Digital signature — font integrity verification',
	MATH: 'Maths typesetting — constants, glyph variants, accent positions',
	'SVG ': 'SVG glyph outlines — colour vector graphics per glyph',
	COLR: 'Colour glyph layers — multi-layer colour glyphs',
	CPAL: 'Colour palette — palettes for COLR glyphs',
	fvar: 'Font variations — axes (weight, width, slant, etc.)',
	gvar: 'Glyph variations — TrueType variation deltas',
	STAT: 'Style attributes — axis values and design-space labels',
};

const specimenLetters = 'Hxdp';

/** Hxdp, or the first four letters the font has. */
export function specimen(covers: (code: number) => boolean): string {
	if ([...specimenLetters].every((ch) => covers(ch.codePointAt(0)!)))
		return specimenLetters;
	let found = '';
	for (let code = 0x21; code <= 0x1ffff; code++) {
		const ch = String.fromCodePoint(code);
		if (!/\p{Alphabetic}/u.test(ch) || !covers(code)) continue;
		found += ch;
		if ([...found].length === 4) break;
	}
	return found || specimenLetters;
}

/** Latin through Extended-A, or the 128 code points from the specimen's row. */
export function chartRange(
	covers: (code: number) => boolean,
): [number, number] {
	const first = specimen(covers).codePointAt(0) ?? 0x41;
	if (first <= 0x17f) return [0x20, 0x17f];
	const start = Math.floor(first / 16) * 16;
	return [start, start + 0x7f];
}

export function signed(value: number): string {
	return value < 0 ? `−${-value}` : String(value);
}
