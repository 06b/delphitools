/**
 * BitRegroup for every code: bytes regrouped into the characters of an
 * encoding. The encoder's engine has the Base64 case only.
 */
import {
	labels,
	type Group,
	type Slot,
	type Unit,
} from 'delphitools-v2/components/tools/encoder/engine';
import type { CipherId } from 'delphitools-v2/components/tools/decoder/engine';

export interface Code {
	bits: number;
	alphabet: string;
	bytesPerGroup: number;
	padding?: string;
}

export const codes: Record<'base64' | 'base32' | 'hex' | 'binary', Code> = {
	base64: {
		bits: 6,
		alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
		bytesPerGroup: 3,
		padding: '=',
	},
	base32: {
		bits: 5,
		alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
		bytesPerGroup: 5,
		padding: '=',
	},
	hex: { bits: 4, alphabet: '0123456789abcdef', bytesPerGroup: 1 },
	binary: { bits: 1, alphabet: '01', bytesPerGroup: 1 },
};

export const codeOf = (cipher: CipherId) =>
	codes[cipher as keyof typeof codes] ?? codes.base64;

export const charsPerGroup = (code: Code) =>
	(code.bytesPerGroup * 8) / code.bits;

export const slotsOfGroup = (code: Code) => code.bytesPerGroup * 8;

/** The character's value; Base64 also reads `-` and `_`, hex and Base32 either case. */
export function valueOf(code: Code, character: string): number | undefined {
	if (code.bits === 6) {
		if (character === '-') return 62;
		if (character === '_') return 63;
		const index = code.alphabet.indexOf(character);
		return index < 0 || character.length !== 1 ? undefined : index;
	}
	const lower = code.alphabet.indexOf(character.toLowerCase());
	const upper = code.alphabet.indexOf(character.toUpperCase());
	const index = Math.max(lower, upper);
	return index < 0 || character.length !== 1 ? undefined : index;
}

export interface Reading {
	code: Code;
	count: number;
	groups: (from: number, to: number) => Group[];
}

function labelsIn(bytes: number[], from: number, to: number) {
	const start = Math.max(0, from - 3);
	const end = Math.min(bytes.length, to + 3);
	return labels(bytes.slice(start, end)).slice(from - start, to - start);
}

const slotsOf = (byte: number): Slot[] =>
	Array.from({ length: 8 }, (_, i) =>
		(byte >> (7 - i)) & 1 ? 'one' : 'zero',
	);

/** Binary's one-bit characters read as one label per byte. */
function merged(units: Unit[], code: Code): Unit[] {
	if (code.bits !== 1 || !units.length) return units;
	return [
		{
			label: units.map((u) => u.label).join(''),
			span: units.reduce((sum, u) => sum + u.span, 0),
		},
	];
}

export function encoding(bytes: number[], code: Code): Reading {
	const total = slotsOfGroup(code);
	const per = code.bytesPerGroup;
	return {
		code,
		count: Math.ceil(bytes.length / per),
		groups: (from, to) => {
			const first = Math.min(bytes.length, from * per);
			const last = Math.min(bytes.length, to * per);
			const names = labelsIn(bytes, first, last);
			const groups: Group[] = [];
			for (let start = first; start < last; start += per) {
				const chunk = bytes.slice(start, start + per);
				const real = chunk.length * 8;
				const used =
					Math.ceil(real / code.bits) * code.bits;
				const slots: Slot[] = [
					...chunk.flatMap(slotsOf),
					...Array<Slot>(used - real).fill('pad'),
					...Array<Slot>(total - used).fill(
						'absent',
					),
				];
				const top: Unit[] = Array.from(
					{ length: per },
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
				const bottom: Unit[] = Array.from(
					{ length: charsPerGroup(code) },
					(_, k) => {
						const at = k * code.bits;
						if (at >= used)
							return {
								label:
									code.padding ??
									'',
								span: code.bits,
								faint: true,
							};
						let value = 0;
						for (
							let b = 0;
							b < code.bits;
							b++
						)
							value =
								(value << 1) |
								(slots[
									at + b
								] === 'one'
									? 1
									: 0);
						return {
							label: code.alphabet[
								value
							]!,
							span: code.bits,
						};
					},
				);
				groups.push({
					slots,
					top,
					bottom: merged(bottom, code),
				});
			}
			return groups;
		},
	};
}

/** Encoded characters, whitespace removed. Reading stops at the first character the code does not have. */
export function decoding(characters: string[], code: Code): Reading {
	const values: number[] = [];
	let padding = 0;
	for (const character of characters) {
		const value = valueOf(code, character);
		if (code.padding && character === code.padding) padding += 1;
		else if (padding === 0 && value !== undefined)
			values.push(value);
		else break;
	}
	const realBits = values.length * code.bits;
	const bytes: number[] = [];
	let accumulator = 0;
	let filled = 0;
	for (const value of values) {
		accumulator = (accumulator << code.bits) | value;
		filled += code.bits;
		if (filled >= 8) {
			bytes.push((accumulator >> (filled - 8)) & 0xff);
			filled -= 8;
			accumulator &= (1 << filled) - 1;
		}
	}
	const kept = bytes.length * 8;
	const perGroup = charsPerGroup(code);
	const per = code.bytesPerGroup;
	const length = values.length + padding;
	return {
		code,
		count: Math.ceil(length / perGroup),
		groups: (from, to) => {
			const firstByte = Math.min(bytes.length, from * per);
			const names = labelsIn(
				bytes,
				firstByte,
				Math.min(bytes.length, to * per),
			);
			const groups: Group[] = [];
			const end = Math.min(length, to * perGroup);
			for (
				let start = from * perGroup;
				start < end;
				start += perGroup
			) {
				const slots: Slot[] = [];
				const top: Unit[] = [];
				for (
					let index = start;
					index < start + perGroup;
					index++
				) {
					if (index >= values.length) {
						slots.push(
							...Array<Slot>(
								code.bits,
							).fill('absent'),
						);
						top.push({
							label:
								index < length
									? (code.padding ??
										'')
									: '',
							span: code.bits,
							faint: true,
						});
						continue;
					}
					const value = values[index]!;
					const base = index * code.bits;
					for (
						let bit = 0;
						bit < code.bits;
						bit++
					)
						slots.push(
							base + bit >= kept &&
								base + bit <
									realBits
								? 'pad'
								: (value >>
											(code.bits -
												1 -
												bit)) &
									  1
									? 'one'
									: 'zero',
						);
					top.push({
						label: characters[index]!,
						span: code.bits,
					});
				}
				const byte = (start / perGroup) * per;
				const bottom: Unit[] = Array.from(
					{ length: per },
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
				groups.push({
					slots,
					top: merged(top, code),
					bottom,
				});
			}
			return groups;
		},
	};
}

/** One group of the code, all zeros, no labels: the strip with no input. */
export function ghost(code: Code): Group {
	const group = encoding(
		Array<number>(code.bytesPerGroup).fill(0),
		code,
	).groups(0, 1)[0]!;
	return {
		slots: group.slots,
		top: group.top.map((u) => ({ label: '', span: u.span })),
		bottom: group.bottom.map((u) => ({ label: '', span: u.span })),
	};
}

/** The text as the engine reads it for this code. */
export function encoded(text: string, cipher: CipherId): string[] {
	let cleaned = text.replace(/\s/g, '');
	if (cipher === 'hex' && /^0x/i.test(cleaned))
		cleaned = cleaned.slice(2);
	if (cipher === 'binary') cleaned = cleaned.replace(/[^01]/g, '');
	return Array.from(cleaned);
}

/** Points per bit, least and most: short text is drawn large, long text fits whole groups to a row. */
export function fitPitch(width: number, gap: number, slots: number) {
	const most = 7;
	const least = 3.6;
	let count = Math.max(
		1,
		Math.ceil((width + gap) / (slots * most + gap)),
	);
	let fitted = ((width + gap) / count - gap) / slots;
	if (fitted < least && count > 1) {
		count -= 1;
		fitted = ((width + gap) / count - gap) / slots;
	}
	return Math.min(Math.max(fitted, least), most);
}
