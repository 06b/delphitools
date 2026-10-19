/**
 * iOS ShavianEngine.carryEdits: after the text changes, the words that still
 * match at the start and at the end keep their old token when `kept` says it
 * holds edits. `word` is the spelling of a word token, none for the others.
 */
export function carryEdits<T>(
	old: T[],
	next: T[],
	word: (token: T) => string | undefined,
	kept: (token: T) => boolean,
): T[] {
	const before = old.filter((t) => word(t) !== undefined);
	const slots = next.flatMap((t, i) =>
		word(t) !== undefined ? [i] : [],
	);
	const out = [...next];
	const carry = (token: T, slot: number) => {
		if (kept(token)) out[slot] = token;
	};
	const shared = Math.min(before.length, slots.length);
	let prefix = 0;
	while (
		prefix < shared &&
		word(before[prefix]!) === word(next[slots[prefix]!]!)
	) {
		carry(before[prefix]!, slots[prefix]!);
		prefix += 1;
	}
	let suffix = 0;
	while (
		suffix < shared - prefix &&
		word(before[before.length - 1 - suffix]!) ===
			word(next[slots[slots.length - 1 - suffix]!]!)
	) {
		carry(
			before[before.length - 1 - suffix]!,
			slots[slots.length - 1 - suffix]!,
		);
		suffix += 1;
	}
	return out;
}
