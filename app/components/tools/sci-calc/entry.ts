/** How a key press changes the expression text, and how the display sets it: SciCalcEntry, SciCalcSyntax and SciCalcDisplay on iOS. */

export type AngleMode = 'deg' | 'rad';

/** digit: a digit or point. factor: starts a value. other: operators and what continues a value. */
export type Kind = 'digit' | 'factor' | 'other';

export type Role =
	'digit' | 'operation' | 'function' | 'constant' | 'clear' | 'equals';

export const digits = [
	['(', ')', 'mod', '⌫', 'C'],
	['7', '8', '9', '÷', 'Ans'],
	['4', '5', '6', '×', 'EE'],
	['1', '2', '3', '−', '='],
	['0', '.', '±', '+', '='],
];
export const functionsNarrow = [
	['sin', 'cos', 'tan', 'π', 'e'],
	['asin', 'acos', 'atan', 'x²', 'xʸ'],
	['log', 'ln', '10ˣ', 'eˣ', '√'],
	['ʸ√x', ',', '!', '|x|', 'Const'],
];
export const functionsWide = [
	['sin', 'cos', 'tan', 'π'],
	['asin', 'acos', 'atan', 'e'],
	['x²', 'xʸ', '√', 'ʸ√x'],
	['log', 'ln', '10ˣ', 'eˣ'],
	['!', '|x|', ',', 'Const'],
];
export const keyIds = new Set([...digits, ...functionsNarrow].flat());
/** Key height over width the arrangement aims for. */
const keyAspect = 0.7;
export const minimumKeyHeight = 36;
/** Key height the type is set for; taller keys scale it up to half again. */
export const typeHeight = 58;

const factors = new Set([
	'(',
	'sin',
	'cos',
	'tan',
	'asin',
	'acos',
	'atan',
	'log',
	'ln',
	'π',
	'e',
	'√',
	'ʸ√x',
	'10ˣ',
	'eˣ',
	'Ans',
	'Const',
]);

const numeric = (character: string | undefined) =>
	character !== undefined && /^[0-9.]$/.test(character);
const letter = (character: string | undefined) =>
	character !== undefined && /^\p{L}$/u.test(character);

export function kind(key: string): Kind {
	if (numeric(key)) return 'digit';
	return factors.has(key) ? 'factor' : 'other';
}

/** The evaluator's text for a key. */
export function text(key: string): string {
	switch (key) {
		case 'x²':
			return '^2';
		case 'xʸ':
			return '^';
		case '√':
			return 'sqrt(';
		case 'ʸ√x':
			return 'root(';
		case '10ˣ':
			return '10^';
		case 'eˣ':
			return 'e^';
		case 'EE':
			return 'e';
		case '|x|':
			return '|';
		case 'mod':
			return '%';
		case '−':
			return '-';
		case 'sin':
		case 'cos':
		case 'tan':
		case 'asin':
		case 'acos':
		case 'atan':
		case 'log':
		case 'ln':
			return `${key}(`;
		default:
			return key;
	}
}

/** Appends `text`, with a times sign where two values would otherwise meet: 2π is 2×π. */
export function join(expression: string, text: string, of: Kind): string {
	const characters = [...expression];
	const last = characters.at(-1);
	if (last === undefined || of === 'other') return expression + text;
	const before = characters.at(-2);
	// e after a digit is EE
	const euler = last === 'e' && !numeric(before);
	const closes = last === ')' || last === 'π' || last === '!' || euler;
	const ends = closes || numeric(last);
	return (
		expression +
		((of === 'digit' ? closes : ends) ? '×' : '') +
		text
	);
}

/** Changes the sign of the number being typed: 3+4 becomes 3-4, 3×4 becomes 3×-4. Undefined when the expression does not end in a number. */
export function toggledSign(expression: string): string | undefined {
	const characters = [...expression];
	if (!numeric(characters.at(-1))) return undefined;
	let start = characters.length;
	while (start > 0 && numeric(characters[start - 1])) start -= 1;
	if (start === 0) return `-${expression}`;
	switch (characters[start - 1]) {
		case '-': {
			const lead = characters[start - 2];
			const exponent =
				lead === 'e' &&
				start >= 3 &&
				numeric(characters[start - 3]);
			if (
				lead === undefined ||
				exponent ||
				'+-×÷^(%,|'.includes(lead)
			)
				characters.splice(start - 1, 1);
			else characters[start - 1] = '+';
			break;
		}
		case '+':
			characters[start - 1] = '-';
			break;
		default:
			characters.splice(start, 0, '-');
	}
	return characters.join('');
}

export function openParens(expression: string): number {
	let open = 0;
	let close = 0;
	for (const character of expression) {
		if (character === '(') open += 1;
		else if (character === ')') close += 1;
	}
	return Math.max(0, open - close);
}

function trimmed(number: string) {
	return number.includes('.') ? number.replace(/\.?0+$/, '') : number;
}

/** C's `%.<precision>g`. */
export function printfG(value: number, precision: number): string {
	const [mantissa = '', exp = '0'] = value
		.toExponential(precision - 1)
		.split('e');
	const exponent = Number(exp);
	if (exponent < -4 || exponent >= precision) {
		const sign = exponent < 0 ? '-' : '+';
		const power = String(Math.abs(exponent)).padStart(2, '0');
		return `${trimmed(mantissa)}e${sign}${power}`;
	}
	return trimmed(value.toFixed(precision - 1 - exponent));
}

/** The view model's formatNumber: ten figures, an exponent past 1e15 or under 1e-10. */
export function formatNumber(value: number): string {
	if (value === 0) return '0';
	const size = Math.abs(value);
	return size >= 1e15 || size < 1e-10
		? printfG(value, 6)
		: printfG(value, 10);
}

/** Splits `%g` output at its exponent: 1.5e+15 is 1.5 and 15. Minus signs become the real minus. */
export function parts(text: string): { mantissa: string; exponent?: string } {
	const at = text.indexOf('e');
	const power = at < 0 ? '' : text.slice(at + 1);
	if (at < 0 || !/^[+-]?\d+$/.test(power))
		return { mantissa: text.replaceAll('-', '−') };
	return {
		mantissa: text.slice(0, at).replaceAll('-', '−'),
		exponent: String(Number(power)).replace('-', '−'),
	};
}

/** Characters followed by a thousands gap: 1234567.5 has gaps after 1 and 4. */
export function groupBreaks(mantissa: string): number[] {
	const characters = [...mantissa];
	const lead = characters[0] === '−' ? 1 : 0;
	let count = 0;
	while (/^[0-9]$/.test(characters[lead + count] ?? '')) count += 1;
	if (count < 5) return [];
	const breaks: number[] = [];
	for (let index = 0; index < count - 1; index += 1)
		if ((count - 1 - index) % 3 === 0) breaks.push(index + lead);
	return breaks;
}

const raisedDigits: Record<string, string> = {
	'0': '⁰',
	'1': '¹',
	'2': '²',
	'3': '³',
	'4': '⁴',
	'5': '⁵',
	'6': '⁶',
	'7': '⁷',
	'8': '⁸',
	'9': '⁹',
	'−': '⁻',
};

/** `%g` output with a real minus, and a power of ten written as ×10 with a raised exponent. */
export function written(text: string): string {
	const { mantissa, exponent } = parts(text);
	if (exponent === undefined) return mantissa;
	const raised = [...exponent].map((c) => raisedDigits[c] ?? c).join('');
	return `${mantissa} × 10${raised}`;
}

export type PieceKind = 'number' | 'function' | 'operation' | 'bracket';

export interface Piece {
	text: string;
	kind: PieceKind;
	raised?: boolean;
}

const shown: Record<string, string> = {
	'-': '−',
	'*': '×',
	'/': '÷',
	'%': ' mod ',
};

/** The expression as a calculator prints it: real minus and times signs, √ for sqrt, exponents raised. */
export function pieces(raw: string): Piece[] {
	const characters = [...raw];
	const isNumeric = (index: number) => numeric(characters[index]);
	const run = (start: number, test: (index: number) => boolean) => {
		let end = start;
		while (end < characters.length && test(end)) end += 1;
		return end;
	};
	const out: Piece[] = [];
	let index = 0;
	while (index < characters.length) {
		const character = characters[index]!;
		if (isNumeric(index)) {
			const end = run(index, isNumeric);
			out.push({
				text: characters.slice(index, end).join(''),
				kind: 'number',
			});
			index = end;
		} else if (letter(character)) {
			const end = run(index, (i) => letter(characters[i]));
			const word = characters.slice(index, end).join('');
			if (word === 'e' && isNumeric(index - 1))
				out.push({ text: 'E', kind: 'operation' });
			else if (word === 'e' || word === 'π')
				out.push({ text: word, kind: 'number' });
			else
				out.push({
					text:
						{ sqrt: '√', root: 'ʸ√' }[
							word
						] ?? word,
					kind: 'function',
				});
			index = end;
		} else if (
			character === '^' &&
			(isNumeric(index + 1) ||
				(characters[index + 1] === '-' &&
					isNumeric(index + 2)))
		) {
			const from =
				index + (characters[index + 1] === '-' ? 2 : 1);
			const end = run(from, isNumeric);
			out.push({
				text: characters
					.slice(index + 1, end)
					.join('')
					.replace('-', '−'),
				kind: 'number',
				raised: true,
			});
			index = end;
		} else {
			out.push({
				text: shown[character] ?? character,
				kind: '()|,'.includes(character)
					? 'bracket'
					: 'operation',
			});
			index += 1;
		}
	}
	return out;
}

/** Functions beside the digits, 9 by 5, when that shapes the keys nearer to the aim than 5 by 9 does. */
export function sideBySide(width: number, height: number): boolean {
	const miss = (columns: number, rows: number) =>
		Math.abs(
			Math.log(
				Math.max(height / rows, 1) /
					Math.max(width / columns, 1) /
					keyAspect,
			),
		);
	return miss(9, 5) < miss(5, 9);
}

export function role(key: string): Role {
	switch (key) {
		case '=':
			return 'equals';
		case 'C':
		case '⌫':
			return 'clear';
		case '÷':
		case '×':
		case '−':
		case '+':
			return 'operation';
		case 'Const':
		case 'Ans':
		case 'EE':
			return 'constant';
		case '±':
			return 'digit';
		default:
			return kind(key) === 'digit' ? 'digit' : 'function';
	}
}

const spokenNames: Record<string, string> = {
	'⌫': 'Delete',
	C: 'Clear',
	'x²': 'Square',
	xʸ: 'Power',
	'√': 'Square root',
	'ʸ√x': 'Root',
	'|x|': 'Absolute value',
	'±': 'Sign',
	'!': 'Factorial',
	EE: 'Exponent',
	Const: 'Constants',
};

export function spoken(key: string): string {
	return spokenNames[key] ?? key;
}

/** The key a typed character stands for. */
export function typed(character: string): string | undefined {
	switch (character) {
		case '*':
			return '×';
		case '/':
			return '÷';
		case '-':
			return '−';
		case '^':
			return 'xʸ';
		case '%':
			return 'mod';
		case '=':
		case 'Enter':
			return '=';
		case 'p':
			return 'π';
		case 'e':
			return 'e';
		case 'Backspace':
			return '⌫';
		case 'Escape':
			return 'C';
		default:
			return character.length === 1 &&
				'0123456789.()+!,'.includes(character)
				? character
				: undefined;
	}
}

export interface Placed {
	key: string;
	row: number;
	column: number;
	rows: number;
	columns: number;
}

/** Every key with its grid cell: functions over the digits, or beside them when wide. A repeated key spans. */
export function arrangement(wide: boolean): Placed[] {
	const blocks: [string[][], number, number][] = wide
		? [
				[functionsWide, 0, 0],
				[digits, 0, 4],
			]
		: [
				[functionsNarrow, 0, 0],
				[digits, 4, 0],
			];
	const placed: Placed[] = [];
	for (const [grid, top, left] of blocks)
		grid.forEach((keys, row) =>
			keys.forEach((key, column) => {
				if (grid[row - 1]?.[column] === key) return;
				if (keys[column - 1] === key) return;
				let rows = 1;
				while (grid[row + rows]?.[column] === key)
					rows += 1;
				let columns = 1;
				while (keys[column + columns] === key)
					columns += 1;
				placed.push({
					key,
					row: top + row,
					column: left + column,
					rows,
					columns,
				});
			}),
		);
	return placed;
}

type MathModule = typeof import('mathjs');

const degrees = (x: number) => (x * Math.PI) / 180;
const radians = (x: number) => (x * 180) / Math.PI;

/** Rounds the float residue of trig at whole angles: sin(180°) is 0, not 1.2e-16. The iOS cleanTrigResult. */
function cleanTrig(value: number): number {
	for (const exact of [0, 1, -1, 0.5, -0.5])
		if (Math.abs(value - exact) < 1e-12) return exact;
	return value;
}

/** An odd root of a negative number is real: ʸ√x of 3 and −8 is −2. */
function root(n: number, x: number): number {
	const odd = Number.isInteger(n) && Math.abs(n % 2) === 1;
	return x < 0 && odd ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n);
}

function trig(toRadians: (x: number) => number) {
	return {
		sin: (x: number) => cleanTrig(Math.sin(toRadians(x))),
		cos: (x: number) => cleanTrig(Math.cos(toRadians(x))),
		tan: (x: number) => {
			const cosine = Math.cos(toRadians(x));
			if (Math.abs(cosine) < 1e-12) return Infinity;
			return cleanTrig(Math.sin(toRadians(x)) / cosine);
		},
	};
}

function scope(mode: AngleMode): Record<string, (...x: number[]) => number> {
	const base = { log: Math.log10, ln: Math.log, root };
	if (mode === 'rad') return { ...base, ...trig((x) => x) };
	return {
		...base,
		...trig(degrees),
		asin: (x) => radians(Math.asin(x)),
		acos: (x) => radians(Math.acos(x)),
		atan: (x) => radians(Math.atan(x)),
	};
}

/** The keypad's text in mathjs syntax. */
export function prepare(expression: string): string {
	return (
		expression
			.replaceAll('×', '*')
			.replaceAll('÷', '/')
			.replaceAll('−', '-')
			.replaceAll('π', 'pi')
			// mathjs reads a % before an operator or the end as percent
			.replaceAll('%', ' mod ')
			.replace(/\|([^|]+)\|/g, 'abs($1)')
	);
}

/** A number, a mathjs value printed (a complex number, a unit), or undefined when the text is no value. */
export function calculate(
	math: MathModule,
	expression: string,
	mode: AngleMode,
): number | string | undefined {
	try {
		const value: unknown = math.evaluate(
			prepare(expression),
			scope(mode),
		);
		if (typeof value === 'number') return value;
		if (value === undefined || value === null) return undefined;
		return math.format(value, { precision: 10 });
	} catch {
		return undefined;
	}
}
