import {
	PDFArray,
	PDFDict,
	PDFName,
	PDFNumber,
	PDFStream,
	type PDFContext,
	type PDFPage,
} from 'pdf-lib';
import { loadFont, streamBytes, type FontInfo, type Glyph } from './fonts';
import { num, tokenise, type Op } from './tokens';
import { applyMatrix, multiply, type Matrix } from '../doc-model';

/** user space (PDF, y up), min/max corners */
export interface Box {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

export type Rgb = [number, number, number];

interface ItemBase {
	/** op index range in `stream`'s op list, inclusive */
	from: number;
	to: number;
	bbox: Box;
	/** '' for the page stream, else the form XObject path 'Fm1/Fm2' */
	stream: string;
}

export interface TextRun extends ItemBase {
	kind: 'text';
	fontRes: string;
	font: FontInfo;
	size: number;
	/** text rendering matrix at the run start: text space → user space, size applied */
	trm: Matrix;
	/** CTM at the run start, for rewriting the run in its own frame */
	ctm: Matrix;
	/** text matrix and line matrix at the run start (after any newline the operator itself did) */
	tm: Matrix;
	tlm: Matrix;
	hscale: number;
	glyphs: Glyph[];
	text: string;
	/** advance of the run in unscaled text space (before trm) */
	advance: number;
	fill: Rgb | null;
	/** index of the enclosing BT op */
	bt: number;
	/** size on the page: Tf size through Tm and CTM */
	fontSize: number;
}

export interface ImageItem extends ItemBase {
	kind: 'image';
	name: string | null;
	ctm: Matrix;
}

export interface FormItem extends ItemBase {
	kind: 'form';
	name: string;
	ctm: Matrix;
}

export interface PathItem extends ItemBase {
	kind: 'path';
	ctm: Matrix;
	fill: Rgb | null;
	stroke: Rgb | null;
	painted: 'fill' | 'stroke' | 'both';
}

export type ContentItem = TextRun | ImageItem | FormItem | PathItem;

export interface StreamOps {
	ops: Op[];
	bytes: Uint8Array;
}

export interface FormStream extends StreamOps {
	/** the XObject resource dict holding this form, and its key there */
	parent: PDFDict;
	name: string;
	dict: PDFDict;
}

export interface PageContent extends StreamOps {
	items: ContentItem[];
	/** form XObject streams that were read, by path */
	forms: Map<string, FormStream>;
	fonts: Map<string, FontInfo>;
	warnings: string[];
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

interface TextState {
	tm: Matrix;
	tlm: Matrix;
	font: FontInfo | null;
	fontRes: string;
	size: number;
	charSpacing: number;
	wordSpacing: number;
	hscale: number;
	leading: number;
	rise: number;
}

interface GState {
	ctm: Matrix;
	fill: Rgb | null;
	stroke: Rgb | null;
	fillSpaceN: number;
	strokeSpaceN: number;
}

function grey(g: number): Rgb {
	return [g, g, g];
}

function cmyk(c: number, m: number, y: number, k: number): Rgb {
	return [
		1 - Math.min(1, c + k),
		1 - Math.min(1, m + k),
		1 - Math.min(1, y + k),
	];
}

function colourFrom(args: number[], components: number): Rgb | null {
	if (components === 1 && args.length >= 1) return grey(args[0]!);
	if (components === 3 && args.length >= 3)
		return [args[0]!, args[1]!, args[2]!];
	if (components === 4 && args.length >= 4)
		return cmyk(args[0]!, args[1]!, args[2]!, args[3]!);
	return null;
}

function emptyBox(): Box {
	return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
}

function extend(b: Box, x: number, y: number): void {
	if (x < b.x0) b.x0 = x;
	if (x > b.x1) b.x1 = x;
	if (y < b.y0) b.y0 = y;
	if (y > b.y1) b.y1 = y;
}

function boxOfUnitSquare(
	m: Matrix,
	unit: Box = { x0: 0, y0: 0, x1: 1, y1: 1 },
): Box {
	const b = emptyBox();
	for (const [x, y] of [
		[unit.x0, unit.y0],
		[unit.x1, unit.y0],
		[unit.x0, unit.y1],
		[unit.x1, unit.y1],
	] as const) {
		const p = applyMatrix(m, x, y);
		extend(b, p.x, p.y);
	}
	return b;
}

export function pageStreamBytes(page: PDFPage): Uint8Array {
	const contents = page.node.Contents();
	const ctx = page.doc.context;
	const parts: Uint8Array[] = [];
	if (contents instanceof PDFStream) parts.push(streamBytes(contents));
	else if (contents instanceof PDFArray) {
		for (let i = 0; i < contents.size(); i++) {
			const s = ctx.lookupMaybe(contents.get(i), PDFStream);
			if (s) parts.push(streamBytes(s));
		}
	}
	const total = parts.reduce((n, p) => n + p.length + 1, 0);
	const out = new Uint8Array(total);
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
		out[at++] = 0x0a;
	}
	return out;
}

export function pageResources(page: PDFPage): PDFDict | undefined {
	const ctx = page.doc.context;
	const res = page.node.getInheritableAttribute(PDFName.of('Resources'));
	return ctx.lookupMaybe(res, PDFDict);
}

function resourceDict(
	res: PDFDict | undefined,
	ctx: PDFContext,
	key: string,
): PDFDict | undefined {
	return res
		? ctx.lookupMaybe(res.get(PDFName.of(key)), PDFDict)
		: undefined;
}

/** `overrides` swaps in rewritten bytes for the page stream ('') or a form path */
export function readPageContent(
	page: PDFPage,
	overrides?: Map<string, Uint8Array>,
): PageContent {
	const bytes = overrides?.get('') ?? pageStreamBytes(page);
	const ops = tokenise(bytes);
	const ctx = page.doc.context;
	const res = pageResources(page);
	const out: PageContent = {
		ops,
		bytes,
		items: [],
		forms: new Map(),
		fonts: new Map(),
		warnings: [],
	};
	interpret(out, '', ops, ctx, res, IDENTITY, 0, overrides);
	return out;
}

const MAX_FORM_DEPTH = 8;

function interpret(
	out: PageContent,
	stream: string,
	ops: Op[],
	ctx: PDFContext,
	res: PDFDict | undefined,
	baseCtm: Matrix,
	depth: number,
	overrides?: Map<string, Uint8Array>,
): void {
	const { items, warnings } = out;
	const fonts = stream ? new Map<string, FontInfo>() : out.fonts;
	const fontDicts = resourceDict(res, ctx, 'Font');
	const xobjects = resourceDict(res, ctx, 'XObject');
	const extg = resourceDict(res, ctx, 'ExtGState');

	const fontFor = (name: string): FontInfo | null => {
		const cached = fonts.get(name);
		if (cached) return cached;
		const dict = fontDicts
			? ctx.lookupMaybe(
					fontDicts.get(PDFName.of(name)),
					PDFDict,
				)
			: undefined;
		if (!dict) {
			warnings.push(`font /${name} missing`);
			return null;
		}
		try {
			const f = loadFont(dict, ctx);
			fonts.set(name, f);
			return f;
		} catch (e) {
			warnings.push(`font /${name}: ${(e as Error).message}`);
			return null;
		}
	};

	let gs: GState = {
		ctm: baseCtm,
		fill: grey(0),
		stroke: grey(0),
		fillSpaceN: 1,
		strokeSpaceN: 1,
	};
	const stack: GState[] = [];
	const ts: TextState = {
		tm: IDENTITY,
		tlm: IDENTITY,
		font: null,
		fontRes: '',
		size: 0,
		charSpacing: 0,
		wordSpacing: 0,
		hscale: 1,
		leading: 0,
		rise: 0,
	};
	// font and spacing survive ET; only the matrices reset at BT
	let bt = -1;
	let pathStart = -1;
	let pathBox = emptyBox();
	let cur = { x: 0, y: 0 };
	let subpathStart = { x: 0, y: 0 };

	const nums = (op: Op) => op.args.map((a) => num(a));

	const setFont = (name: string, size: number) => {
		ts.font = fontFor(name);
		ts.fontRes = name;
		ts.size = size;
	};

	const addPoint = (x: number, y: number) => {
		const p = applyMatrix(gs.ctm, x, y);
		extend(pathBox, p.x, p.y);
		cur = { x, y };
	};

	const nextLine = (tx: number, ty: number) => {
		ts.tlm = multiply(ts.tlm, [1, 0, 0, 1, tx, ty]);
		ts.tm = ts.tlm;
	};

	const showText = (i: number, pieces: (Uint8Array | number)[]) => {
		if (!ts.font) {
			warnings.push(`text at op ${i} without a font`);
			return;
		}
		const font = ts.font;
		const trm = multiply(
			gs.ctm,
			multiply(ts.tm, [
				ts.size * ts.hscale,
				0,
				0,
				ts.size,
				0,
				ts.rise,
			]),
		);
		const glyphs: Glyph[] = [];
		let advance = 0;
		let text = '';
		for (const piece of pieces) {
			if (typeof piece === 'number') {
				advance -= (piece / 1000) * ts.size * ts.hscale;
				continue;
			}
			for (const g of font.decode(piece)) {
				glyphs.push(g);
				text += g.text;
				const w =
					(g.width / 1000) * ts.size +
					ts.charSpacing +
					(g.isSpace ? ts.wordSpacing : 0);
				advance += w * ts.hscale;
			}
		}
		// a bare adjustment array only moves the position
		if (glyphs.length === 0) {
			ts.tm = multiply(ts.tm, [1, 0, 0, 1, advance, 0]);
			return;
		}
		// ascent/descent in unscaled text space; the width axis is the advance before trm's own size
		const box = emptyBox();
		const unscaledAdvance =
			ts.size * ts.hscale
				? advance / (ts.size * ts.hscale)
				: 0;
		for (const [x, y] of [
			[0, font.descent],
			[unscaledAdvance, font.descent],
			[0, font.ascent],
			[unscaledAdvance, font.ascent],
		] as const) {
			const p = applyMatrix(trm, x, y);
			extend(box, p.x, p.y);
		}
		items.push({
			kind: 'text',
			stream,
			from: i,
			to: i,
			bbox: box,
			fontRes: ts.fontRes,
			font,
			size: ts.size,
			trm,
			ctm: gs.ctm,
			glyphs,
			text,
			advance: unscaledAdvance,
			fill: gs.fill,
			bt,
			tm: ts.tm,
			tlm: ts.tlm,
			hscale: ts.hscale,
			fontSize: Math.hypot(trm[2], trm[3]),
		});
		ts.tm = multiply(ts.tm, [1, 0, 0, 1, advance, 0]);
	};

	const paintPath = (i: number, painted: PathItem['painted'] | null) => {
		if (pathStart >= 0 && painted && pathBox.x0 !== Infinity) {
			items.push({
				kind: 'path',
				stream,
				from: pathStart,
				to: i,
				bbox: pathBox,
				ctm: gs.ctm,
				painted,
				fill: painted !== 'stroke' ? gs.fill : null,
				stroke: painted !== 'fill' ? gs.stroke : null,
			});
		}
		pathStart = -1;
		pathBox = emptyBox();
	};

	for (let i = 0; i < ops.length; i++) {
		const op = ops[i]!;
		const a = op.args;
		switch (op.op) {
			case 'q':
				stack.push({ ...gs });
				break;
			case 'Q':
				gs = stack.pop() ?? gs;
				break;
			case 'cm': {
				const [p, q, r, s, t, u] = nums(op);
				gs.ctm = multiply(gs.ctm, [
					p!,
					q!,
					r!,
					s!,
					t!,
					u!,
				]);
				break;
			}
			case 'gs': {
				const name = a[0]?.t === 'name' ? a[0].v : '';
				const g = extg
					? ctx.lookupMaybe(
							extg.get(
								PDFName.of(
									name,
								),
							),
							PDFDict,
						)
					: undefined;
				const f = g
					? ctx.lookupMaybe(
							g.get(
								PDFName.of(
									'Font',
								),
							),
							PDFArray,
						)
					: undefined;
				if (f) {
					const fd = ctx.lookupMaybe(
						f.get(0),
						PDFDict,
					);
					const size = ctx.lookupMaybe(
						f.get(1),
						PDFNumber,
					);
					if (fd && size) {
						ts.font = loadFont(fd, ctx);
						ts.fontRes = '';
						ts.size = size.asNumber();
					}
				}
				break;
			}
			// colour
			case 'g':
				gs.fill = grey(num(a[0]));
				gs.fillSpaceN = 1;
				break;
			case 'G':
				gs.stroke = grey(num(a[0]));
				gs.strokeSpaceN = 1;
				break;
			case 'rg':
				gs.fill = colourFrom(nums(op), 3);
				gs.fillSpaceN = 3;
				break;
			case 'RG':
				gs.stroke = colourFrom(nums(op), 3);
				gs.strokeSpaceN = 3;
				break;
			case 'k':
				gs.fill = colourFrom(nums(op), 4);
				gs.fillSpaceN = 4;
				break;
			case 'K':
				gs.stroke = colourFrom(nums(op), 4);
				gs.strokeSpaceN = 4;
				break;
			case 'cs':
				gs.fillSpaceN = spaceComponents(a[0], res, ctx);
				gs.fill = null;
				break;
			case 'CS':
				gs.strokeSpaceN = spaceComponents(
					a[0],
					res,
					ctx,
				);
				gs.stroke = null;
				break;
			case 'sc':
			case 'scn': {
				const c = colourFrom(nums(op), gs.fillSpaceN);
				if (c) gs.fill = c;
				break;
			}
			case 'SC':
			case 'SCN': {
				const c = colourFrom(nums(op), gs.strokeSpaceN);
				if (c) gs.stroke = c;
				break;
			}
			// text
			case 'BT':
				ts.tm = IDENTITY;
				ts.tlm = IDENTITY;
				bt = i;
				break;
			case 'ET':
				bt = -1;
				break;
			case 'Tf':
				setFont(
					a[0]?.t === 'name' ? a[0].v : '',
					num(a[1]),
				);
				break;
			case 'Td':
				nextLine(num(a[0]), num(a[1]));
				break;
			case 'TD':
				ts.leading = -num(a[1]);
				nextLine(num(a[0]), num(a[1]));
				break;
			case 'Tm': {
				const [p, q, r, s, t, u] = nums(op);
				ts.tlm = [p!, q!, r!, s!, t!, u!];
				ts.tm = ts.tlm;
				break;
			}
			case 'T*':
				nextLine(0, -ts.leading);
				break;
			case 'TL':
				ts.leading = num(a[0]);
				break;
			case 'Tc':
				ts.charSpacing = num(a[0]);
				break;
			case 'Tw':
				ts.wordSpacing = num(a[0]);
				break;
			case 'Tz':
				ts.hscale = num(a[0], 100) / 100;
				break;
			case 'Ts':
				ts.rise = num(a[0]);
				break;
			case 'Tj':
				if (a[0]?.t === 'str') showText(i, [a[0].v]);
				break;
			case "'":
				nextLine(0, -ts.leading);
				if (a[0]?.t === 'str') showText(i, [a[0].v]);
				break;
			case '"':
				ts.wordSpacing = num(a[0]);
				ts.charSpacing = num(a[1]);
				nextLine(0, -ts.leading);
				if (a[2]?.t === 'str') showText(i, [a[2].v]);
				break;
			case 'TJ':
				if (a[0]?.t === 'arr') {
					const pieces: (Uint8Array | number)[] =
						[];
					for (const e of a[0].v)
						if (
							e.t === 'str' ||
							e.t === 'num'
						)
							pieces.push(e.v);
					showText(i, pieces);
				}
				break;
			// paths
			case 'm':
				if (pathStart < 0) pathStart = i;
				addPoint(num(a[0]), num(a[1]));
				subpathStart = cur;
				break;
			case 'l':
				if (pathStart < 0) pathStart = i;
				addPoint(num(a[0]), num(a[1]));
				break;
			case 'c': {
				if (pathStart < 0) pathStart = i;
				const n = nums(op);
				addPoint(n[0]!, n[1]!);
				addPoint(n[2]!, n[3]!);
				addPoint(n[4]!, n[5]!);
				break;
			}
			case 'v': {
				if (pathStart < 0) pathStart = i;
				const n = nums(op);
				addPoint(n[0]!, n[1]!);
				addPoint(n[2]!, n[3]!);
				break;
			}
			case 'y': {
				if (pathStart < 0) pathStart = i;
				const n = nums(op);
				addPoint(n[0]!, n[1]!);
				addPoint(n[2]!, n[3]!);
				break;
			}
			case 'h':
				cur = subpathStart;
				break;
			case 're': {
				if (pathStart < 0) pathStart = i;
				const [x, y, w, h] = nums(op);
				addPoint(x!, y!);
				addPoint(x! + w!, y!);
				addPoint(x! + w!, y! + h!);
				addPoint(x!, y! + h!);
				cur = { x: x!, y: y! };
				subpathStart = cur;
				break;
			}
			case 'S':
			case 's':
				paintPath(i, 'stroke');
				break;
			case 'f':
			case 'F':
			case 'f*':
				paintPath(i, 'fill');
				break;
			case 'B':
			case 'B*':
			case 'b':
			case 'b*':
				paintPath(i, 'both');
				break;
			case 'n':
				paintPath(i, null);
				break;
			// xobjects
			case 'Do': {
				const name = a[0]?.t === 'name' ? a[0].v : '';
				const xo = xobjects
					? ctx.lookupMaybe(
							xobjects.get(
								PDFName.of(
									name,
								),
							),
							PDFStream,
						)
					: undefined;
				const sub = xo
					? ctx
							.lookupMaybe(
								xo.dict.get(
									PDFName.of(
										'Subtype',
									),
								),
								PDFName,
							)
							?.decodeText()
					: '';
				if (sub === 'Image') {
					items.push({
						kind: 'image',
						stream,
						from: i,
						to: i,
						name,
						ctm: gs.ctm,
						bbox: boxOfUnitSquare(gs.ctm),
					});
				} else if (sub === 'Form' && xo) {
					const mtx = ctx.lookupMaybe(
						xo.dict.get(
							PDFName.of('Matrix'),
						),
						PDFArray,
					);
					const bb = ctx.lookupMaybe(
						xo.dict.get(PDFName.of('BBox')),
						PDFArray,
					);
					const m: Matrix = mtx
						? (Array.from(
								{ length: 6 },
								(_, k) =>
									numOf(
										ctx.lookup(
											mtx.get(
												k,
											),
										),
									),
							) as Matrix)
						: IDENTITY;
					let unit: Box = {
						x0: 0,
						y0: 0,
						x1: 1,
						y1: 1,
					};
					if (bb) {
						const g = (k: number) =>
							numOf(
								ctx.lookup(
									bb.get(
										k,
									),
								),
							);
						unit = {
							x0: g(0),
							y0: g(1),
							x1: g(2),
							y1: g(3),
						};
					}
					const full = multiply(gs.ctm, m);
					items.push({
						kind: 'form',
						stream,
						from: i,
						to: i,
						name,
						ctm: full,
						bbox: boxOfUnitSquare(
							full,
							unit,
						),
					});
					const path = stream
						? `${stream}/${name}`
						: name;
					if (
						depth < MAX_FORM_DEPTH &&
						!out.forms.has(path)
					) {
						const fbytes =
							overrides?.get(path) ??
							streamBytes(xo);
						const fops = tokenise(fbytes);
						out.forms.set(path, {
							ops: fops,
							bytes: fbytes,
							parent: xobjects!,
							name,
							dict: xo.dict,
						});
						const fres =
							ctx.lookupMaybe(
								xo.dict.get(
									PDFName.of(
										'Resources',
									),
								),
								PDFDict,
							) ?? res;
						interpret(
							out,
							path,
							fops,
							ctx,
							fres,
							full,
							depth + 1,
							overrides,
						);
					}
				} else
					warnings.push(
						`xobject /${name} ${sub || 'missing'}`,
					);
				break;
			}
			case 'BI':
				items.push({
					kind: 'image',
					stream,
					from: i,
					to: i,
					name: null,
					ctm: gs.ctm,
					bbox: boxOfUnitSquare(gs.ctm),
				});
				break;
			default:
				break;
		}
	}
}

function numOf(o: unknown): number {
	return o instanceof PDFNumber ? o.asNumber() : 0;
}

function spaceComponents(
	name: import('./tokens').Operand | undefined,
	res: PDFDict | undefined,
	ctx: PDFContext,
): number {
	const n = name?.t === 'name' ? name.v : '';
	if (n === 'DeviceGray' || n === 'CalGray' || n === 'G') return 1;
	if (n === 'DeviceRGB' || n === 'CalRGB' || n === 'Lab' || n === 'RGB')
		return 3;
	if (n === 'DeviceCMYK' || n === 'CMYK') return 4;
	if (n === 'Pattern') return 0;
	const csd = resourceDict(res, ctx, 'ColorSpace');
	const cs = csd ? ctx.lookup(csd.get(PDFName.of(n))) : undefined;
	if (cs instanceof PDFArray && cs.size() > 0) {
		const family = ctx
			.lookupMaybe(cs.get(0), PDFName)
			?.decodeText();
		if (family === 'ICCBased') {
			const s = ctx.lookupMaybe(cs.get(1), PDFStream);
			return s
				? numOf(
						ctx.lookup(
							s.dict.get(
								PDFName.of('N'),
							),
						),
					) || 3
				: 3;
		}
		if (family === 'CalRGB' || family === 'Lab') return 3;
		if (family === 'CalGray') return 1;
		if (family === 'Indexed' || family === 'Separation') return 0;
		if (family === 'DeviceN') return 0;
	}
	if (cs instanceof PDFName)
		return spaceComponents(
			{ t: 'name', v: cs.decodeText() },
			undefined,
			ctx,
		);
	return 0;
}

/** consecutive runs on one baseline with the same font and size; Quartz emits one BT per glyph, so BT boundaries do not split a line */
export interface TextLine {
	runs: TextRun[];
	bbox: Box;
	text: string;
	/** a visible gap before run i, read as a space */
	gaps: boolean[];
}

export function groupLines(items: ContentItem[]): TextLine[] {
	const lines: TextLine[] = [];
	let line: TextLine | null = null;
	let last: TextRun | null = null;
	for (const it of items) {
		if (it.kind !== 'text') {
			line = null;
			last = null;
			continue;
		}
		const sameLine =
			last &&
			line &&
			last.font === it.font &&
			Math.abs(last.fontSize - it.fontSize) < 0.01 &&
			sameBaseline(last, it) &&
			gapBetween(last, it) < it.fontSize * 3;
		if (sameLine && line) {
			const gap = gapText(last!, it);
			line.runs.push(it);
			line.gaps.push(gap !== '');
			line.text += gap + it.text;
			extend(line.bbox, it.bbox.x0, it.bbox.y0);
			extend(line.bbox, it.bbox.x1, it.bbox.y1);
		} else {
			line = {
				runs: [it],
				bbox: { ...it.bbox },
				text: it.text,
				gaps: [false],
			};
			lines.push(line);
		}
		last = it;
	}
	return lines;
}

function sameBaseline(a: TextRun, b: TextRun): boolean {
	// same direction vector and the start of b sits on a's baseline line
	const dir = { x: a.trm[0], y: a.trm[1] };
	if (
		Math.abs(dir.x - b.trm[0]) > 1e-3 ||
		Math.abs(dir.y - b.trm[1]) > 1e-3
	)
		return false;
	const dx = b.trm[4] - a.trm[4];
	const dy = b.trm[5] - a.trm[5];
	const len = Math.hypot(dir.x, dir.y) || 1;
	const off = Math.abs(dx * dir.y - dy * dir.x) / len;
	return off < Math.max(0.5, a.fontSize * 0.15);
}

/** distance in user space from the end of a to the start of b */
function gapBetween(a: TextRun, b: TextRun): number {
	const end = applyMatrix(a.trm, a.advance, 0);
	return Math.hypot(b.trm[4] - end.x, b.trm[5] - end.y);
}

/** a visible gap between two runs on a baseline reads as a space */
function gapText(a: TextRun, b: TextRun): string {
	if (a.text.endsWith(' ') || b.text.startsWith(' ')) return '';
	return gapBetween(a, b) > a.fontSize * 0.25 ? ' ' : '';
}
