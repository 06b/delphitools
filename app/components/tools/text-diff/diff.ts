export type DiffLine =
	| { type: 'same'; text: string; oldLine: number; newLine: number }
	| { type: 'del'; text: string; oldLine: number }
	| { type: 'add'; text: string; newLine: number };

/** Start and end offsets in UTF-16 units. */
export type Span = [number, number];

/** (n+1)×(m+1) Int32 LCS table; 100k×100k lines = 40 tb. above this the middle is wholesale-replaced */
const MAX_CELLS = 4_000_000;

function diffMiddle(a: string[], b: string[], offset: number): DiffLine[] {
	const n = a.length;
	const m = b.length;
	const out: DiffLine[] = [];

	if ((n + 1) * (m + 1) > MAX_CELLS) {
		for (let i = 0; i < n; i++)
			out.push({
				type: 'del',
				text: a[i]!,
				oldLine: offset + i + 1,
			});
		for (let j = 0; j < m; j++)
			out.push({
				type: 'add',
				text: b[j]!,
				newLine: offset + j + 1,
			});
		return out;
	}

	const w = m + 1;
	const lcs = new Int32Array((n + 1) * w);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lcs[i * w + j] =
				a[i] === b[j]
					? lcs[(i + 1) * w + j + 1]! + 1
					: Math.max(
							lcs[(i + 1) * w + j]!,
							lcs[i * w + j + 1]!,
						);
		}
	}

	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			out.push({
				type: 'same',
				text: a[i]!,
				oldLine: offset + i + 1,
				newLine: offset + j + 1,
			});
			i++;
			j++;
		} else if (lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!) {
			out.push({
				type: 'del',
				text: a[i]!,
				oldLine: offset + i + 1,
			});
			i++;
		} else {
			out.push({
				type: 'add',
				text: b[j]!,
				newLine: offset + j + 1,
			});
			j++;
		}
	}
	while (i < n) {
		out.push({ type: 'del', text: a[i]!, oldLine: offset + i + 1 });
		i++;
	}
	while (j < m) {
		out.push({ type: 'add', text: b[j]!, newLine: offset + j + 1 });
		j++;
	}
	return out;
}

/** Diff of two sequences, oldest first; numbers count from 1 on both sides. */
export function diffSequences(a: string[], b: string[]): DiffLine[] {
	// shared head/tail trimmed; shrinks lcs table quadratically
	let head = 0;
	while (head < a.length && head < b.length && a[head] === b[head])
		head++;

	let tail = 0;
	while (
		tail < a.length - head &&
		tail < b.length - head &&
		a[a.length - 1 - tail] === b[b.length - 1 - tail]
	)
		tail++;

	const out: DiffLine[] = [];
	for (let k = 0; k < head; k++)
		out.push({
			type: 'same',
			text: a[k]!,
			oldLine: k + 1,
			newLine: k + 1,
		});

	out.push(
		...diffMiddle(
			a.slice(head, a.length - tail),
			b.slice(head, b.length - tail),
			head,
		),
	);

	for (let k = 0; k < tail; k++) {
		const oldIndex = a.length - tail + k;
		const newIndex = b.length - tail + k;
		out.push({
			type: 'same',
			text: a[oldIndex]!,
			oldLine: oldIndex + 1,
			newLine: newIndex + 1,
		});
	}

	return out;
}

/** Both texts empty compare as nothing, as iOS DiffListing.compute. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
	if (!oldText && !newText) return [];
	return diffSequences(oldText.split('\n'), newText.split('\n'));
}

export function diffStats(diff: DiffLine[]): {
	added: number;
	removed: number;
} {
	let added = 0;
	let removed = 0;
	for (const line of diff) {
		if (line.type === 'add') added++;
		else if (line.type === 'del') removed++;
	}
	return { added, removed };
}

/** context-diff format for clipboard; iOS DiffListing.patch matches */
export function diffPatch(diff: DiffLine[]): string {
	return diff
		.map((line) => {
			if (line.type === 'add') return `+ ${line.text}`;
			if (line.type === 'del') return `- ${line.text}`;
			return `  ${line.text}`;
		})
		.join('\n');
}

/** iOS DiffWords.leastShared: below this share of tokens two lines are not paired. */
const leastShared = 0.4;

const word = /[\p{L}\p{N}_]/u;
const space = /\s/u;

/** Word, space and single-symbol runs with their spans (iOS DiffWords.tokens). */
export function tokens(line: string): { text: string; span: Span }[] {
	const out: { text: string; span: Span }[] = [];
	let current = '';
	let start = 0;
	let offset = 0;
	let kind = -1;
	for (const char of line) {
		const next = word.test(char) ? 0 : space.test(char) ? 1 : 2;
		if ((next !== kind || next === 2) && current) {
			out.push({ text: current, span: [start, offset] });
			current = '';
		}
		if (!current) start = offset;
		kind = next;
		current += char;
		offset += char.length;
	}
	if (current) out.push({ text: current, span: [start, offset] });
	return out;
}

function merged(spans: Span[]): Span[] {
	const out: Span[] = [];
	for (const span of spans) {
		const last = out.at(-1);
		if (last && last[1] === span[0]) last[1] = span[1];
		else out.push([span[0], span[1]]);
	}
	return out;
}

/** The changed words of a removed line and the added line it pairs with; null when too unlike. */
export function wordChanges(
	oldLine: string,
	newLine: string,
): { removed: Span[]; added: Span[] } | null {
	const before = tokens(oldLine);
	const after = tokens(newLine);
	const longest = Math.max(before.length, after.length);
	if (!longest) return null;
	const diff = diffSequences(
		before.map((token) => token.text),
		after.map((token) => token.text),
	);
	const removed: Span[] = [];
	const added: Span[] = [];
	let shared = 0;
	for (const entry of diff) {
		if (entry.type === 'same') shared++;
		else if (entry.type === 'del')
			removed.push(before[entry.oldLine - 1]!.span);
		else added.push(after[entry.newLine - 1]!.span);
	}
	if (shared / longest < leastShared) return null;
	return { removed: merged(removed), added: merged(added) };
}

/** Changed-word spans per diff row: each run of removed lines pairs line by line with the added run after it. */
export function rowSpans(diff: DiffLine[]): Span[][] {
	const spans: Span[][] = diff.map(() => []);
	let index = 0;
	while (index < diff.length) {
		if (diff[index]!.type !== 'del') {
			index++;
			continue;
		}
		let end = index;
		while (end < diff.length && diff[end]!.type === 'del') end++;
		let addedEnd = end;
		while (addedEnd < diff.length && diff[addedEnd]!.type === 'add')
			addedEnd++;
		const pairs = Math.min(end - index, addedEnd - end);
		for (let offset = 0; offset < pairs; offset++) {
			const words = wordChanges(
				diff[index + offset]!.text,
				diff[end + offset]!.text,
			);
			if (!words) continue;
			spans[index + offset] = words.removed;
			spans[end + offset] = words.added;
		}
		index = addedEnd;
	}
	return spans;
}

export interface SideMark {
	/** The line is removed (old side) or added (new side). */
	lit: boolean;
	spans: Span[];
}

/** Marks for each line of each side, by line index. */
export function sideMarks(
	diff: DiffLine[],
	spans: Span[][],
): { old: SideMark[]; new: SideMark[] } {
	const old: SideMark[] = [];
	const next: SideMark[] = [];
	diff.forEach((line, index) => {
		if (line.type === 'same') {
			old[line.oldLine - 1] = { lit: false, spans: [] };
			next[line.newLine - 1] = { lit: false, spans: [] };
		} else if (line.type === 'del') {
			old[line.oldLine - 1] = {
				lit: true,
				spans: spans[index]!,
			};
		} else {
			next[line.newLine - 1] = {
				lit: true,
				spans: spans[index]!,
			};
		}
	});
	return { old, new: next };
}

/** A line cut at its spans; `on` pieces are the changed words. */
export function pieces(
	text: string,
	spans: Span[],
): { text: string; on: boolean }[] {
	const out: { text: string; on: boolean }[] = [];
	let at = 0;
	for (const [start, end] of spans) {
		if (start > at)
			out.push({ text: text.slice(at, start), on: false });
		out.push({ text: text.slice(start, end), on: true });
		at = end;
	}
	if (at < text.length) out.push({ text: text.slice(at), on: false });
	return out;
}

export type BlockKind = 'same' | 'del' | 'add';

/** A run of one kind; `left` and `right` are line ranges [from, to) on each side. */
export interface Block {
	kind: BlockKind;
	left: [number, number];
	right: [number, number];
}

/** Runs of like lines and each side's line lengths, for the ribbon map (iOS DiffRibbons.show). */
export function ribbonBlocks(diff: DiffLine[]): {
	blocks: Block[];
	oldLengths: number[];
	newLengths: number[];
} {
	const blocks: Block[] = [];
	const oldLengths: number[] = [];
	const newLengths: number[] = [];
	for (const line of diff) {
		const length = [...line.text].length;
		if (line.type !== 'add') oldLengths.push(length);
		if (line.type !== 'del') newLengths.push(length);
		const left: [number, number] =
			line.type === 'add'
				? [oldLengths.length, oldLengths.length]
				: [oldLengths.length - 1, oldLengths.length];
		const right: [number, number] =
			line.type === 'del'
				? [newLengths.length, newLengths.length]
				: [newLengths.length - 1, newLengths.length];
		const last = blocks.at(-1);
		if (last?.kind === line.type) {
			last.left[1] = left[1];
			last.right[1] = right[1];
		} else blocks.push({ kind: line.type, left, right });
	}
	return { blocks, oldLengths, newLengths };
}
