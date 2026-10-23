import type { Rgb } from 'delphicanon/lib/colour';

export interface TracerOptions {
	numberofcolors: number;
	colorquantcycles: number;
	ltres: number;
	qtres: number;
	pathomit: number;
	strokewidth: number;
	scale: number;
	blurradius: number;
	blurdelta: number;
	colorsampling: number;
	mincolorratio: number;
	roundcoords: number;
	lcpr: number;
	qcpr: number;
	layering: number;
	rightangleenhance: boolean;
	linefilter: boolean;
}

export type NumericOption = {
	[K in keyof TracerOptions]: TracerOptions[K] extends number ? K : never;
}[keyof TracerOptions];

export const DEFAULT_OPTIONS: TracerOptions = {
	numberofcolors: 16,
	colorquantcycles: 3,
	ltres: 1,
	qtres: 1,
	pathomit: 8,
	strokewidth: 1,
	scale: 1,
	blurradius: 0,
	blurdelta: 20,
	colorsampling: 2,
	mincolorratio: 0,
	roundcoords: 1,
	lcpr: 0,
	qcpr: 0,
	layering: 0,
	rightangleenhance: true,
	linefilter: false,
};

/** imagetracerjs optionpresets keys, with the web tool's names. */
export const PRESETS: { id: string; name: string }[] = [
	{ id: 'default', name: 'Default' },
	{ id: 'posterized1', name: 'Monoposto' },
	{ id: 'posterized2', name: "Saul's World" },
	{ id: 'posterized3', name: 'Powders' },
	{ id: 'curvy', name: 'Bouba' },
	{ id: 'sharp', name: 'Kiki' },
	{ id: 'detailed', name: 'Intricate' },
	{ id: 'smoothed', name: 'Papered' },
	{ id: 'grayscale', name: 'Mono' },
	{ id: 'fixedpalette', name: 'Genlock' },
	{ id: 'randomsampling1', name: 'Logan' },
	{ id: 'randomsampling2', name: 'Clockwise' },
	{ id: 'artistic1', name: 'Theories' },
	{ id: 'artistic2', name: 'Dustbowl' },
	{ id: 'artistic3', name: 'Warrant' },
	{ id: 'artistic4', name: 'Sparkle' },
];

export const STROKES = [0, 0.5, 1, 2, 3, 5];
export const SCALES = [0.5, 1, 2, 3, 5];
export const SAMPLING = ['Generated', 'Random', 'Deterministic'];
export const LAYERING = ['Sequential', 'Parallel'];

// imagetracerjs treats 0 as no threshold; its presets use 0.01
export const LEAST_THRESHOLD = 0.01;

export const number = (value: number) =>
	Number.isInteger(value)
		? String(value)
		: String(Number(value.toPrecision(6)));

export const smoothing = (value: number) =>
	value < 0.05 ? '0.01' : value.toFixed(1);

export const whole = (value: number) => String(Math.round(value));

export const hundredths = (value: number) => value.toFixed(2);

/**
 * A preset's options over the defaults, keeping `scale`. Keys the tool has
 * no control for (pal, viewbox, desc, corsenabled) come back as extras.
 */
export function fromPreset(preset: Record<string, unknown>, scale: number) {
	const options: TracerOptions = { ...DEFAULT_OPTIONS };
	const extras: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(preset)) {
		if (key === 'scale') continue;
		if (key in options) Object.assign(options, { [key]: value });
		else extras[key] = value;
	}
	options.scale = scale;
	return { options, extras };
}

/** The options sent to the tracer: thresholds never below the least one. */
export function traceOptions(
	options: TracerOptions,
	extras: Record<string, unknown>,
) {
	return {
		...extras,
		...options,
		ltres: Math.max(options.ltres, LEAST_THRESHOLD),
		qtres: Math.max(options.qtres, LEAST_THRESHOLD),
	};
}

export interface TraceLayer {
	rgb: [number, number, number];
	opacity: number;
	strokeWidth: number;
	paths: number;
	lineCount: number;
	curveCount: number;
	/** The whole path data of every path of this colour. */
	d: string[];
	/** x0 y0 x1 y1 per straight segment. */
	lines: number[];
	/** x0 y0 cx cy x1 y1 per quadratic segment. */
	curves: number[];
	/** x y per node. */
	nodes: number[];
}

export interface TraceVectors {
	width: number;
	height: number;
	layers: TraceLayer[];
}

function attribute(tag: string, name: string) {
	return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1];
}

/** The root's size in user units: the viewBox, else numeric width and height. */
export function svgSize(svg: string) {
	const root = /<svg[^>]*>/.exec(svg)?.[0];
	if (!root) return undefined;
	const box = attribute(root, 'viewBox')
		?.split(/[\s,]+/)
		.map(Number);
	if (box?.length === 4 && box[2]! > 0 && box[3]! > 0)
		return { width: box[2]!, height: box[3]! };
	const width = Number(attribute(root, 'width'));
	const height = Number(attribute(root, 'height'));
	return width > 0 && height > 0 ? { width, height } : undefined;
}

/**
 * The paths imagetracerjs 1.2.6 writes, read back by colour: absolute M, L,
 * Q and Z, one `<path fill stroke stroke-width opacity d>` each. Control
 * point circles (lcpr, qcpr) are not paths and are skipped.
 */
export function parseTrace(svg: string): TraceVectors | undefined {
	const size = svgSize(svg);
	if (!size) return undefined;
	const layers: TraceLayer[] = [];
	const index = new Map<string, TraceLayer>();
	for (const element of svg.split('<path ').slice(1)) {
		const end = element.indexOf('/>');
		if (end < 0) continue;
		const tag = ` ${element.slice(0, end)}`;
		const fill = attribute(tag, 'fill');
		const data = attribute(tag, 'd');
		if (!fill || data === undefined) continue;
		const opacity = attribute(tag, 'opacity') ?? '1';
		// palette entries can share an RGB and differ in alpha
		const key = `${fill}|${opacity}`;
		let layer = index.get(key);
		if (!layer) {
			const rgb = (fill.match(/\d+/g) ?? []).map(Number);
			layer = {
				rgb:
					rgb.length === 3
						? (rgb as [
								number,
								number,
								number,
							])
						: [0, 0, 0],
				opacity: Number(opacity) || 0,
				strokeWidth:
					Number(
						attribute(tag, 'stroke-width'),
					) || 0,
				paths: 0,
				lineCount: 0,
				curveCount: 0,
				d: [],
				lines: [],
				curves: [],
				nodes: [],
			};
			index.set(key, layer);
			layers.push(layer);
		}
		layer.paths += 1;
		layer.d.push(data);
		const tokens = data.trim().split(/\s+/);
		let at = 0;
		let x = 0;
		let y = 0;
		const read = () => {
			const a = Number(tokens[at]);
			const b = Number(tokens[at + 1]);
			at += 2;
			return Number.isFinite(a) && Number.isFinite(b)
				? [a, b]
				: undefined;
		};
		while (at < tokens.length) {
			const command = tokens[at++];
			if (command === 'M') {
				const to = read();
				if (!to) break;
				[x, y] = to as [number, number];
				layer.nodes.push(x, y);
			} else if (command === 'L') {
				const to = read();
				if (!to) break;
				layer.lines.push(x, y, to[0]!, to[1]!);
				layer.lineCount += 1;
				[x, y] = to as [number, number];
				layer.nodes.push(x, y);
			} else if (command === 'Q') {
				const control = read();
				const to = read();
				if (!control || !to) break;
				layer.curves.push(
					x,
					y,
					control[0]!,
					control[1]!,
					to[0]!,
					to[1]!,
				);
				layer.curveCount += 1;
				[x, y] = to as [number, number];
				layer.nodes.push(x, y);
			}
		}
	}
	return { ...size, layers };
}

export const totals = (vectors: TraceVectors) =>
	vectors.layers.reduce(
		(sum, layer) => ({
			paths: sum.paths + layer.paths,
			lines: sum.lines + layer.lineCount,
			curves: sum.curves + layer.curveCount,
		}),
		{ paths: 0, lines: 0, curves: 0 },
	);

/** The layer colours that draw anything, 0 to 1. */
export const palette = (vectors: TraceVectors): Rgb[] =>
	vectors.layers
		.filter((layer) => layer.opacity > 0 && layer.paths > 0)
		.map(({ rgb }) => [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]);

export const OUTLINE_VALUE_LIMIT = 48;
export const OUTLINE_LINE_LIMIT = 240;

const cut = (text: string) =>
	text.length > OUTLINE_VALUE_LIMIT
		? `${text.slice(0, OUTLINE_VALUE_LIMIT - 8)}…`
		: text;

const shortened = (tag: string) =>
	tag
		.replace(/[\n\t]/g, ' ')
		.replace(
			/(["'])([^"']*)\1/g,
			(_, quote: string, value: string) =>
				[quote, cut(value), quote].join(''),
		);

/**
 * The markup indented, a line per tag or text run, long attribute values
 * cut, at most OUTLINE_LINE_LIMIT lines: the port of iOS SVGMarkup.outline.
 */
export function outline(svg: string): string {
	const lines: string[] = [];
	let hidden = 0;
	let depth = 0;
	let index = 0;
	const emit = (text: string, level: number) => {
		if (lines.length >= OUTLINE_LINE_LIMIT) {
			hidden += 1;
			return;
		}
		lines.push('  '.repeat(Math.max(level, 0)) + text);
	};
	const find = (marker: string, from: number) => {
		const at = svg.indexOf(marker, from);
		return at < 0 ? svg.length : at + marker.length;
	};
	while (index < svg.length) {
		if (svg[index] !== '<') {
			let end = svg.indexOf('<', index);
			if (end < 0) end = svg.length;
			const text = svg.slice(index, end).trim();
			if (text) emit(cut(text.replace(/\n/g, ' ')), depth);
			index = end;
			continue;
		}
		let end: number;
		if (svg.startsWith('<!--', index)) end = find('-->', index + 4);
		else if (svg.startsWith('<![CDATA[', index))
			end = find(']]>', index + 9);
		else {
			end = index + 1;
			let quote: string | undefined;
			while (end < svg.length) {
				const char = svg[end];
				if (quote) {
					if (char === quote) quote = undefined;
				} else if (char === '"' || char === "'")
					quote = char;
				else if (char === '>') break;
				end += 1;
			}
			end = Math.min(end + 1, svg.length);
		}
		const tag = svg.slice(index, end);
		const closing = svg.startsWith('</', index);
		const leaf =
			svg.startsWith('<!', index) ||
			svg.startsWith('<?', index) ||
			tag.endsWith('/>');
		if (closing) depth -= 1;
		emit(shortened(tag), depth);
		if (!closing && !leaf) depth += 1;
		index = end;
	}
	if (hidden > 0) lines.push(`<!-- ${hidden} more -->`);
	return lines.join('\n');
}
