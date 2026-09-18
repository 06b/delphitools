import type { ContentEdit, Matrix } from '../doc-model';
import type { ContentItem, StreamOps, TextRun } from './interpret';
import { fmt, type Op } from './tokens';

/** resource name of the standard font written for runs whose own font lacks a glyph */
export const SUBSTITUTE_RES = 'ErrHelv';

/** user space delta → the delta in the space `ctm` maps from */
function localDelta(ctm: Matrix, dx: number, dy: number) {
	const [a, b, c, d] = ctm;
	const det = a * d - b * c || 1;
	return { x: (d * dx - c * dy) / det, y: (a * dy - b * dx) / det };
}

function mtx(m: Matrix): string {
	return m.map(fmt).join(' ');
}

/** ops that put the text position back where the run left it, without disturbing the line matrix */
function restoreAfter(run: TextRun): string {
	const { tm, tlm, size, hscale } = run;
	const along = Math.abs(tlm[0]) > Math.abs(tlm[1]) ? 0 : 1;
	const u =
		along === 0
			? (tm[4] - tlm[4]) / tlm[0]
			: (tm[5] - tlm[5]) / tlm[1];
	const k = size * hscale;
	// a run off its own line matrix (rise, odd producers) keeps only Tm; later T* on that line would drift
	if (!Number.isFinite(u) || !k) return `${mtx(tm)} Tm`;
	const post = u + run.advance * k;
	return `${mtx(tlm)} Tm [${fmt((-post * 1000) / k)}] TJ`;
}

/** the show operator with any newline it carried removed; Tm before it supplies the position */
function bareShow(op: Op): string | null {
	if (op.op === "'") return `${writeArg(op.args[0])} Tj`;
	if (op.op === '"')
		return `${fmt(numArg(op.args[0]))} Tw ${fmt(numArg(op.args[1]))} Tc ${writeArg(op.args[2])} Tj`;
	return null;
}

/** the same show operator with its string replaced; TJ kerning is dropped */
function replaceShow(op: Op, str: string): string {
	if (op.op === "'") return `${str} '`;
	if (op.op === '"')
		return `${fmt(numArg(op.args[0]))} ${fmt(numArg(op.args[1]))} ${str} "`;
	return `${str} Tj`;
}

function hexString(codes: number[], codeBytes: 1 | 2): string {
	let s = '<';
	for (const c of codes) s += c.toString(16).padStart(codeBytes * 2, '0');
	return s + '>';
}

function numArg(a: Op['args'][number] | undefined): number {
	return a?.t === 'num' ? a.v : 0;
}

function writeArg(a: Op['args'][number] | undefined): string {
	if (!a || a.t !== 'str') return '()';
	let s = '<';
	for (const b of a.v) s += b.toString(16).padStart(2, '0');
	return s + '>';
}

/** apply one edit to one stream; items are the interpreted items of that same stream */
export function rewriteStream(
	stream: StreamOps,
	items: ContentItem[],
	edit: ContentEdit,
): Uint8Array {
	const item = items.find(
		(it) => it.from === edit.from && it.to === edit.to,
	);
	if (!item) return stream.bytes;
	const before = new Map<number, string>();
	const after = new Map<number, string>();
	const replace = new Map<number, string>();

	if (item.kind === 'text') {
		const restore = restoreAfter(item);
		if (edit.kind === 'delete') {
			replace.set(item.from, restore);
		} else if (edit.kind === 'text') {
			// the position after the run is restored to where the old text ended, so later runs stay put
			const str = hexString(
				edit.codes,
				edit.font ? 1 : item.font.codeBytes,
			);
			if (edit.font) {
				before.set(
					item.from,
					`/${SUBSTITUTE_RES} ${fmt(item.size)} Tf`,
				);
				// a font set through an ExtGState has no resource name to restore
				after.set(
					item.to,
					(item.fontRes
						? `/${item.fontRes} ${fmt(item.size)} Tf `
						: '') + restore,
				);
			} else after.set(item.to, restore);
			replace.set(
				item.from,
				replaceShow(stream.ops[item.from]!, str),
			);
		} else {
			const v = localDelta(item.ctm, edit.dx, edit.dy);
			const moved: Matrix = [
				item.tm[0],
				item.tm[1],
				item.tm[2],
				item.tm[3],
				item.tm[4] + v.x,
				item.tm[5] + v.y,
			];
			before.set(item.from, `${mtx(moved)} Tm`);
			const bare = bareShow(stream.ops[item.from]!);
			if (bare) replace.set(item.from, bare);
			after.set(item.to, restore);
		}
	} else if (edit.kind === 'delete') {
		for (let i = item.from; i <= item.to; i++) replace.set(i, '');
	} else if (edit.kind === 'text') {
		return stream.bytes;
	} else {
		const v = localDelta(item.ctm, edit.dx, edit.dy);
		before.set(item.from, `q 1 0 0 1 ${fmt(v.x)} ${fmt(v.y)} cm`);
		after.set(item.to, 'Q');
	}
	return splice(stream, before, replace, after);
}

function splice(
	stream: StreamOps,
	before: Map<number, string>,
	replace: Map<number, string>,
	after: Map<number, string>,
): Uint8Array {
	const parts: Uint8Array[] = [];
	const text = (t: string) =>
		parts.push(Uint8Array.from(`\n${t}\n`, (c) => c.charCodeAt(0)));
	let at = 0;
	stream.ops.forEach((op, i) => {
		parts.push(stream.bytes.subarray(at, op.start));
		const b = before.get(i);
		if (b !== undefined) text(b);
		const r = replace.get(i);
		if (r === undefined)
			parts.push(stream.bytes.subarray(op.start, op.end));
		else if (r) text(r);
		const a = after.get(i);
		if (a !== undefined) text(a);
		at = op.end;
	});
	parts.push(stream.bytes.subarray(at));
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}
