import { NANOID_ALPHABET, type IdentifierKind } from 'delphitools-v2/lib/uuid';

export type Field = 'time' | 'version' | 'variant' | 'random';

/** A character of the identifier and its bits, most significant first; null for a hyphen. */
export interface Column {
	character: string;
	bits: boolean[];
	fields: Field[];
}

export const fieldNames: Record<Field, string> = {
	time: 'Time',
	version: 'Version',
	variant: 'Variant',
	random: 'Random',
};

export function bitCounts(kind: IdentifierKind): [Field, number][] {
	switch (kind) {
		case 'uuid4':
			return [
				['version', 4],
				['variant', 2],
				['random', 122],
			];
		case 'uuid7':
			return [
				['time', 48],
				['version', 4],
				['variant', 2],
				['random', 74],
			];
		case 'nanoid':
			return [['random', 126]];
	}
}

const bitsOf = (value: number, width: number) =>
	Array.from(
		{ length: width },
		(_, i) => ((value >> (width - 1 - i)) & 1) === 1,
	);

function nibbleFields(nibble: number, kind: IdentifierKind): Field[] {
	if (nibble === 12) return Array<Field>(4).fill('version');
	if (nibble === 16) return ['variant', 'variant', 'random', 'random'];
	if (nibble < 12 && kind === 'uuid7')
		return Array<Field>(4).fill('time');
	return Array<Field>(4).fill('random');
}

/** RFC 9562 layout: nibble 12 is the version, the top two bits of nibble 16 the variant; v7 puts the time in nibbles 0 to 11. */
export function columns(text: string, kind: IdentifierKind): (Column | null)[] {
	if (kind === 'nanoid')
		return [...text].map((character) => ({
			character,
			bits: bitsOf(
				Math.max(NANOID_ALPHABET.indexOf(character), 0),
				6,
			),
			fields: Array<Field>(6).fill('random'),
		}));
	let nibble = 0;
	return [...text].map((character) => {
		const value = parseInt(character, 16);
		if (Number.isNaN(value)) return null;
		const fields = nibbleFields(nibble, kind);
		nibble += 1;
		return { character, bits: bitsOf(value, 4), fields };
	});
}

/** The v7 time as an ISO 8601 UTC stamp with milliseconds. */
export function stamp(milliseconds: number): string {
	return new Date(milliseconds).toISOString();
}
