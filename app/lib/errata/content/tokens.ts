// PDF 32000-1:2008 §7.2 lexical rules and §8.9.7 inline images

export type Operand =
	| { t: 'num'; v: number }
	| { t: 'name'; v: string }
	| { t: 'str'; v: Uint8Array }
	| { t: 'bool'; v: boolean }
	| { t: 'null' }
	| { t: 'arr'; v: Operand[] }
	| { t: 'dict'; v: Map<string, Operand> };

export interface Op {
	op: string;
	args: Operand[];
	/** byte range in the stream, operands through operator (or EI) */
	start: number;
	end: number;
	/** inline image bytes between ID and EI */
	data?: Uint8Array;
}

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([
	0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25,
]);

function isRegular(b: number): boolean {
	return !WS.has(b) && !DELIM.has(b);
}

function hexVal(b: number): number {
	if (b >= 0x30 && b <= 0x39) return b - 0x30;
	if (b >= 0x41 && b <= 0x46) return b - 0x37;
	if (b >= 0x61 && b <= 0x66) return b - 0x57;
	return -1;
}

const ESCAPES = new Map<number, number>([
	[0x6e, 0x0a],
	[0x72, 0x0d],
	[0x74, 0x09],
	[0x62, 0x08],
	[0x66, 0x0c],
]);

type Token =
	| { kind: 'operand'; value: Operand; start: number; end: number }
	| { kind: 'operator'; value: string; start: number; end: number }
	| { kind: 'punct'; value: string; start: number; end: number };

class Lexer {
	pos = 0;
	constructor(readonly bytes: Uint8Array) {}

	skipWs(): void {
		const b = this.bytes;
		while (this.pos < b.length) {
			const c = b[this.pos]!;
			if (WS.has(c)) this.pos++;
			else if (c === 0x25) {
				while (
					this.pos < b.length &&
					b[this.pos] !== 0x0a &&
					b[this.pos] !== 0x0d
				)
					this.pos++;
			} else break;
		}
	}

	next(): Token | null {
		this.skipWs();
		const b = this.bytes;
		if (this.pos >= b.length) return null;
		const start = this.pos;
		const c = b[this.pos]!;
		if (c === 0x2f) return this.name(start);
		if (c === 0x28) return this.literalString(start);
		if (c === 0x3c) {
			if (b[this.pos + 1] === 0x3c) {
				this.pos += 2;
				return {
					kind: 'punct',
					value: '<<',
					start,
					end: this.pos,
				};
			}
			return this.hexString(start);
		}
		if (c === 0x3e && b[this.pos + 1] === 0x3e) {
			this.pos += 2;
			return {
				kind: 'punct',
				value: '>>',
				start,
				end: this.pos,
			};
		}
		if (c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d) {
			this.pos++;
			return {
				kind: 'punct',
				value: String.fromCharCode(c),
				start,
				end: this.pos,
			};
		}
		if (c === 0x29 || c === 0x3e) {
			// stray delimiter, skip it
			this.pos++;
			return this.next();
		}
		while (this.pos < b.length && isRegular(b[this.pos]!))
			this.pos++;
		const word = latin1(b.subarray(start, this.pos));
		if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word))
			return {
				kind: 'operand',
				value: { t: 'num', v: parseFloat(word) },
				start,
				end: this.pos,
			};
		if (word === 'true' || word === 'false')
			return {
				kind: 'operand',
				value: { t: 'bool', v: word === 'true' },
				start,
				end: this.pos,
			};
		if (word === 'null')
			return {
				kind: 'operand',
				value: { t: 'null' },
				start,
				end: this.pos,
			};
		if (word === '') {
			this.pos++;
			return this.next();
		}
		return { kind: 'operator', value: word, start, end: this.pos };
	}

	private name(start: number): Token {
		const b = this.bytes;
		this.pos++;
		let out = '';
		while (this.pos < b.length && isRegular(b[this.pos]!)) {
			const c = b[this.pos]!;
			if (c === 0x23 && this.pos + 2 < b.length) {
				const h = hexVal(b[this.pos + 1]!);
				const l = hexVal(b[this.pos + 2]!);
				if (h >= 0 && l >= 0) {
					out += String.fromCharCode(h * 16 + l);
					this.pos += 3;
					continue;
				}
			}
			out += String.fromCharCode(c);
			this.pos++;
		}
		return {
			kind: 'operand',
			value: { t: 'name', v: out },
			start,
			end: this.pos,
		};
	}

	private literalString(start: number): Token {
		const b = this.bytes;
		this.pos++;
		const out: number[] = [];
		let depth = 1;
		while (this.pos < b.length) {
			const c = b[this.pos++]!;
			if (c === 0x5c) {
				if (this.pos >= b.length) break;
				this.escape(out);
			} else if (c === 0x28) {
				depth++;
				out.push(c);
			} else if (c === 0x29) {
				depth--;
				if (depth === 0) break;
				out.push(c);
			} else out.push(c);
		}
		return {
			kind: 'operand',
			value: { t: 'str', v: Uint8Array.from(out) },
			start,
			end: this.pos,
		};
	}

	/** the byte after a backslash; §7.3.4.2 */
	private escape(out: number[]): void {
		const b = this.bytes;
		const e = b[this.pos++]!;
		const simple = ESCAPES.get(e);
		if (simple !== undefined) {
			out.push(simple);
			return;
		}
		if (e === 0x0d) {
			if (b[this.pos] === 0x0a) this.pos++;
			return;
		}
		if (e === 0x0a) return;
		if (e < 0x30 || e > 0x37) {
			out.push(e);
			return;
		}
		let v = e - 0x30;
		for (let i = 0; i < 2; i++) {
			const d = b[this.pos];
			if (d === undefined || d < 0x30 || d > 0x37) break;
			v = v * 8 + (d - 0x30);
			this.pos++;
		}
		out.push(v & 0xff);
	}

	private hexString(start: number): Token {
		const b = this.bytes;
		this.pos++;
		const out: number[] = [];
		let acc = -1;
		while (this.pos < b.length) {
			const c = b[this.pos++]!;
			if (c === 0x3e) break;
			const h = hexVal(c);
			if (h < 0) continue;
			if (acc < 0) acc = h;
			else {
				out.push(acc * 16 + h);
				acc = -1;
			}
		}
		if (acc >= 0) out.push(acc * 16);
		return {
			kind: 'operand',
			value: { t: 'str', v: Uint8Array.from(out) },
			start,
			end: this.pos,
		};
	}
}

function latin1(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return s;
}

/** find `EI` delimited by whitespace after `from` */
function findEI(b: Uint8Array, from: number): number {
	for (let i = from; i + 1 < b.length; i++) {
		if (
			b[i] === 0x45 &&
			b[i + 1] === 0x49 &&
			(i === 0 || WS.has(b[i - 1]!)) &&
			(i + 2 >= b.length ||
				WS.has(b[i + 2]!) ||
				DELIM.has(b[i + 2]!))
		)
			return i;
	}
	return b.length;
}

export function tokenise(bytes: Uint8Array): Op[] {
	const lx = new Lexer(bytes);
	const ops: Op[] = [];
	let args: Operand[] = [];
	let argStart = -1;

	const readCompound = (close: string): Operand[] => {
		const items: Operand[] = [];
		for (;;) {
			const t = lx.next();
			if (!t) return items;
			if (t.kind === 'operator' && t.value === close)
				return items;
			if (t.kind === 'punct') {
				if (t.value === close) return items;
				if (t.value === '[')
					items.push({
						t: 'arr',
						v: readCompound(']'),
					});
				else if (t.value === '<<')
					items.push(dictOf(readCompound('>>')));
				else if (t.value === ']' || t.value === '>>')
					return items;
				continue;
			}
			if (t.kind === 'operand') items.push(t.value);
			// operators inside arrays are malformed; drop them
		}
	};

	for (;;) {
		const t = lx.next();
		if (!t) break;
		if (argStart < 0) argStart = t.start;
		if (t.kind === 'operand') {
			args.push(t.value);
			continue;
		}
		if (t.kind === 'punct') {
			if (t.value === '[')
				args.push({ t: 'arr', v: readCompound(']') });
			else if (t.value === '<<')
				args.push(dictOf(readCompound('>>')));
			continue;
		}
		if (t.value === 'BI') {
			const body = readCompound('ID');
			// after ID exactly one whitespace byte, then data
			const dataStart = lx.pos + 1;
			const ei = findEI(bytes, dataStart);
			// exactly one whitespace byte precedes EI; binary data may end in 0x00 or 0x20
			let dataEnd = ei;
			if (dataEnd > dataStart && WS.has(bytes[dataEnd - 1]!))
				dataEnd--;
			lx.pos = Math.min(ei + 2, bytes.length);
			ops.push({
				op: 'BI',
				args: [dictOf(body)],
				data: bytes.slice(dataStart, dataEnd),
				start: argStart,
				end: lx.pos,
			});
			args = [];
			argStart = -1;
			continue;
		}
		ops.push({ op: t.value, args, start: argStart, end: t.end });
		args = [];
		argStart = -1;
	}
	return ops;
}

function dictOf(items: Operand[]): Operand {
	const v = new Map<string, Operand>();
	for (let i = 0; i + 1 < items.length; i += 2) {
		const k = items[i]!;
		if (k.t === 'name') v.set(k.v, items[i + 1]!);
	}
	return { t: 'dict', v };
}

export function num(o: Operand | undefined, fallback = 0): number {
	return o?.t === 'num' ? o.v : fallback;
}

export function fmt(n: number): string {
	if (Number.isInteger(n)) return String(n);
	return n.toFixed(4).replace(/\.?0+$/, '');
}

function writeString(bytes: Uint8Array): string {
	let s = '(';
	for (const b of bytes) {
		if (b === 0x28 || b === 0x29 || b === 0x5c)
			s += '\\' + String.fromCharCode(b);
		else if (b === 0x0d) s += '\\r';
		else if (b === 0x0a) s += '\\n';
		else if (b < 0x20 || b > 0x7e)
			s += '\\' + b.toString(8).padStart(3, '0');
		else s += String.fromCharCode(b);
	}
	return s + ')';
}

export function writeOperand(o: Operand): string {
	switch (o.t) {
		case 'num':
			return fmt(o.v);
		case 'name':
			return (
				'/' +
				o.v.replace(
					/[^!-~]|[#()<>[\]{}/%]/g,
					(c) =>
						'#' +
						c
							.charCodeAt(0)
							.toString(16)
							.padStart(2, '0'),
				)
			);
		case 'str':
			return writeString(o.v);
		case 'bool':
			return String(o.v);
		case 'null':
			return 'null';
		case 'arr':
			return '[' + o.v.map(writeOperand).join(' ') + ']';
		case 'dict':
			return (
				'<<' +
				[...o.v]
					.map(
						([k, v]) =>
							'/' +
							k +
							' ' +
							writeOperand(v),
					)
					.join(' ') +
				'>>'
			);
	}
}

/** serialise ops as latin1 text; inline image data is appended raw */
export function writeOps(ops: Op[]): Uint8Array {
	const parts: Uint8Array[] = [];
	let text = '';
	const flush = () => {
		if (!text) return;
		parts.push(
			Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff),
		);
		text = '';
	};
	for (const op of ops) {
		if (op.op === 'BI') {
			const d = op.args[0];
			const entries =
				d?.t === 'dict'
					? [...d.v]
							.map(
								([k, v]) =>
									'/' +
									k +
									' ' +
									writeOperand(
										v,
									),
							)
							.join(' ')
					: '';
			text += 'BI ' + entries + ' ID ';
			flush();
			parts.push(op.data ?? new Uint8Array());
			text += '\nEI\n';
			continue;
		}
		text += op.args.map(writeOperand).join(' ');
		text += (op.args.length ? ' ' : '') + op.op + '\n';
	}
	flush();
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}
