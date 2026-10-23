/** CipherEngine: the ciphers, codes and encodings, and auto-detect. */

export const SAMPLES: { label: string; text: string }[] = [
	{
		label: 'Caesar',
		text: 'AOL XBPJR IYVDU MVE QBTWZ VCLY AOL SHGF KVN',
	},
	{
		label: 'ROT13',
		text: 'Abj vf gur jvagre bs bhe qvfpbagrag znqr tybevbhf fhzzre',
	},
	{
		label: 'Vigenère',
		text: 'Vsxt tmq wpt aplrrh ha wlpn hzh eys han asn vbkich kzhex ioqqkd ioiw rpklz zict hvg edz dpb rzi',
	},
	{ label: 'Morse', text: '.... . .-.. .-.. --- / .-- --- .-. .-.. -..' },
	{
		label: 'Hex',
		text: '50 72 69 76 61 63 79 20 69 73 20 70 6f 77 65 72 2e',
	},
	{ label: 'Base64', text: 'VGhlIGNyb3cgZmxpZXMgYXQgbWlkbmlnaHQu' },
];

const ENGLISH_FREQ: Record<string, number> = {
	A: 8.167,
	B: 1.492,
	C: 2.782,
	D: 4.253,
	E: 12.702,
	F: 2.228,
	G: 2.015,
	H: 6.094,
	I: 6.966,
	J: 0.153,
	K: 0.772,
	L: 4.025,
	M: 2.406,
	N: 6.749,
	O: 7.507,
	P: 1.929,
	Q: 0.095,
	R: 5.987,
	S: 6.327,
	T: 9.056,
	U: 2.758,
	V: 0.978,
	W: 2.36,
	X: 0.15,
	Y: 1.974,
	Z: 0.074,
};

const COMMON_WORDS = new Set([
	'THE',
	'BE',
	'TO',
	'OF',
	'AND',
	'A',
	'IN',
	'THAT',
	'HAVE',
	'I',
	'IT',
	'FOR',
	'NOT',
	'ON',
	'WITH',
	'HE',
	'AS',
	'YOU',
	'DO',
	'AT',
	'THIS',
	'BUT',
	'HIS',
	'BY',
	'FROM',
	'THEY',
	'WE',
	'SAY',
	'HER',
	'SHE',
	'OR',
	'AN',
	'WILL',
	'MY',
	'ONE',
	'ALL',
	'WOULD',
	'THERE',
	'THEIR',
	'WHAT',
	'SO',
	'UP',
	'OUT',
	'IF',
	'ABOUT',
	'WHO',
	'GET',
	'WHICH',
	'GO',
	'ME',
	'WHEN',
	'MAKE',
	'CAN',
	'LIKE',
	'TIME',
	'NO',
	'JUST',
	'HIM',
	'KNOW',
	'TAKE',
	'PEOPLE',
	'INTO',
	'YEAR',
	'YOUR',
	'GOOD',
	'SOME',
	'COULD',
	'THEM',
	'SEE',
	'OTHER',
	'THAN',
	'THEN',
	'NOW',
	'LOOK',
	'ONLY',
	'COME',
	'ITS',
	'OVER',
	'THINK',
	'ALSO',
	'BACK',
	'AFTER',
	'USE',
	'TWO',
	'HOW',
	'OUR',
	'WORK',
	'FIRST',
	'WELL',
	'WAY',
	'EVEN',
	'NEW',
	'WANT',
	'BECAUSE',
	'ANY',
	'THESE',
	'GIVE',
	'DAY',
	'MOST',
	'US',
	'IS',
	'WAS',
	'ARE',
	'BEEN',
	'HAS',
	'HAD',
	'WERE',
	'SAID',
]);

export function chiSquaredScore(text: string): number {
	const counts: Record<string, number> = {};
	let total = 0;
	for (const ch of text.toUpperCase()) {
		if (ch >= 'A' && ch <= 'Z') {
			counts[ch] = (counts[ch] ?? 0) + 1;
			total++;
		}
	}
	if (total === 0) return Infinity;
	let chi = 0;
	for (const letter of Object.keys(ENGLISH_FREQ)) {
		const observed = counts[letter] ?? 0;
		const expected = ((ENGLISH_FREQ[letter] ?? 0) / 100) * total;
		chi += (observed - expected) ** 2 / expected;
	}
	return chi;
}

export function commonWordRatio(text: string): number {
	const words = text.toUpperCase().match(/[A-Z]+/g);
	if (!words || words.length === 0) return 0;
	let hits = 0;
	for (const word of words) {
		if (COMMON_WORDS.has(word)) hits++;
	}
	return hits / words.length;
}

export function englishLikeness(text: string): number {
	const letters = text.replace(/[^A-Za-z]/g, '');
	if (letters.length < 3) return 0;
	const chi = chiSquaredScore(text);
	// normalize chi score
	const chiScore = Math.max(0, 1 - chi / 100);
	const wordScore = Math.min(1, commonWordRatio(text) * 3);
	return chiScore * 0.6 + wordScore * 0.4;
}

export function caesarShift(text: string, shift: number): string {
	const s = ((shift % 26) + 26) % 26;
	let out = '';
	for (const ch of text) {
		const code = ch.charCodeAt(0);
		if (code >= 65 && code <= 90) {
			out += String.fromCharCode(((code - 65 + s) % 26) + 65);
		} else if (code >= 97 && code <= 122) {
			out += String.fromCharCode(((code - 97 + s) % 26) + 97);
		} else {
			out += ch;
		}
	}
	return out;
}

export function rot47(text: string): string {
	let out = '';
	for (const ch of text) {
		const code = ch.charCodeAt(0);
		if (code >= 33 && code <= 126) {
			out += String.fromCharCode(
				33 + ((code - 33 + 47) % 94),
			);
		} else {
			out += ch;
		}
	}
	return out;
}

export function atbash(text: string): string {
	let out = '';
	for (const ch of text) {
		const code = ch.charCodeAt(0);
		if (code >= 65 && code <= 90) {
			out += String.fromCharCode(90 - (code - 65));
		} else if (code >= 97 && code <= 122) {
			out += String.fromCharCode(122 - (code - 97));
		} else {
			out += ch;
		}
	}
	return out;
}

export function vigenere(text: string, key: string, encode: boolean): string {
	const cleanKey = key.toUpperCase().replace(/[^A-Z]/g, '');
	if (cleanKey.length === 0) return text;
	let out = '';
	let ki = 0;
	for (const ch of text) {
		const code = ch.charCodeAt(0);
		const isUpper = code >= 65 && code <= 90;
		const isLower = code >= 97 && code <= 122;
		if (isUpper || isLower) {
			const base = isUpper ? 65 : 97;
			const shift =
				cleanKey.charCodeAt(ki % cleanKey.length) - 65;
			const adj = encode ? shift : -shift;
			out += String.fromCharCode(
				((code - base + adj + 26) % 26) + base,
			);
			ki++;
		} else {
			out += ch;
		}
	}
	return out;
}

export function modInverse(a: number, m: number): number | null {
	const base = ((a % m) + m) % m;
	for (let x = 1; x < m; x++) {
		if ((base * x) % m === 1) return x;
	}
	return null;
}

const AFFINE_COPRIME_ERROR =
	"'a' must be coprime with 26 (try 1,3,5,7,9,11,15,17,19,21,23,25).";

export function affine(
	text: string,
	a: number,
	b: number,
	encode: boolean,
): string {
	const inv = encode ? null : modInverse(a, 26);
	if (!encode && inv === null) throw new Error(AFFINE_COPRIME_ERROR);
	let out = '';
	for (const ch of text) {
		const code = ch.charCodeAt(0);
		const isUpper = code >= 65 && code <= 90;
		const isLower = code >= 97 && code <= 122;
		if (isUpper || isLower) {
			const base = isUpper ? 65 : 97;
			const x = code - base;
			const y = encode
				? (a * x + b) % 26
				: ((inv as number) * (x - b + 26)) % 26;
			out += String.fromCharCode(y + base);
		} else {
			out += ch;
		}
	}
	return out;
}

export const MORSE: Record<string, string> = {
	A: '.-',
	B: '-...',
	C: '-.-.',
	D: '-..',
	E: '.',
	F: '..-.',
	G: '--.',
	H: '....',
	I: '..',
	J: '.---',
	K: '-.-',
	L: '.-..',
	M: '--',
	N: '-.',
	O: '---',
	P: '.--.',
	Q: '--.-',
	R: '.-.',
	S: '...',
	T: '-',
	U: '..-',
	V: '...-',
	W: '.--',
	X: '-..-',
	Y: '-.--',
	Z: '--..',
	'0': '-----',
	'1': '.----',
	'2': '..---',
	'3': '...--',
	'4': '....-',
	'5': '.....',
	'6': '-....',
	'7': '--...',
	'8': '---..',
	'9': '----.',
	'.': '.-.-.-',
	',': '--..--',
	'?': '..--..',
	"'": '.----.',
	'!': '-.-.--',
	'/': '-..-.',
	'(': '-.--.',
	')': '-.--.-',
	'&': '.-...',
	':': '---...',
	';': '-.-.-.',
	'=': '-...-',
	'+': '.-.-.',
	'-': '-....-',
	_: '..--.-',
	'"': '.-..-.',
	$: '...-..-',
	'@': '.--.-.',
};

export const MORSE_REVERSE: Record<string, string> = Object.fromEntries(
	Object.entries(MORSE).map(([k, v]) => [v, k]),
);

export function morseEncode(text: string): string {
	return text
		.toUpperCase()
		.split(/(\s+)/)
		.map((chunk) => {
			if (/^\s+$/.test(chunk)) return '/';
			return chunk
				.split('')
				.map((c) => MORSE[c] ?? '')
				.filter(Boolean)
				.join(' ');
		})
		.join(' ');
}

export function morseDecode(text: string): string {
	return text
		.trim()
		.split(/\s*\/\s*|\s{2,}/)
		.map((word) =>
			word
				.trim()
				.split(/\s+/)
				.map((symbol) => MORSE_REVERSE[symbol] ?? '')
				.join(''),
		)
		.join(' ');
}

export function a1z26Encode(text: string): string {
	return text
		.toUpperCase()
		.split(/(\s+)/)
		.map((chunk) => {
			if (/^\s+$/.test(chunk)) return ' / ';
			return chunk
				.split('')
				.filter((c) => c >= 'A' && c <= 'Z')
				.map((c) => c.charCodeAt(0) - 64)
				.join('-');
		})
		.join('');
}

export function a1z26Decode(text: string): string {
	return text
		.split(/\s*\/\s*|\s{2,}/)
		.map((word) =>
			word
				.split(/[-\s,]+/)
				.filter(Boolean)
				.map((n) => {
					const value = parseInt(n, 10);
					if (
						!Number.isFinite(value) ||
						value < 1 ||
						value > 26
					) {
						return '';
					}
					return String.fromCharCode(64 + value);
				})
				.join(''),
		)
		.join(' ');
}

export const BACON: Record<string, string> = {
	A: 'AAAAA',
	B: 'AAAAB',
	C: 'AAABA',
	D: 'AAABB',
	E: 'AABAA',
	F: 'AABAB',
	G: 'AABBA',
	H: 'AABBB',
	I: 'ABAAA',
	J: 'ABAAB',
	K: 'ABABA',
	L: 'ABABB',
	M: 'ABBAA',
	N: 'ABBAB',
	O: 'ABBBA',
	P: 'ABBBB',
	Q: 'BAAAA',
	R: 'BAAAB',
	S: 'BAABA',
	T: 'BAABB',
	U: 'BABAA',
	V: 'BABAB',
	W: 'BABBA',
	X: 'BABBB',
	Y: 'BBAAA',
	Z: 'BBAAB',
};

export const BACON_REVERSE: Record<string, string> = Object.fromEntries(
	Object.entries(BACON).map(([k, v]) => [v, k]),
);

export function baconEncode(text: string): string {
	return text
		.toUpperCase()
		.split(/(\s+)/)
		.map((chunk) => {
			if (/^\s+$/.test(chunk)) return ' ';
			return chunk
				.split('')
				.filter((c) => c >= 'A' && c <= 'Z')
				.map((c) => BACON[c] ?? '')
				.join(' ');
		})
		.join('');
}

export function baconDecode(text: string): string {
	const cleaned = text.toUpperCase().replace(/[^AB]/g, '');
	let out = '';
	for (let i = 0; i + 5 <= cleaned.length; i += 5) {
		out += BACON_REVERSE[cleaned.slice(i, i + 5)] ?? '?';
	}
	return out;
}

export function railFenceEncode(text: string, rails: number): string {
	if (rails < 2) return text;
	const fence: string[][] = Array.from({ length: rails }, () => []);
	let r = 0;
	let dir = 1;
	for (const ch of text) {
		fence[r]!.push(ch);
		if (r === 0) dir = 1;
		else if (r === rails - 1) dir = -1;
		r += dir;
	}
	return fence.map((row) => row.join('')).join('');
}

export function railFenceDecode(text: string, rails: number): string {
	if (rails < 2) return text;
	const len = text.length;
	// rebuild rail pattern
	const pattern: number[] = [];
	let r = 0;
	let dir = 1;
	for (let i = 0; i < len; i++) {
		pattern.push(r);
		if (r === 0) dir = 1;
		else if (r === rails - 1) dir = -1;
		r += dir;
	}
	const rowCounts = Array.from(
		{ length: rails },
		(_, k) => pattern.filter((p) => p === k).length,
	);
	const rowChars: string[][] = [];
	let idx = 0;
	for (let k = 0; k < rails; k++) {
		const count = rowCounts[k] ?? 0;
		rowChars.push(text.slice(idx, idx + count).split(''));
		idx += count;
	}
	const cursors: number[] = new Array<number>(rails).fill(0);
	let out = '';
	for (let i = 0; i < len; i++) {
		const row = pattern[i] ?? 0;
		out += rowChars[row]?.[cursors[row]!++] ?? '';
	}
	return out;
}

function utf8ToBytes(s: string): Uint8Array {
	return new TextEncoder().encode(s);
}

function bytesToUtf8(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes);
}

const BASE64_ERROR = 'Invalid Base64.';

export function base64Decode(s: string): string {
	let bin: string;
	try {
		bin = atob(s.replace(/\s+/g, ''));
	} catch {
		throw new Error(BASE64_ERROR);
	}
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytesToUtf8(bytes);
}

export function base64Encode(s: string): string {
	const bytes = utf8ToBytes(s);
	let bin = '';
	for (const byte of bytes) bin += String.fromCharCode(byte);
	return btoa(bin);
}

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const BASE32_ERROR = 'Invalid Base32 character.';
const HEX_LENGTH_ERROR = 'Hex must have even length.';
const HEX_CHARACTER_ERROR = 'Invalid hex character.';
const BINARY_ERROR = 'Binary must be a multiple of 8 bits.';

export function base32Decode(s: string): string {
	const cleaned = s.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
	let bits = '';
	for (const ch of cleaned) {
		const idx = B32_ALPHABET.indexOf(ch);
		if (idx < 0) throw new Error(BASE32_ERROR);
		bits += idx.toString(2).padStart(5, '0');
	}
	const bytes: number[] = [];
	for (let i = 0; i + 8 <= bits.length; i += 8) {
		bytes.push(parseInt(bits.slice(i, i + 8), 2));
	}
	return bytesToUtf8(new Uint8Array(bytes));
}

export function base32Encode(s: string): string {
	let bits = '';
	for (const byte of utf8ToBytes(s))
		bits += byte.toString(2).padStart(8, '0');
	while (bits.length % 5 !== 0) bits += '0';
	let out = '';
	for (let i = 0; i < bits.length; i += 5) {
		out += B32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)] ?? '';
	}
	while (out.length % 8 !== 0) out += '=';
	return out;
}

export function hexDecode(s: string): string {
	const cleaned = s.replace(/\s+/g, '').replace(/^0x/i, '');
	if (cleaned.length % 2 !== 0) throw new Error(HEX_LENGTH_ERROR);
	const bytes = new Uint8Array(cleaned.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		const byte = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
		if (Number.isNaN(byte)) throw new Error(HEX_CHARACTER_ERROR);
		bytes[i] = byte;
	}
	return bytesToUtf8(bytes);
}

export function hexEncode(s: string): string {
	return Array.from(utf8ToBytes(s))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join(' ');
}

export function binaryDecode(s: string): string {
	const cleaned = s.replace(/[^01]/g, '');
	if (cleaned.length === 0 || cleaned.length % 8 !== 0) {
		throw new Error(BINARY_ERROR);
	}
	const bytes = new Uint8Array(cleaned.length / 8);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(cleaned.slice(i * 8, i * 8 + 8), 2);
	}
	return bytesToUtf8(bytes);
}

export function binaryEncode(s: string): string {
	return Array.from(utf8ToBytes(s))
		.map((b) => b.toString(2).padStart(8, '0'))
		.join(' ');
}

export function indexOfCoincidence(text: string): number {
	const counts: number[] = new Array<number>(26).fill(0);
	let n = 0;
	for (const ch of text.toUpperCase()) {
		const code = ch.charCodeAt(0);
		if (code >= 65 && code <= 90) {
			counts[code - 65]!++;
			n++;
		}
	}
	if (n < 2) return 0;
	let sum = 0;
	for (const c of counts) sum += c * (c - 1);
	return sum / (n * (n - 1));
}

function bestCaesarShiftForGroup(group: string): number {
	let bestShift = 0;
	let bestChi = Infinity;
	for (let s = 0; s < 26; s++) {
		const chi = chiSquaredScore(caesarShift(group, -s));
		if (chi < bestChi) {
			bestChi = chi;
			bestShift = s;
		}
	}
	return bestShift;
}

export function guessVigenereKey(
	text: string,
	maxLen = 10,
): { key: string; ioc: number } | null {
	const letters = text.toUpperCase().replace(/[^A-Z]/g, '');
	if (letters.length < 20) return null;

	const iocs: number[] = [0, 0];
	const upper = Math.min(maxLen, Math.floor(letters.length / 4));
	for (let len = 2; len <= upper; len++) {
		let avg = 0;
		for (let off = 0; off < len; off++) {
			let group = '';
			for (let i = off; i < letters.length; i += len) {
				group += letters[i];
			}
			avg += indexOfCoincidence(group);
		}
		iocs.push(avg / len);
	}

	// prefer shortest key
	const maxIoC = Math.max(...iocs);
	if (maxIoC < 0.055) return null;
	let bestLen = 0;
	for (let len = 2; len <= upper; len++) {
		if ((iocs[len] ?? 0) >= maxIoC - 0.008) {
			bestLen = len;
			break;
		}
	}
	if (bestLen === 0) return null;

	let key = '';
	for (let off = 0; off < bestLen; off++) {
		let group = '';
		for (let i = off; i < letters.length; i += bestLen) {
			group += letters[i];
		}
		key += String.fromCharCode(65 + bestCaesarShiftForGroup(group));
	}
	return { key, ioc: iocs[bestLen] ?? 0 };
}

export type CipherId =
	| 'caesar'
	| 'rot13'
	| 'rot47'
	| 'atbash'
	| 'vigenere'
	| 'affine'
	| 'morse'
	| 'a1z26'
	| 'bacon'
	| 'rail-fence'
	| 'base64'
	| 'base32'
	| 'hex'
	| 'binary';

export interface ManualParams {
	caesarShift: number;
	vigenereKey: string;
	affineA: number;
	affineB: number;
	rails: number;
}

export interface Candidate {
	cipher: string;
	cipherId: CipherId;
	detail: string;
	output: string;
	score: number;
	params?: Partial<ManualParams>;
}

function safeTry<T>(fn: () => T): T | null {
	try {
		return fn();
	} catch {
		return null;
	}
}

export const AFFINE_COPRIMES = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];

/**
 * Decoded bytes that are text: no U+FFFD, no control characters but
 * whitespace. Letters in random bytes otherwise outscored the real reading
 * (iOS CipherEngine.isReadable).
 */
export function isReadable(text: string): boolean {
	return !/[�]|(?![\t\n\v\f\r])\p{Cc}/u.test(text);
}

// letter frequency and word hits settle long before this much text (iOS)
const PROBE_LIMIT = 1500;

export function classifyAndDecode(input: string): Candidate[] {
	const trimmed = input.trim();
	if (!trimmed) return [];

	const candidates: Candidate[] = [];
	const readable = (out: string | null): out is string =>
		out !== null && isReadable(out) && englishLikeness(out) > 0.05;

	if (/^[.\-\s/|]+$/.test(trimmed)) {
		const out = safeTry(() => morseDecode(trimmed));
		if (out) {
			candidates.push({
				cipher: 'Morse code',
				cipherId: 'morse',
				detail: '',
				output: out,
				score: 0.95,
			});
		}
	}

	if (
		/^[01\s]+$/.test(trimmed) &&
		trimmed.replace(/\s/g, '').length >= 8
	) {
		const out = safeTry(() => binaryDecode(trimmed));
		if (readable(out)) {
			candidates.push({
				cipher: 'Binary',
				cipherId: 'binary',
				detail: '8-bit',
				output: out,
				score: 0.9,
			});
		}
	}

	if (
		/^(0x)?[0-9a-fA-F\s]+$/.test(trimmed) &&
		trimmed.replace(/\s|0x/gi, '').length >= 4
	) {
		const out = safeTry(() => hexDecode(trimmed));
		if (readable(out)) {
			candidates.push({
				cipher: 'Hex',
				cipherId: 'hex',
				detail: '',
				output: out,
				score: 0.88,
			});
		}
	}

	const strippedB64 = trimmed.replace(/\s/g, '');
	if (
		/^[A-Za-z0-9+/=\s]+$/.test(trimmed) &&
		strippedB64.length >= 4 &&
		strippedB64.length % 4 === 0
	) {
		const out = safeTry(() => base64Decode(trimmed));
		if (readable(out)) {
			candidates.push({
				cipher: 'Base64',
				cipherId: 'base64',
				detail: '',
				output: out,
				score: 0.85,
			});
		}
	}

	const cleanedB32 = trimmed
		.toUpperCase()
		.replace(/=+$/, '')
		.replace(/\s/g, '');
	if (/^[A-Z2-7]+$/.test(cleanedB32) && cleanedB32.length >= 8) {
		const out = safeTry(() => base32Decode(trimmed));
		if (readable(out)) {
			candidates.push({
				cipher: 'Base32',
				cipherId: 'base32',
				detail: '',
				output: out,
				score: 0.82,
			});
		}
	}

	if (
		/^[ABab\s]+$/.test(trimmed) &&
		trimmed.replace(/[^ABab]/g, '').length >= 10
	) {
		const out = safeTry(() => baconDecode(trimmed));
		if (out && englishLikeness(out) > 0.1) {
			candidates.push({
				cipher: "Bacon's cipher",
				cipherId: 'bacon',
				detail: '',
				output: out,
				score: 0.78,
			});
		}
	}

	if (/^[\d\s\-/,.]+$/.test(trimmed) && /\d/.test(trimmed)) {
		const out = safeTry(() => a1z26Decode(trimmed));
		if (out && out.length > 0 && englishLikeness(out) > 0.1) {
			candidates.push({
				cipher: 'A1Z26',
				cipherId: 'a1z26',
				detail: '',
				output: out,
				score: 0.75,
			});
		}
	}

	if (/[A-Za-z]/.test(trimmed)) {
		// substitutions are scored on the probe and re-run over the whole text once kept
		const probe = trimmed.slice(0, PROBE_LIMIT);
		const caesarTries: { shift: number; score: number }[] = [];
		for (let s = 1; s < 26; s++) {
			caesarTries.push({
				shift: s,
				score: englishLikeness(caesarShift(probe, -s)),
			});
		}
		caesarTries.sort((a, b) => b.score - a.score);
		for (const attempt of caesarTries.slice(0, 3)) {
			if (attempt.score > 0.2) {
				const isRot13 = attempt.shift === 13;
				candidates.push({
					cipher: isRot13
						? 'ROT13'
						: `Caesar (shift ${attempt.shift})`,
					cipherId: isRot13 ? 'rot13' : 'caesar',
					detail: '',
					output: caesarShift(
						trimmed,
						-attempt.shift,
					),
					score: attempt.score,
					params: isRot13
						? undefined
						: {
								caesarShift:
									attempt.shift,
							},
				});
			}
		}

		const atbashScore = englishLikeness(atbash(probe));
		if (atbashScore > 0.2) {
			candidates.push({
				cipher: 'Atbash',
				cipherId: 'atbash',
				detail: '',
				output: atbash(trimmed),
				score: atbashScore,
			});
		}

		const rottedScore = englishLikeness(rot47(probe));
		if (rottedScore > 0.25) {
			candidates.push({
				cipher: 'ROT47',
				cipherId: 'rot47',
				detail: '',
				output: rot47(trimmed),
				score: rottedScore,
			});
		}

		const guess = guessVigenereKey(probe, 10);
		if (guess) {
			const score = englishLikeness(
				vigenere(probe, guess.key, false),
			);
			if (score > 0.25) {
				candidates.push({
					cipher: 'Vigenère',
					cipherId: 'vigenere',
					detail: `key: ${guess.key}`,
					output: vigenere(
						trimmed,
						guess.key,
						false,
					),
					score: score * 0.95,
					params: { vigenereKey: guess.key },
				});
			}
		}

		let bestAffine: {
			a: number;
			b: number;
			score: number;
		} | null = null;
		for (const a of AFFINE_COPRIMES) {
			// caesar duplicate
			if (a === 1) continue;
			for (let b = 0; b < 26; b++) {
				const out = safeTry(() =>
					affine(probe, a, b, false),
				);
				if (!out) continue;
				const score = englishLikeness(out);
				if (!bestAffine || score > bestAffine.score) {
					bestAffine = { a, b, score };
				}
			}
		}
		if (bestAffine && bestAffine.score > 0.3) {
			const { a, b } = bestAffine;
			candidates.push({
				cipher: 'Affine',
				cipherId: 'affine',
				detail: `a=${a}, b=${b}`,
				output: affine(trimmed, a, b, false),
				score: bestAffine.score * 0.9,
				params: {
					affineA: bestAffine.a,
					affineB: bestAffine.b,
				},
			});
		}

		let bestRail: {
			rails: number;
			output: string;
			score: number;
		} | null = null;
		for (let r = 2; r <= 8; r++) {
			const out = railFenceDecode(trimmed, r);
			const score = englishLikeness(out);
			if (!bestRail || score > bestRail.score) {
				bestRail = { rails: r, output: out, score };
			}
		}
		if (bestRail && bestRail.score > 0.3) {
			candidates.push({
				cipher: 'Rail fence',
				cipherId: 'rail-fence',
				detail: `${bestRail.rails} rails`,
				output: bestRail.output,
				score: bestRail.score * 0.85,
				params: { rails: bestRail.rails },
			});
		}
	}

	const seen = new Map<string, Candidate>();
	for (const candidate of candidates) {
		const previous = seen.get(candidate.output);
		if (!previous || candidate.score > previous.score) {
			seen.set(candidate.output, candidate);
		}
	}

	return Array.from(seen.values())
		.sort((a, b) => b.score - a.score)
		.slice(0, 8);
}

export const CIPHER_GROUPS = ['Classical', 'Codes', 'Encodings'];

export const CIPHER_OPTIONS: {
	value: CipherId;
	label: string;
	group: string;
}[] = [
	{ value: 'caesar', label: 'Caesar', group: 'Classical' },
	{ value: 'rot13', label: 'ROT13', group: 'Classical' },
	{ value: 'rot47', label: 'ROT47', group: 'Classical' },
	{ value: 'atbash', label: 'Atbash', group: 'Classical' },
	{ value: 'vigenere', label: 'Vigenère', group: 'Classical' },
	{ value: 'affine', label: 'Affine', group: 'Classical' },
	{ value: 'rail-fence', label: 'Rail fence', group: 'Classical' },
	{ value: 'morse', label: 'Morse code', group: 'Codes' },
	{ value: 'a1z26', label: 'A1Z26', group: 'Codes' },
	{ value: 'bacon', label: "Bacon's cipher", group: 'Codes' },
	{ value: 'base64', label: 'Base64', group: 'Encodings' },
	{ value: 'base32', label: 'Base32', group: 'Encodings' },
	{ value: 'hex', label: 'Hex', group: 'Encodings' },
	{ value: 'binary', label: 'Binary', group: 'Encodings' },
];

export function runManual(
	input: string,
	cipher: CipherId,
	encode: boolean,
	p: ManualParams,
): string {
	if (!input) return '';
	switch (cipher) {
		case 'caesar':
			return caesarShift(
				input,
				encode ? p.caesarShift : -p.caesarShift,
			);
		case 'rot13':
			return caesarShift(input, 13);
		case 'rot47':
			return rot47(input);
		case 'atbash':
			return atbash(input);
		case 'vigenere':
			return vigenere(input, p.vigenereKey, encode);
		case 'affine':
			return affine(input, p.affineA, p.affineB, encode);
		case 'rail-fence':
			return encode
				? railFenceEncode(input, p.rails)
				: railFenceDecode(input, p.rails);
		case 'morse':
			return encode ? morseEncode(input) : morseDecode(input);
		case 'a1z26':
			return encode ? a1z26Encode(input) : a1z26Decode(input);
		case 'bacon':
			return encode ? baconEncode(input) : baconDecode(input);
		case 'base64':
			return encode
				? base64Encode(input)
				: base64Decode(input);
		case 'base32':
			return encode
				? base32Encode(input)
				: base32Decode(input);
		case 'hex':
			return encode ? hexEncode(input) : hexDecode(input);
		case 'binary':
			return encode
				? binaryEncode(input)
				: binaryDecode(input);
	}
}
