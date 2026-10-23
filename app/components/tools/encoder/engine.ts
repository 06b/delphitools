/** EncoderEngine: Base64, URL escapes and digests, with the pictures' readings. */

// web crypto has no MD5, so iOS's first algorithm is missing
export const algorithms = [
	{ name: 'SHA-1', digest: 'SHA-1', bits: 160 },
	{ name: 'SHA-256', digest: 'SHA-256', bits: 256 },
	{ name: 'SHA-512', digest: 'SHA-512', bits: 512 },
];

export type Outcome = { text: string } | { error: string };

// avoid spread argument limits
function binaryString(bytes: Uint8Array): string {
	let out = '';
	for (const byte of bytes) out += String.fromCharCode(byte);
	return out;
}

export function encodeBase64(text: string): string {
	return btoa(binaryString(new TextEncoder().encode(text)));
}

/** Accepts whitespace, missing padding and the URL-safe alphabet; throws on anything else. */
export function decodeBase64(text: string): string {
	const binary = atob(
		text.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/'),
	);
	return new TextDecoder().decode(
		Uint8Array.from(binary, (c) => c.charCodeAt(0)),
	);
}

export function base64Outcome(text: string, decoding: boolean): Outcome {
	if (!decoding) return { text: encodeBase64(text) };
	try {
		return { text: decodeBase64(text) };
	} catch {
		return { error: 'Invalid Base64.' };
	}
}

export function tryDecodeUrl(text: string): string | null {
	try {
		return decodeURIComponent(text);
	} catch {
		return null;
	}
}

export function urlOutcome(text: string, decoding: boolean): Outcome {
	if (!decoding) return { text: encodeURIComponent(text) };
	const decoded = tryDecodeUrl(text);
	return decoded === null
		? { error: 'Invalid escape' }
		: { text: decoded };
}

export function hex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
		'',
	);
}

/** Every digest of the text's UTF-8 bytes; empty without a secure context. */
export async function digests(text: string): Promise<Uint8Array[]> {
	if (!globalThis.crypto?.subtle) return [];
	const bytes = new TextEncoder().encode(text);
	return Promise.all(
		algorithms.map(
			async (a) =>
				new Uint8Array(
					await globalThis.crypto.subtle.digest(
						a.digest,
						bytes,
					),
				),
		),
	);
}

// MARK: the URL picture

export interface Pair {
	top: string;
	bottom: string;
	changes: boolean;
	newline?: boolean;
}

const visibleSpace = '␣';

export function urlEncodePairs(text: string): Pair[] {
	return Array.from(text, (character) => {
		if (character === '\n')
			return {
				top: '',
				bottom: '',
				changes: false,
				newline: true,
			};
		const escaped = encodeURIComponent(character);
		return {
			top: character === ' ' ? visibleSpace : character,
			bottom: escaped,
			changes: escaped !== character,
		};
	});
}

/** Runs of escapes read as the characters they spell; a run that is not UTF-8 reads as U+FFFD. */
export function urlDecodePairs(text: string): Pair[] {
	const characters = Array.from(text);
	const byteAt = (index: number) => {
		if (index + 2 >= characters.length || characters[index] !== '%')
			return undefined;
		const pair = characters[index + 1]! + characters[index + 2]!;
		return /^[0-9a-f]{2}$/i.test(pair)
			? Number.parseInt(pair, 16)
			: undefined;
	};
	const pairs: Pair[] = [];
	let i = 0;
	while (i < characters.length) {
		if (byteAt(i) === undefined) {
			const character = characters[i]!;
			pairs.push(
				character === '\n'
					? {
							top: '',
							bottom: '',
							changes: false,
							newline: true,
						}
					: {
							top: character,
							bottom: character,
							changes: false,
						},
			);
			i += 1;
			continue;
		}
		const run: number[] = [];
		for (
			let next = byteAt(i);
			next !== undefined;
			next = byteAt(i + run.length * 3)
		)
			run.push(next);
		const names = labels(run);
		let start = 0;
		while (start < run.length) {
			let end = start + 1;
			while (end < run.length && names[end] === '') end += 1;
			const chunk = run.slice(start, end);
			const escapes = chunk
				.map(
					(b) =>
						`%${b.toString(16).toUpperCase().padStart(2, '0')}`,
				)
				.join('');
			const spelled = utf8(chunk) ?? '�';
			pairs.push({
				top: escapes,
				bottom:
					spelled === ' '
						? visibleSpace
						: spelled,
				changes: true,
			});
			start = end;
		}
		i += run.length * 3;
	}
	return pairs;
}

function utf8(bytes: number[]): string | undefined {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(
			new Uint8Array(bytes),
		);
	} catch {
		return undefined;
	}
}

// MARK: the Base64 picture (BitRegroup with the Base64 code)

export type Slot = 'one' | 'zero' | 'pad' | 'absent';

export interface Unit {
	label: string;
	span: number;
	faint?: boolean;
}

export interface Group {
	slots: Slot[];
	top: Unit[];
	bottom: Unit[];
}

const alphabet =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const bits = 6;
const bytesPerGroup = 3;
const charsPerGroup = 4;
export const slotsPerGroup = bytesPerGroup * 8;

function valueOf(character: string): number | undefined {
	if (character === '-') return 62;
	if (character === '_') return 63;
	const index = alphabet.indexOf(character);
	return index < 0 || character.length !== 1 ? undefined : index;
}

/**
 * Byte labels: a character over its first byte and nothing over the rest
 * of it, a visible sign for space, tab and newline, the hex of anything
 * else.
 */
export function labels(bytes: number[]): string[] {
	const out = bytes.map(() => '');
	let i = 0;
	while (i < bytes.length) {
		const byte = bytes[i]!;
		const length =
			byte < 0x80
				? 1
				: byte >= 0xf8
					? 0
					: byte >= 0xf0
						? 4
						: byte >= 0xe0
							? 3
							: byte >= 0xc0
								? 2
								: 0;
		const text =
			length > 1 && i + length <= bytes.length
				? utf8(bytes.slice(i, i + length))
				: undefined;
		if (text !== undefined) {
			out[i] = text;
			i += length;
			continue;
		}
		out[i] =
			byte === 0x20
				? visibleSpace
				: byte === 0x0a
					? '↵'
					: byte === 0x09
						? '⇥'
						: byte >= 0x21 && byte <= 0x7e
							? String.fromCharCode(
									byte,
								)
							: byte
									.toString(
										16,
									)
									.toUpperCase()
									.padStart(
										2,
										'0',
									);
		i += 1;
	}
	return out;
}

/** Labels for `from..<to`, read from three bytes before so a cut character labels as in the whole. */
function labelsIn(bytes: number[], from: number, to: number) {
	const start = Math.max(0, from - 3);
	const end = Math.min(bytes.length, to + 3);
	return labels(bytes.slice(start, end)).slice(from - start, to - start);
}

function slotsOf(byte: number): Slot[] {
	return Array.from({ length: 8 }, (_, i) =>
		(byte >> (7 - i)) & 1 ? 'one' : 'zero',
	);
}

/** An input read once; groups are built only for the range asked for. */
export interface Reading {
	count: number;
	groups: (from: number, to: number) => Group[];
}

export function encoding(bytes: number[]): Reading {
	return {
		count: Math.ceil(bytes.length / bytesPerGroup),
		groups: (from, to) => {
			const first = Math.min(
				bytes.length,
				from * bytesPerGroup,
			);
			const last = Math.min(bytes.length, to * bytesPerGroup);
			const names = labelsIn(bytes, first, last);
			const groups: Group[] = [];
			for (
				let start = first;
				start < last;
				start += bytesPerGroup
			) {
				const chunk = bytes.slice(
					start,
					start + bytesPerGroup,
				);
				const real = chunk.length * 8;
				const used = Math.ceil(real / bits) * bits;
				const slots: Slot[] = [
					...chunk.flatMap(slotsOf),
					...Array<Slot>(used - real).fill('pad'),
					...Array<Slot>(
						slotsPerGroup - used,
					).fill('absent'),
				];
				const top = Array.from(
					{ length: bytesPerGroup },
					(_, i) =>
						i < chunk.length
							? {
									label: names[
										start -
											first +
											i
									]!,
									span: 8,
								}
							: {
									label: '',
									span: 8,
									faint: true,
								},
				);
				const bottom = Array.from(
					{ length: charsPerGroup },
					(_, k) => {
						const at = k * bits;
						if (at >= used)
							return {
								label: '=',
								span: bits,
								faint: true,
							};
						let value = 0;
						for (let b = 0; b < bits; b++)
							value =
								(value << 1) |
								(slots[
									at + b
								] === 'one'
									? 1
									: 0);
						return {
							label: alphabet[value]!,
							span: bits,
						};
					},
				);
				groups.push({ slots, top, bottom });
			}
			return groups;
		},
	};
}

/** Base64 text, whitespace removed. Reading stops at the first character Base64 does not have. */
export function decoding(text: string): Reading {
	const characters = Array.from(text.replace(/\s/g, ''));
	const values: number[] = [];
	let padding = 0;
	for (const character of characters) {
		const value = valueOf(character);
		if (character === '=') padding += 1;
		else if (padding === 0 && value !== undefined)
			values.push(value);
		else break;
	}
	const realBits = values.length * bits;
	const bytes: number[] = [];
	let accumulator = 0;
	let filled = 0;
	for (const value of values) {
		accumulator = (accumulator << bits) | value;
		filled += bits;
		if (filled >= 8) {
			bytes.push((accumulator >> (filled - 8)) & 0xff);
			filled -= 8;
			accumulator &= (1 << filled) - 1;
		}
	}
	const kept = bytes.length * 8;
	const length = values.length + padding;
	return {
		count: Math.ceil(length / charsPerGroup),
		groups: (from, to) => {
			const firstByte = Math.min(
				bytes.length,
				from * bytesPerGroup,
			);
			const names = labelsIn(
				bytes,
				firstByte,
				Math.min(bytes.length, to * bytesPerGroup),
			);
			const groups: Group[] = [];
			const end = Math.min(length, to * charsPerGroup);
			for (
				let start = from * charsPerGroup;
				start < end;
				start += charsPerGroup
			) {
				const slots: Slot[] = [];
				const top: Unit[] = [];
				for (
					let index = start;
					index < start + charsPerGroup;
					index++
				) {
					if (index >= values.length) {
						slots.push(
							...Array<Slot>(
								bits,
							).fill('absent'),
						);
						top.push({
							label:
								index < length
									? '='
									: '',
							span: bits,
							faint: true,
						});
						continue;
					}
					const value = values[index]!;
					const base = index * bits;
					for (let bit = 0; bit < bits; bit++)
						slots.push(
							base + bit >= kept &&
								base + bit <
									realBits
								? 'pad'
								: (value >>
											(bits -
												1 -
												bit)) &
									  1
									? 'one'
									: 'zero',
						);
					top.push({
						label: characters[index]!,
						span: bits,
					});
				}
				const byte =
					(start / charsPerGroup) * bytesPerGroup;
				const bottom = Array.from(
					{ length: bytesPerGroup },
					(_, j) =>
						byte + j < bytes.length
							? {
									label: names[
										byte +
											j -
											firstByte
									]!,
									span: 8,
								}
							: {
									label: '',
									span: 8,
									faint: true,
								},
				);
				groups.push({ slots, top, bottom });
			}
			return groups;
		},
	};
}

/** One group, all zeros, no labels: the strip with no input. */
export function ghost(): Group {
	const group = encoding([0, 0, 0]).groups(0, 1)[0]!;
	return {
		slots: group.slots,
		top: group.top.map((u) => ({ label: '', span: u.span })),
		bottom: group.bottom.map((u) => ({ label: '', span: u.span })),
	};
}

/** Points per bit, least and most: short text is drawn large, long text fits whole groups to a row. */
export function fitPitch(width: number, gap: number) {
	const most = 7;
	const least = 3.6;
	let count = Math.max(
		1,
		Math.ceil((width + gap) / (slotsPerGroup * most + gap)),
	);
	let fitted = ((width + gap) / count - gap) / slotsPerGroup;
	if (fitted < least && count > 1) {
		count -= 1;
		fitted = ((width + gap) / count - gap) / slotsPerGroup;
	}
	return Math.min(Math.max(fitted, least), most);
}

// MARK: the digest picture

/** Columns and cell size for `count` digits: 16 to a row, 32 when the digest is long and the row wide. */
export function digestGrid(count: number, width: number, height: number) {
	const columns = count > 64 && width / 32 >= 18 ? 32 : 16;
	const rows = Math.max(1, Math.ceil(count / columns));
	const cellWidth = width / columns;
	return {
		columns,
		width: cellWidth,
		height: Math.min(cellWidth, height / rows),
	};
}

/** Bits that differ between two digests of the same length. */
export function flippedBits(a: Uint8Array, b: Uint8Array) {
	let count = 0;
	a.forEach((byte, i) => {
		let x = byte ^ b[i]!;
		while (x) {
			count += x & 1;
			x >>= 1;
		}
	});
	return count;
}
