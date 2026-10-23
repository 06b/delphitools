/** Port of the iOS JSONShape, JSONListing.tokens and the error excerpt. */

export type ShapeKind = 'object' | 'array' | 'string' | 'number' | 'literal';

export interface ShapeCell {
	depth: number;
	/** Fractions of the whole document, 0 to 1. */
	start: number;
	end: number;
	kind: ShapeKind;
	label: string;
	detail: string;
	/** Index path, e.g. root.3.0. */
	path: string;
	/** Zero-based line in the indented text. */
	line: number;
	opens: boolean;
}

export interface Shape {
	cells: ShapeCell[];
	/** 0: a bare value. */
	depth: number;
	keys: number;
	values: number;
	focus: string;
}

export const shapeRows = 7;
const least = 0.0015;
const encoder = new TextEncoder();

interface Node {
	kind: ShapeKind;
	label: string;
	detail: string;
	weight: number;
	lines: number;
	line: number;
	path: string;
	total: number;
	children: { offset: number; node: Node }[];
}

type Track =
	| { kind: 'ancestor'; step: number }
	| { kind: 'inside'; below: number }
	| { kind: 'outside' };

type Stats = Pick<Shape, 'depth' | 'keys' | 'values'>;

export function parentPath(path: string): string {
	return path.split('.').slice(0, -1).join('.');
}

export function focusCell(shape: Shape): ShapeCell | undefined {
	return shape.cells.find((cell) => cell.path === shape.focus);
}

export function shapeLevels(shape: Shape): number {
	const top = focusCell(shape)?.depth ?? 0;
	const deepest = shape.cells.reduce(
		(max, cell) => Math.max(max, cell.depth),
		top,
	);
	return deepest - top + 1;
}

function contents(value: unknown): [string, unknown][] {
	if (Array.isArray(value))
		return value.map((entry, index) => [String(index), entry]);
	if (value !== null && typeof value === 'object')
		return Object.entries(value as Record<string, unknown>);
	return [];
}

function describe(
	value: unknown,
	level: number,
	stats: Stats,
): [ShapeKind, string] {
	if (Array.isArray(value)) {
		stats.depth = Math.max(stats.depth, level + 1);
		return ['array', `[${value.length}]`];
	}
	if (value !== null && typeof value === 'object') {
		const count = Object.keys(value).length;
		stats.depth = Math.max(stats.depth, level + 1);
		stats.keys += count;
		return ['object', `{${count}}`];
	}
	stats.values += 1;
	if (typeof value === 'string')
		return ['string', JSON.stringify(value.slice(0, 40))];
	if (typeof value === 'number') return ['number', String(value)];
	return ['literal', String(value)];
}

// matches the formatter's byte count
function leafWeight(value: unknown): number {
	if (typeof value === 'string') return encoder.encode(value).length + 2;
	if (typeof value === 'number') return String(value).length;
	if (value === true) return 4;
	if (value === false) return 5;
	return 4;
}

function measure(
	value: unknown,
	level: number,
	stats: Stats,
): { weight: number; lines: number } {
	const [kind] = describe(value, level, stats);
	const members = contents(value);
	if (!members.length)
		return {
			weight:
				kind === 'object' || kind === 'array'
					? 2
					: leafWeight(value),
			lines: 1,
		};
	let weight = 1 + members.length;
	let lines = 2;
	for (const [key, entry] of members) {
		const child = measure(entry, level + 1, stats);
		if (kind === 'object') weight += encoder.encode(key).length + 2;
		weight += child.weight;
		lines += child.lines;
	}
	return { weight, lines };
}

function build(
	value: unknown,
	label: string,
	path: string,
	line: number,
	level: number,
	track: Track,
	steps: number[],
	stats: Stats,
): Node {
	const [kind, detail] = describe(value, level, stats);
	const members = contents(value);
	if (!members.length) {
		const weight =
			kind === 'object' || kind === 'array'
				? 2
				: leafWeight(value);
		return {
			kind,
			label,
			detail,
			weight,
			lines: 1,
			line,
			path,
			total: 0,
			children: [],
		};
	}
	let weight = 1 + members.length;
	let total = 0;
	let lines = 2;
	let childLine = line + 1;
	const children: Node['children'] = [];
	members.forEach(([key, entry], index) => {
		let next: Track = { kind: 'outside' };
		if (track.kind === 'ancestor' && steps[track.step] === index)
			next =
				track.step + 1 === steps.length
					? { kind: 'inside', below: 0 }
					: {
							kind: 'ancestor',
							step: track.step + 1,
						};
		else if (track.kind === 'inside' && track.below + 1 < shapeRows)
			next = { kind: 'inside', below: track.below + 1 };
		let child: { weight: number; lines: number };
		if (next.kind === 'outside') {
			child = measure(entry, level + 1, stats);
		} else {
			const node = build(
				entry,
				key,
				`${path}.${index}`,
				childLine,
				level + 1,
				next,
				steps,
				stats,
			);
			children.push({ offset: total, node });
			child = node;
		}
		if (kind === 'object') weight += encoder.encode(key).length + 2;
		weight += child.weight;
		total += child.weight;
		lines += child.lines;
		childLine += child.lines;
	});
	return {
		kind,
		label,
		detail,
		weight,
		lines,
		line,
		path,
		total,
		children,
	};
}

function place(
	shape: Shape,
	node: Node,
	level: number,
	start: number,
	end: number,
	floor: number,
	trail: string,
) {
	const isFocus = node.path === shape.focus;
	shape.cells.push({
		depth: level,
		start,
		end,
		kind: node.kind,
		label: isFocus && trail ? trail : node.label,
		detail: node.detail,
		path: node.path,
		line: node.line,
		opens: node.total > 0,
	});
	if (node.total <= 0) return;
	for (const { offset, node: child } of node.children) {
		const from = start + ((end - start) * offset) / node.total;
		const to = from + ((end - start) * child.weight) / node.total;
		const onPath =
			shape.focus === child.path ||
			shape.focus.startsWith(`${child.path}.`);
		if (onPath || to - from >= floor)
			place(shape, child, level + 1, from, to, floor, trail);
	}
}

/**
 * The document as an icicle: every value a cell as wide as its share of the
 * formatted bytes, seven levels below `focus`. An unknown focus is the root.
 */
export function shapeOf(root: unknown, focus = 'root'): Shape {
	const steps = focus
		.split('.')
		.slice(1)
		.map(Number)
		.filter((step) => Number.isInteger(step));
	const shape: Shape = {
		cells: [],
		depth: 0,
		keys: 0,
		values: 0,
		focus: 'root',
	};
	const node = build(
		root,
		'',
		'root',
		0,
		0,
		steps.length
			? { kind: 'ancestor', step: 0 }
			: { kind: 'inside', below: 0 },
		steps,
		shape,
	);
	let range: [number, number] = [0, 1];
	let current = node;
	const trail: string[] = [];
	for (const step of steps) {
		const child = current.children.find(
			(entry) =>
				entry.node.path === `${current.path}.${step}`,
		);
		if (!child) return shapeOf(root);
		const width = range[1] - range[0];
		const from = range[0] + (width * child.offset) / current.total;
		range = [
			from,
			from + (width * child.node.weight) / current.total,
		];
		current = child.node;
		trail.push(current.label);
	}
	shape.focus = current.path;
	place(
		shape,
		node,
		0,
		0,
		1,
		(range[1] - range[0]) * least,
		trail.join(' › '),
	);
	return shape;
}

export type TokenKind = 'key' | ShapeKind | 'punctuation';

export interface Run {
	text: string;
	kind: TokenKind | null;
}

const isSpace = (c: string | undefined) =>
	c === ' ' || c === '\t' || c === '\n' || c === '\r';
const isDigit = (c: string | undefined) =>
	c !== undefined && c >= '0' && c <= '9';
const isLower = (c: string | undefined) =>
	c !== undefined && c >= 'a' && c <= 'z';

/** JSON token runs over the whole text, gaps as runs of no kind. */
export function tokenRuns(source: string): Run[] {
	const runs: Run[] = [];
	let gap = '';
	let index = 0;
	const push = (start: number, kind: TokenKind) => {
		if (gap) runs.push({ text: gap, kind: null });
		gap = '';
		runs.push({ text: source.slice(start, index), kind });
	};
	while (index < source.length) {
		const c = source[index];
		const start = index;
		if (c === '"') {
			index += 1;
			while (index < source.length && source[index] !== '"')
				index += source[index] === '\\' ? 2 : 1;
			index = Math.min(index + 1, source.length);
			let next = index;
			while (next < source.length && isSpace(source[next]))
				next += 1;
			push(start, source[next] === ':' ? 'key' : 'string');
		} else if (c === '-' || isDigit(c)) {
			while (
				index < source.length &&
				('+-.Ee'.includes(source[index]!) ||
					isDigit(source[index]))
			)
				index += 1;
			push(start, 'number');
		} else if (isLower(c)) {
			while (index < source.length && isLower(source[index]))
				index += 1;
			push(start, 'literal');
		} else if (c !== undefined && '{}[]:,'.includes(c)) {
			index += 1;
			push(start, 'punctuation');
		} else {
			gap += c;
			index += 1;
		}
	}
	if (gap) runs.push({ text: gap, kind: null });
	return runs;
}

const excerptRadius = 24;

/** The error line, windowed to 24 characters each side of the column. */
export function errorExcerpt(
	source: string,
	line: number,
	column: number,
): { before: string; at: string; after: string } {
	const text = source.split('\n')[line - 1] ?? '';
	const caret = Math.max(0, Math.min(column - 1, text.length));
	const before = text.slice(Math.max(0, caret - excerptRadius), caret);
	const point = text.codePointAt(caret);
	const at = point === undefined ? '' : String.fromCodePoint(point);
	const after = text.slice(
		caret + at.length,
		caret + at.length + excerptRadius,
	);
	return { before, at, after };
}
