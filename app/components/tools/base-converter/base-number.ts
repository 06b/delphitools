/** The four bases, in the iOS order of BaseNumber.Radix. */
export interface Radix {
	name: string;
	radix: number;
	prefix: string;
	short: string;
	placeholder: string;
}

export const radixes: Radix[] = [
	{
		name: 'Decimal',
		radix: 10,
		prefix: '',
		short: 'DEC',
		placeholder: '255',
	},
	{
		name: 'Hexadecimal',
		radix: 16,
		prefix: '0x',
		short: 'HEX',
		placeholder: 'FF',
	},
	{
		name: 'Binary',
		radix: 2,
		prefix: '0b',
		short: 'BIN',
		placeholder: '11111111',
	},
	{
		name: 'Octal',
		radix: 8,
		prefix: '0o',
		short: 'OCT',
		placeholder: '377',
	},
];

const [, hex, binary, octal] = radixes as [Radix, Radix, Radix, Radix];

export const words = [8, 16, 32, 64];

export const maxValue = (1n << 64n) - 1n;

export type Reading =
	| { kind: 'empty' }
	| { kind: 'value'; value: bigint }
	| { kind: 'invalid'; character: string }
	| { kind: 'tooLarge' };

export interface Operation {
	title: string;
	takesOperand: boolean;
	takesShift: boolean;
}

export const operations: Operation[] = [
	'AND',
	'OR',
	'XOR',
	'NOT',
	'<<',
	'>>',
].map((title, index) => ({
	title,
	takesOperand: index <= 2,
	takesShift: index >= 4,
}));

export function valueOf(reading: Reading): bigint | undefined {
	return reading.kind === 'value' ? reading.value : undefined;
}

/** The base the text is read in: its prefix's, else `radix`; in hex, 0b is digits. */
export function baseOf(text: string, radix: Radix): Radix {
	const body = text.toLowerCase().replace(/\s/g, '');
	return (
		[hex, binary, octal].find(
			(r) =>
				body.startsWith(r.prefix) &&
				(radix !== hex || r === hex),
		) ?? radix
	);
}

/**
 * A number typed in `radix`. A 0x, 0b or 0o prefix picks its own base;
 * underscores, spaces and apostrophes between digits are separators.
 */
export function read(text: string, radix: Radix): Reading {
	let body = text.toLowerCase().replace(/[_'\s]/g, '');
	const detected = baseOf(body, radix);
	if (body.startsWith(detected.prefix))
		body = body.slice(detected.prefix.length);
	if (!body) return { kind: 'empty' };
	const foreign = [...body].find((c) =>
		Number.isNaN(Number.parseInt(c, detected.radix)),
	);
	if (foreign !== undefined)
		return { kind: 'invalid', character: foreign };
	const value = BigInt((detected.prefix || '') + body);
	return value > maxValue
		? { kind: 'tooLarge' }
		: { kind: 'value', value };
}

export function format(value: bigint, radix: Radix, prefixed = false) {
	return (
		(prefixed ? radix.prefix : '') +
		value.toString(radix.radix).toUpperCase()
	);
}

/** The highest digit of a base: 9, F, 1, 7. */
export function highestDigit(radix: Radix) {
	return (radix.radix - 1).toString(radix.radix).toUpperCase();
}

/** The smallest of 8, 16, 32 and 64 bits that holds the value. */
export function wordFitting(value: bigint) {
	const bits = value.toString(2).length;
	return words.find((w) => bits <= w) ?? 64;
}

/** The operation within a word of `word` bits; undefined while it waits for B. */
export function apply(
	operation: Operation,
	a: bigint,
	b: bigint | undefined,
	shift: number,
	word: number,
): bigint | undefined {
	const mask = (1n << BigInt(word)) - 1n;
	switch (operation.title) {
		case 'AND':
			return b === undefined ? undefined : a & b & mask;
		case 'OR':
			return b === undefined ? undefined : (a | b) & mask;
		case 'XOR':
			return b === undefined ? undefined : (a ^ b) & mask;
		case 'NOT':
			return ~a & mask;
		case '<<':
			return shift >= word ? 0n : (a << BigInt(shift)) & mask;
		default:
			return shift >= 64 ? 0n : a >> BigInt(shift);
	}
}

/** One number line per base, prefixed: the omnibox answer and the Values block. */
export function allBases(value: bigint) {
	return radixes.map((radix) => format(value, radix, true));
}

// BitRegister metrics, in px
export const metrics = {
	padding: 16,
	header: 44,
	bitGap: 3,
	nibbleGap: 9,
	hexRow: 15,
	indexRow: 12,
	lineGap: 8,
	operandGap: 18,
	ruleRoom: 14,
	signWidth: 44,
	largestCell: 40,
	comfortableCell: 22,
};

export interface Geometry {
	perLine: number;
	cell: number;
	width: number;
	height: number;
}

/**
 * Bits per line and lamp size that make the largest lamps. `numbered` has
 * one entry per operand, true for the one that carries the bit numbers.
 * The longest line whose lamps stay comfortable to tap wins.
 */
export function layout(
	word: number,
	numbered: boolean[],
	signs: boolean,
	width: number,
	height: number,
): Geometry {
	const m = metrics;
	const options = words
		.filter((perLine) => perLine <= word)
		.map((perLine) => {
			const lines = word / perLine;
			const nibbles = perLine / 4;
			const fixedWidth =
				(signs ? m.signWidth : 0) +
				(nibbles - 1) * m.nibbleGap +
				(perLine - nibbles) * m.bitGap;
			let fixedHeight = 0;
			numbered.forEach((numbers, index) => {
				fixedHeight +=
					lines *
						(m.hexRow +
							(numbers
								? m.indexRow
								: 0)) +
					(lines - 1) * m.lineGap;
				if (index > 0)
					fixedHeight +=
						index === numbered.length - 1 &&
						signs
							? m.ruleRoom * 2
							: m.operandGap;
			});
			const cell = Math.min(
				(width - fixedWidth) / perLine,
				(height - fixedHeight) /
					(lines * numbered.length),
				m.largestCell,
			);
			return {
				perLine,
				cell,
				width: fixedWidth + cell * perLine,
				height:
					fixedHeight +
					cell * lines * numbered.length,
			};
		});
	const comfortable = options.filter((o) => o.cell >= m.comfortableCell);
	return (
		comfortable.at(-1) ??
		options.reduce((best, o) => (o.cell > best.cell ? o : best))
	);
}

/** Height of the register band at `width`, laid out as in a band `limit` tall. */
export function idealHeight(
	word: number,
	operands: number,
	signs: boolean,
	width: number,
	limit: number,
) {
	const m = metrics;
	const numbered = Array.from({ length: operands }, (_, i) => i === 0);
	const geometry = layout(
		word,
		numbered,
		signs,
		width - m.padding * 2,
		limit - m.padding * 1.5 - m.header,
	);
	return m.padding * 1.5 + m.header + geometry.height;
}
