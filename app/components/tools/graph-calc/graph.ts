import { parse, type Node } from 'delphicanon/lib/math/node';
import { Expression } from 'delphicanon/lib/math/expression';
import { parseHex, takesBlackInk } from 'delphicanon/lib/colour';

export interface Plane {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface Point {
	x: number;
	y: number;
}

/** Narrowest and widest span a pinch or wheel reaches. */
export const spans = { min: 1e-4, max: 1e6 };

export const standard: Plane = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
export const trig: Plane = {
	xMin: -2 * Math.PI,
	xMax: 2 * Math.PI,
	yMin: -4,
	yMax: 4,
};
export const decimal: Plane = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };

export const spanX = (p: Plane) => p.xMax - p.xMin;
export const spanY = (p: Plane) => p.yMax - p.yMin;

/** x from -10 to 10, y around 0 at the same scale. */
export function square(size: Size): Plane {
	const half = (10 * size.height) / Math.max(size.width, 1);
	return { xMin: -10, xMax: 10, yMin: -half, yMax: half };
}

/** Same x range, y at the x scale around its centre. */
export function squared(p: Plane, size: Size): Plane {
	const half = (spanX(p) * size.height) / Math.max(size.width, 1) / 2;
	const centre = (p.yMin + p.yMax) / 2;
	return { ...p, yMin: centre - half, yMax: centre + half };
}

/** A resized plot keeps its centre and its units per pixel. */
export function resized(p: Plane, from: Size, to: Size): Plane {
	if (!(from.width > 0) || !(from.height > 0)) return p;
	const halfX = (spanX(p) * to.width) / from.width / 2;
	const halfY = (spanY(p) * to.height) / from.height / 2;
	const cx = (p.xMin + p.xMax) / 2;
	const cy = (p.yMin + p.yMax) / 2;
	return {
		xMin: cx - halfX,
		xMax: cx + halfX,
		yMin: cy - halfY,
		yMax: cy + halfY,
	};
}

/** Both spans scaled by `factor` about a plane point, which stays put on screen. */
export function zoomed(p: Plane, factor: number, x: number, y: number): Plane {
	const f = Math.min(
		Math.max(factor, spans.min / spanX(p), spans.min / spanY(p)),
		spans.max / spanX(p),
		spans.max / spanY(p),
	);
	return {
		xMin: x - (x - p.xMin) * f,
		xMax: x + (p.xMax - x) * f,
		yMin: y - (y - p.yMin) * f,
		yMax: y + (p.yMax - y) * f,
	};
}

export function moved(p: Plane, dx: number, dy: number): Plane {
	return {
		xMin: p.xMin + dx,
		xMax: p.xMax + dx,
		yMin: p.yMin + dy,
		yMax: p.yMax + dy,
	};
}

/** Centres move straight, spans geometrically, so a zoom out and back in reads as one motion. */
export function blend(a: Plane, b: Plane, t: number): Plane {
	const cx = (a.xMin + a.xMax) / 2;
	const cy = (a.yMin + a.yMax) / 2;
	const x = cx + ((b.xMin + b.xMax) / 2 - cx) * t;
	const y = cy + ((b.yMin + b.yMax) / 2 - cy) * t;
	const sx = (spanX(a) * Math.pow(spanX(b) / spanX(a), t)) / 2;
	const sy = (spanY(a) * Math.pow(spanY(b) / spanY(a), t)) / 2;
	return { xMin: x - sx, xMax: x + sx, yMin: y - sy, yMax: y + sy };
}

export const samePlane = (a: Plane, b: Plane) =>
	a.xMin === b.xMin &&
	a.xMax === b.xMax &&
	a.yMin === b.yMin &&
	a.yMax === b.yMax;

/** The web tool's curve colours, with the ink that reads on each. */
export const palette = [
	'#3b82f6',
	'#ef4444',
	'#22c55e',
	'#f59e0b',
	'#8b5cf6',
	'#ec4899',
	'#06b6d4',
	'#f97316',
].map((fill) => ({
	fill,
	ink: takesBlackInk(parseHex(fill)!) ? '#000' : '#fff',
}));

export const paint = (colour: number) => palette[colour % palette.length]!;

/** 1, 2 or 5 times a power of ten, at least `value`. */
export function niceCeil(value: number): number {
	if (!(value > 0) || !Number.isFinite(value)) return 1;
	const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
	const norm = value / magnitude;
	const nice =
		norm <= 1 + 1e-9
			? 1
			: norm <= 2 + 1e-9
				? 2
				: norm <= 5 + 1e-9
					? 5
					: 10;
	return nice * magnitude;
}

/** 1, 2 or 5 times a power of ten, at most `value`. */
export function niceFloor(value: number): number {
	if (!(value > 0) || !Number.isFinite(value)) return 1;
	const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
	const norm = value / magnitude;
	const nice = norm >= 5 - 1e-9 ? 5 : norm >= 2 - 1e-9 ? 2 : 1;
	return nice * magnitude;
}

/** Minor divisions of a major step: fifths of a 1 or a 5, quarters of a 2. */
export function minorDivisions(step: number): number {
	const norm = step / Math.pow(10, Math.floor(Math.log10(step)));
	return Math.abs(norm - 2) < 1e-6 ? 4 : 5;
}

/** Multiples of `step` from `min` to `max`, as whole counts of `step`. */
export function ticks(min: number, max: number, step: number): number[] {
	if (
		!(step > 0) ||
		!Number.isFinite(min) ||
		!Number.isFinite(max) ||
		(max - min) / step >= 4000
	)
		return [];
	const first = Math.ceil(min / step);
	const last = Math.floor(max / step);
	const out: number[] = [];
	for (let i = first; i <= last; i++) out.push(i);
	return out;
}

const minus = '−';

function trimmed(fixed: string): string {
	return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** A tick at `count` steps, to the step's decimals, with a true minus sign. */
export function tickLabel(count: number, step: number): string {
	const decimals = step < 1 ? Math.ceil(-Math.log10(step) - 1e-9) : 0;
	return trimmed((count * step).toFixed(decimals)).replace('-', minus);
}

/** A value for a tag or a table: at most four decimals, exponent notation at the extremes. */
export function format(value: number): string {
	if (!Number.isFinite(value)) return '—';
	const size = Math.abs(value);
	let text: string;
	if (size !== 0 && (size < 1e-4 || size >= 1e9)) {
		text = Number(value.toPrecision(4))
			.toExponential()
			.replace('e+', 'E')
			.replace('e', 'E');
	} else {
		const rounded = Math.round(value * 1e4) / 1e4;
		text = trimmed((rounded === 0 ? 0 : rounded).toFixed(4));
	}
	return text.replaceAll('-', minus);
}

// MARK: syntax

// keypad syntax is nerdamer's, which mathjs shares for log, log10 and log(a, b)
const unary = new Set([
	'sin',
	'cos',
	'tan',
	'sec',
	'csc',
	'cot',
	'asin',
	'acos',
	'atan',
	'asec',
	'acsc',
	'sinh',
	'cosh',
	'tanh',
	'asinh',
	'acosh',
	'atanh',
	'sqrt',
	'cbrt',
	'abs',
	'exp',
	'floor',
	'ceil',
	'round',
	'log10',
]);
const binary: Record<string, string> = {
	nthroot: 'nthRoot',
	min: 'min',
	max: 'max',
	log: 'log',
};

// mathjs differs from iOS MathExpression: its acot is atan(1/x), its mod floors
const rewrites: Record<string, (args: string[]) => string | undefined> = {
	acot: ([a, more]) => (more ? undefined : `(pi/2-atan(${a}))`),
	mod: ([a, b, more]) =>
		b && !more ? `(${a}-${b}*fix(${a}/${b}))` : undefined,
};

function emit(node: Node): string | undefined {
	const wrap = (n: Node) => {
		const text = emit(n);
		return text === undefined ? undefined : `(${text})`;
	};
	const all = (nodes: Node[], separator: string) => {
		const parts = nodes.map(wrap);
		if (parts.length === 0 || parts.some((p) => p === undefined))
			return undefined;
		return parts.join(separator);
	};
	switch (node.k) {
		case 'number':
			return Number.isFinite(Number(node.v))
				? String(Number(node.v))
				: undefined;
		case 'symbol':
			return ['x', 'pi', 'e'].includes(node.v)
				? node.v
				: undefined;
		case 'negate': {
			const inner = wrap(node.a);
			return inner === undefined ? undefined : `-${inner}`;
		}
		case 'sum':
			return all(node.items, '+');
		case 'product':
			return all(node.items, '*');
		case 'quotient':
			return all([node.a, node.b], '/');
		case 'power':
			return all([node.a, node.b], '^');
		case 'group':
			return wrap(node.a);
		case 'call': {
			const n = node.items.length;
			const rewrite = rewrites[node.name];
			if (rewrite) {
				const args = node.items.map(wrap);
				return args.length &&
					args.every(
						(a): a is string =>
							a !== undefined,
					)
					? rewrite(args)
					: undefined;
			}
			const name =
				n === 1 &&
				(unary.has(node.name) || node.name === 'log')
					? node.name
					: n === 2
						? binary[node.name]
						: undefined;
			if (!name) return undefined;
			const args = all(node.items, ',');
			return args === undefined
				? undefined
				: `${name}(${args})`;
		}
		default:
			return undefined;
	}
}

/** mathjs text for keypad text, or undefined for what it cannot plot: unfinished input, other letters, calculus. */
export function plotted(text: string): string | undefined {
	if (!text.trim()) return undefined;
	const node = parse(text);
	return node ? emit(node) : undefined;
}

const logNames = /(?<![A-Za-z])(ln|log)(?![A-Za-z0-9])/g;

/** Keypad text for an example written with `ln` natural and `log` common, products written out. */
export function typed(example: string): string {
	const keypad = example.replace(logNames, (name) =>
		name === 'ln' ? 'log' : 'log10',
	);
	return new Expression(keypad, 'x').text;
}

// MARK: evaluation

export type Evaluator = (x: number) => number;

// defer 700kb mathjs
let compileExpression: typeof import('mathjs').compile | null = null;
let mathjsLoad: Promise<void> | null = null;

export function loadMathjs(): Promise<void> {
	mathjsLoad ??= import('mathjs').then((mathjs) => {
		compileExpression = mathjs.compile;
	});
	return mathjsLoad;
}

/** A compiled curve; null before mathjs loads or for text that does not compile. */
export function createEvaluator(expression: string): Evaluator | null {
	if (!compileExpression || !expression.trim()) return null;
	try {
		const compiled = compileExpression(expression);
		return (x: number) => {
			try {
				const result: unknown = compiled.evaluate({
					x,
				});
				return typeof result === 'number'
					? result
					: NaN;
			} catch {
				return NaN;
			}
		};
	} catch {
		return null;
	}
}

const plain = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** A typed number: decimal comma accepted, and a constant expression such as `pi/2` or `-2e`. */
export function number(text: string): number | undefined {
	const t = text.trim().replaceAll(minus, '-');
	const comma = t.replace(',', '.');
	if (plain.test(comma)) return Number(comma);
	if (!t) return undefined;
	const node = parse(t);
	const source = node ? emit(node) : undefined;
	if (!source || /\bx\b/.test(source)) return undefined;
	const value = createEvaluator(source)?.(0);
	return value !== undefined && Number.isFinite(value)
		? value
		: undefined;
}

// MARK: drawing

/**
 * The curve as unbroken runs of points, split where it is undefined and
 * across vertical asymptotes. `x` maps a sample's screen x to the plane,
 * `y` a plane y to the screen.
 */
export function runs(
	samples: number,
	from: number,
	to: number,
	spanOfY: number,
	x: (px: number) => number,
	y: (value: number) => number,
	clamp: [number, number],
	f: Evaluator,
): Point[][] {
	const out: Point[][] = [];
	let run: Point[] = [];
	let previous = NaN;
	const count = Math.max(samples, 1);
	for (let i = 0; i <= count; i++) {
		const px = from + ((to - from) * i) / count;
		const value = f(x(px));
		if (!Number.isFinite(value)) {
			if (run.length > 1) out.push(run);
			run = [];
			previous = NaN;
			continue;
		}
		// sign flip: asymptote
		if (
			previous * value < 0 &&
			Math.abs(value - previous) > spanOfY
		) {
			if (run.length > 1) out.push(run);
			run = [];
		}
		run.push({
			x: px,
			y: Math.min(Math.max(y(value), clamp[0]), clamp[1]),
		});
		previous = value;
	}
	if (run.length > 1) out.push(run);
	return out;
}

/** Centres at least `gap` apart, each as close to its wish as the others allow, none past `high` where they fit. */
export function spread(wishes: number[], gap: number, high: number): number[] {
	const order = wishes
		.map((_, i) => i)
		.sort((a, b) => wishes[a]! - wishes[b]!);
	const centres = order.map((i) => wishes[i]!);
	for (let i = 1; i < centres.length; i++)
		centres[i] = Math.max(centres[i]!, centres[i - 1]! + gap);
	if (centres.length && centres.at(-1)! > high) {
		centres[centres.length - 1] = high;
		for (let i = centres.length - 2; i >= 0; i--)
			centres[i] = Math.min(
				centres[i]!,
				centres[i + 1]! - gap,
			);
	}
	const result = [...wishes];
	order.forEach((index, slot) => (result[index] = centres[slot]!));
	return result;
}

// MARK: trace

/** Table steps between these, 1, 2 and 5 times a power of ten. */
export const steps = { min: 1e-4, max: 1e4 };

/** Onto the next multiple of the step, or one step on from one. */
export function stepTrace(
	trace: number,
	step: number,
	direction: -1 | 1,
): { x: number; onGrid: boolean } {
	const count = trace / step;
	const onGrid = Math.abs(count - Math.round(count)) < 1e-9;
	const next =
		(onGrid
			? Math.round(count) + direction
			: direction > 0
				? Math.ceil(count)
				: Math.floor(count)) * step;
	return { x: Math.round(next / step) * step, onGrid };
}

export function stepStep(step: number, direction: -1 | 1): number {
	const next =
		direction > 0
			? niceCeil(step * 1.0001)
			: niceFloor(step * 0.9999);
	return Math.min(Math.max(next, steps.min), steps.max);
}

/** A row's x, with the drift of repeated steps rounded off. */
export function rowX(x: number, offset: number, step: number): number {
	const value = x + offset * step;
	const clean = Math.round(value / step) * step;
	return Math.abs(value - clean) < step * 1e-9 ? clean : value;
}

/** A range end rounded to about a thousandth of the span. */
export function rangeText(low: number, high: number): [string, string] {
	const grain = niceFloor((high - low) / 1000);
	return [low, high].map((v) =>
		format(Math.round(v / grain) * grain),
	) as [string, string];
}

/** y₁, y₂, ... */
export function curveName(index: number): string {
	return (
		'y' +
		[...String(index + 1)]
			.map((d) => String.fromCodePoint(0x2080 + Number(d)))
			.join('')
	);
}

// MARK: functions

export type Relation = '=' | '<' | '>' | '≤' | '≥';
export const relations: Relation[] = ['=', '<', '>', '≤', '≥'];

/** Written with `ln` natural and `log` common, as on iOS; `typed` turns them into keypad text. */
export const examples = [
	'x^2',
	'sin(x)',
	'sqrt(x)',
	'log(x)',
	'abs(x)',
	'2x + 1',
	'exp(x)',
	'tan(x)',
];

/** The first palette colour no curve has, else the next in turn. */
export function nextColour(used: number[]): number {
	const free = palette.findIndex((_, i) => !used.includes(i));
	return free >= 0 ? free : used.length % palette.length;
}
