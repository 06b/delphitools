// ueb grade 1

const BLANK = 0x2800;

/** The cell with the given dots raised: 125 is ⠓. */
export function cell(dots: string): string {
	let mask = 0;
	for (const dot of dots) mask |= 1 << (Number(dot) - 1);
	return String.fromCharCode(BLANK + mask);
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '1234567890';
const CELLS = (
	'1 12 14 145 15 124 1245 125 24 245 13 123 134 1345 135 1234 12345 ' +
	'1235 234 2345 136 1236 2456 1346 13456 1356'
)
	.split(' ')
	.map(cell);
const LETTER_OF = new Map(CELLS.map((c, i) => [c, LETTERS[i]!]));

const PUNCTUATION: Record<string, string> = {
	',': '2',
	';': '23',
	':': '25',
	'.': '256',
	'!': '235',
	'?': '236',
	"'": '3',
	'-': '36',
	'(': '5 126',
	')': '5 345',
	'/': '456 34',
};
const PUNCT_CELLS = new Map(
	Object.entries(PUNCTUATION).map(([char, dots]) => [
		char,
		dots.split(' ').map(cell).join(''),
	]),
);
const PUNCT_OF = new Map([...PUNCT_CELLS].map(([char, c]) => [c, char]));

const CAPITAL = cell('6');
const NUMBER = cell('3456');
const GRADE1 = cell('56');
// ueb §7.6
const OPEN_QUOTE = cell('236');
const CLOSE_QUOTE = cell('356');

const atWordStart = (out: string) => !out || /\s$/.test(out);

export function toBraille(text: string): string {
	let out = '';
	let numeric = false;
	for (const [token] of text.matchAll(/[A-Za-z]+|[0-9]+|./gsu)) {
		if (/^[0-9]/.test(token)) {
			if (!numeric) out += NUMBER;
			numeric = true;
			for (const digit of token)
				out += CELLS[DIGITS.indexOf(digit)]!;
			continue;
		}
		if (/^[A-Za-z]/.test(token)) {
			// ueb §6.5.1
			if (numeric && /^[A-Ja-j]/.test(token)) out += GRADE1;
			numeric = false;
			const capsWord =
				token.length > 1 &&
				token === token.toUpperCase();
			if (capsWord) out += CAPITAL + CAPITAL;
			for (const char of token) {
				const lower = char.toLowerCase();
				if (!capsWord && char !== lower) out += CAPITAL;
				out += CELLS[LETTERS.indexOf(lower)]!;
			}
			continue;
		}
		// ueb §6.2
		numeric = numeric && (token === '.' || token === ',');
		if (token === '"')
			out += atWordStart(out) ? OPEN_QUOTE : CLOSE_QUOTE;
		else out += PUNCT_CELLS.get(token) ?? token;
	}
	return out;
}

/** One step of reading braille: the cells taken and the text they give. An indicator gives no text. */
export interface Reading {
	cells: string;
	text: string;
	kind: 'letter' | 'indicator' | 'other';
}

export function read(cells: string): Reading[] {
	const chars = [...cells];
	const readings: Reading[] = [];
	let out = '';
	let numeric = false;
	let capsWord = false;
	let capsNext = false;
	let i = 0;
	const emit = (count: number, text: string, kind: Reading['kind']) => {
		readings.push({
			cells: chars.slice(i, i + count).join(''),
			text,
			kind,
		});
		out += text;
		i += count;
	};
	while (i < chars.length) {
		const c = chars[i]!;
		if (c === CAPITAL) {
			if (chars[i + 1] === CAPITAL) {
				capsWord = true;
				emit(2, '', 'indicator');
			} else {
				capsNext = true;
				emit(1, '', 'indicator');
			}
			continue;
		}
		if (c === NUMBER) {
			numeric = true;
			emit(1, '', 'indicator');
			continue;
		}
		if (c === GRADE1) {
			numeric = false;
			emit(1, '', 'indicator');
			continue;
		}
		const letter = LETTER_OF.get(c);
		if (letter) {
			const index = LETTERS.indexOf(letter);
			if (numeric && index < 10) {
				emit(1, DIGITS[index]!, 'letter');
				continue;
			}
			numeric = false;
			const text =
				capsNext || capsWord
					? letter.toUpperCase()
					: letter;
			capsNext = false;
			emit(1, text, 'letter');
			continue;
		}
		capsWord = false;
		const pair = PUNCT_OF.get(c + (chars[i + 1] ?? ''));
		if (pair) {
			numeric = false;
			// the last cell is a one-cell key
			emit(Math.min(2, chars.length - i), pair, 'letter');
			continue;
		}
		if (c === OPEN_QUOTE) {
			numeric = false;
			emit(1, atWordStart(out) ? '"' : '?', 'letter');
			continue;
		}
		if (c === CLOSE_QUOTE) {
			numeric = false;
			emit(1, '"', 'letter');
			continue;
		}
		const punct = PUNCT_OF.get(c);
		const text = punct ?? c;
		numeric = numeric && (text === '.' || text === ',');
		emit(1, text, punct === undefined ? 'other' : 'letter');
	}
	return readings;
}

export const fromBraille = (cells: string) =>
	read(cells)
		.map((reading) => reading.text)
		.join('');

export const looksLikeBraille = (text: string) => /[\u2800-\u28ff]/.test(text);

export function dots(pattern: string): string {
	const mask = (pattern.codePointAt(0) ?? 0) - BLANK;
	if (mask <= 0 || mask > 0xff) return '';
	return [1, 2, 3, 4, 5, 6, 7, 8]
		.filter((dot) => mask & (1 << (dot - 1)))
		.join('-');
}
