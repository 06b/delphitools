import {
	fromOklab,
	fromOklch,
	hex,
	oklab,
	oklch,
	parseHex,
	type Rgb,
} from 'delphicanon/lib/colour';

export type Mode = 'linear' | 'radial' | 'conic' | 'corners' | 'mesh';
export type Space = 'srgb' | 'oklab' | 'oklch';
export type CornerKey = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
export type GridSize = 2 | 3;

export interface Point {
	x: number;
	y: number;
}

export interface Stop {
	id: string;
	/** `#RRGGBB` */
	colour: string;
	/** 0...100 */
	position: number;
}

export interface MeshPoint extends Point {
	id: string;
	colour: string;
}

export type Corners = Record<CornerKey, string>;

export interface Gradient {
	mode: Mode;
	/** degrees, CSS: 0 up, clockwise */
	angle: number;
	/** radial and conic centre, unit */
	centre: Point;
	space: Space;
	stops: readonly Stop[];
	corners: Corners;
	points: readonly MeshPoint[];
	/** 0...100 */
	noise: number;
}

export const modes: Mode[] = ['linear', 'radial', 'conic', 'corners', 'mesh'];
export const modeTitles = ['Linear', 'Radial', 'Conic', 'Corners', 'Mesh'];
export const spaces: Space[] = ['srgb', 'oklab', 'oklch'];
export const spaceTitles = ['sRGB', 'OKLab', 'OKLCH'];
export const cornerKeys: CornerKey[] = [
	'topLeft',
	'topRight',
	'bottomLeft',
	'bottomRight',
];
export const cornerTitles = [
	'Top Left',
	'Top Right',
	'Bottom Left',
	'Bottom Right',
];

export const minStops = 2;
/** Pigment Blend is off once its result would pass this many stops (iOS Auto Step). */
export const blendLimit = 17;
const blendSteps = 3;

export const sizePresets = [
	{ label: '512', width: 512, height: 512 },
	{ label: '1K', width: 1024, height: 1024 },
	{ label: '2K', width: 2048, height: 2048 },
	{ label: '4K', width: 4096, height: 4096 },
	{ label: 'HD', width: 1920, height: 1080 },
	{ label: '4K HD', width: 3840, height: 2160 },
	{ label: 'Insta', width: 1080, height: 1080 },
	{ label: 'Story', width: 1080, height: 1920 },
];
export const minExport = 100;
export const maxExport = 8192;

export const clamp = (n: number, min: number, max: number) =>
	Math.max(min, Math.min(max, n));

export const wrapAngle = (degrees: number) => ((degrees % 360) + 360) % 360;

let counter = 0;
export const newId = () => `g${(counter += 1)}`;

export const rgbOf = (code: string): Rgb => parseHex(code) ?? [0, 0, 0];

export function sortStops(stops: readonly Stop[]): Stop[] {
	return [...stops].sort((a, b) => a.position - b.position);
}

// css4 powerless hue
const achromatic = 0.0005;

export function mix(a: Rgb, b: Rgb, t: number, space: Space): Rgb {
	if (space === 'srgb')
		return [
			a[0] + (b[0] - a[0]) * t,
			a[1] + (b[1] - a[1]) * t,
			a[2] + (b[2] - a[2]) * t,
		];
	if (space === 'oklab') {
		const p = oklab(a);
		const q = oklab(b);
		return fromOklab(
			p[0] + (q[0] - p[0]) * t,
			p[1] + (q[1] - p[1]) * t,
			p[2] + (q[2] - p[2]) * t,
		);
	}
	const p = oklch(a);
	const q = oklch(b);
	let from = p[2];
	let to = q[2];
	if (p[1] < achromatic) from = to;
	if (q[1] < achromatic) to = from;
	// shorter hue, css default
	let turn = (to - from) % 360;
	if (turn > 180) turn -= 360;
	else if (turn < -180) turn += 360;
	return fromOklch(
		p[0] + (q[0] - p[0]) * t,
		p[1] + (q[1] - p[1]) * t,
		from + turn * t,
	);
}

/** The gradient's colour at `at` percent, blended in `space`. */
export function colourAt(
	stops: readonly Stop[],
	at: number,
	space: Space,
): string {
	const sorted = sortStops(stops);
	const first = sorted[0];
	const last = sorted[sorted.length - 1];
	if (!first || !last) return '#808080';
	if (at <= first.position) return first.colour;
	const upper = sorted.findIndex((stop) => stop.position >= at);
	if (upper < 1) return last.colour;
	const a = sorted[upper - 1]!;
	const b = sorted[upper]!;
	const span = b.position - a.position;
	if (span <= 0) return b.colour;
	return hex(
		mix(
			rgbOf(a.colour),
			rgbOf(b.colour),
			(at - a.position) / span,
			space,
		),
	);
}

/**
 * Stops for an sRGB canvas gradient that draws the same as `space`:
 * padded to 0 and 1, with `samples` sub-steps per segment outside sRGB.
 */
export function ramp(
	stops: readonly Stop[],
	space: Space,
	samples = 24,
): { colour: string; offset: number }[] {
	const sorted = sortStops(stops).map((stop) => ({
		colour: stop.colour,
		offset: clamp(stop.position / 100, 0, 1),
	}));
	const first = sorted[0];
	const last = sorted[sorted.length - 1];
	if (!first || !last) return [];
	if (first.offset > 0) sorted.unshift({ ...first, offset: 0 });
	if (last.offset < 1) sorted.push({ ...last, offset: 1 });
	if (space === 'srgb') return sorted;
	const out = [sorted[0]!];
	for (let i = 1; i < sorted.length; i++) {
		const a = sorted[i - 1]!;
		const b = sorted[i]!;
		if (b.offset > a.offset && a.colour !== b.colour) {
			for (let step = 1; step < samples; step++) {
				const t = step / samples;
				out.push({
					colour: hex(
						mix(
							rgbOf(a.colour),
							rgbOf(b.colour),
							t,
							space,
						),
					),
					offset:
						a.offset +
						(b.offset - a.offset) * t,
				});
			}
		}
		out.push(b);
	}
	return out;
}

/** The middle of the widest gap between stops, in the colour already there. */
export function stopForWidestGap(stops: readonly Stop[], space: Space): Stop {
	const sorted = sortStops(stops);
	let widest = -1;
	let at = 50;
	for (let i = 1; i < sorted.length; i++) {
		const gap = sorted[i]!.position - sorted[i - 1]!.position;
		if (gap > widest) {
			widest = gap;
			at = sorted[i - 1]!.position + gap / 2;
		}
	}
	const position = Math.round(at);
	return {
		id: newId(),
		colour: colourAt(stops, position, space),
		position,
	};
}

export const canBlend = (stops: readonly Stop[]) =>
	stops.length >= minStops &&
	(stops.length - 1) * (blendSteps + 1) + 1 <= blendLimit;

/** The web tool's Pigment Blend: three OKLab steps between each pair. */
export function pigmentBlend(stops: readonly Stop[]): Stop[] {
	const sorted = sortStops(stops);
	const out: Stop[] = [];
	sorted.forEach((current, i) => {
		out.push(current);
		const next = sorted[i + 1];
		if (!next) return;
		const gap = next.position - current.position;
		for (let step = 1; step <= blendSteps; step++) {
			const t = step / (blendSteps + 1);
			out.push({
				id: newId(),
				colour: hex(
					mix(
						rgbOf(current.colour),
						rgbOf(next.colour),
						t,
						'oklab',
					),
				),
				position: Math.round(
					current.position + gap * t,
				),
			});
		}
	});
	return out;
}

const meshColours2 = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B'];
const meshColours3 = [
	'#3B82F6',
	'#8B5CF6',
	'#EC4899',
	'#10B981',
	'#6366F1',
	'#F59E0B',
	'#06B6D4',
	'#84CC16',
	'#EF4444',
];

/** The web tool's grid colours, inset as on iOS so every handle sits on the image. */
export function seedGrid(size: GridSize): MeshPoint[] {
	const colours = size === 2 ? meshColours2 : meshColours3;
	const step = 0.7 / (size - 1);
	return colours.slice(0, size * size).map((colour, index) => ({
		id: newId(),
		x: 0.15 + (index % size) * step,
		y: 0.15 + Math.floor(index / size) * step,
		colour,
	}));
}

// web weights: inverse square, softened
const meshWeight = (dx: number, dy: number) => 1 / (dx * dx + dy * dy + 0.01);

/** The mesh colour at a unit point, as the renderer blends it. */
export function meshColour(points: readonly MeshPoint[], at: Point): string {
	let total = 0;
	const sum = [0, 0, 0];
	for (const point of points) {
		const weight = meshWeight(at.x - point.x, at.y - point.y);
		const rgb = rgbOf(point.colour);
		total += weight;
		sum[0]! += rgb[0] * weight;
		sum[1]! += rgb[1] * weight;
		sum[2]! += rgb[2] * weight;
	}
	if (!total) return '#808080';
	return hex([sum[0]! / total, sum[1]! / total, sum[2]! / total]);
}

// geometry

/** The CSS gradient line for `angle` in a w by h box. */
export function cssLine(angle: number, width: number, height: number) {
	const radians = (angle * Math.PI) / 180;
	const dx = Math.sin(radians);
	const dy = -Math.cos(radians);
	const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
	return {
		start: { x: width / 2 - dx * half, y: height / 2 - dy * half },
		end: { x: width / 2 + dx * half, y: height / 2 + dy * half },
	};
}

export function farthestCorner(centre: Point, width: number, height: number) {
	return Math.hypot(
		Math.max(centre.x, width - centre.x),
		Math.max(centre.y, height - centre.y),
	);
}

/** Where a gradient's stops sit: a line, or a ring clockwise from `start` degrees, 0 up. */
export type Rail =
	| { kind: 'line'; from: Point; to: Point }
	| { kind: 'ring'; centre: Point; radius: number; start: number };

/** `t` is 0...1. */
export function railPoint(rail: Rail, t: number): Point {
	if (rail.kind === 'line')
		return {
			x: rail.from.x + (rail.to.x - rail.from.x) * t,
			y: rail.from.y + (rail.to.y - rail.from.y) * t,
		};
	const radians = ((rail.start + t * 360) * Math.PI) / 180;
	return {
		x: rail.centre.x + rail.radius * Math.sin(radians),
		y: rail.centre.y - rail.radius * Math.cos(radians),
	};
}

/** Unit vector off the rail at `t`: left of the line, or out of the ring. */
export function railNormal(rail: Rail, t: number): Point {
	if (rail.kind === 'line') {
		const dx = rail.to.x - rail.from.x;
		const dy = rail.to.y - rail.from.y;
		const length = Math.max(1, Math.hypot(dx, dy));
		return { x: -dy / length, y: dx / length };
	}
	const radians = ((rail.start + t * 360) * Math.PI) / 180;
	return { x: Math.sin(radians), y: -Math.cos(radians) };
}

/** Position along the rail (ring: 0...1 exclusive) and the signed distance off it along the normal. */
export function railProject(rail: Rail, p: Point) {
	if (rail.kind === 'line') {
		const dx = rail.to.x - rail.from.x;
		const dy = rail.to.y - rail.from.y;
		const lengthSquared = Math.max(1, dx * dx + dy * dy);
		return {
			t:
				((p.x - rail.from.x) * dx +
					(p.y - rail.from.y) * dy) /
				lengthSquared,
			off:
				((p.x - rail.from.x) * -dy +
					(p.y - rail.from.y) * dx) /
				Math.sqrt(lengthSquared),
		};
	}
	let t = (bearing(rail.centre, p) - rail.start) / 360;
	t -= Math.floor(t);
	return {
		t,
		off:
			Math.hypot(p.x - rail.centre.x, p.y - rail.centre.y) -
			rail.radius,
	};
}

/** Degrees clockwise from up. */
export const bearing = (from: Point, to: Point) =>
	(Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI;

/** Degrees a turn snaps to a multiple of 45 from. */
export const snapReach = 4;

export function snapAngle(degrees: number): {
	degrees: number;
	snapped: boolean;
} {
	const wrapped = wrapAngle(degrees);
	const nearest = Math.round(wrapped / 45) * 45;
	if (Math.abs(wrapped - nearest) < snapReach)
		return { degrees: wrapAngle(nearest), snapped: true };
	return { degrees: Math.round(wrapped) % 360, snapped: false };
}

// css

const percent = (value: number) => `${Math.round(value * 10) / 10}%`;

export function gradientCss(g: Gradient, fmt: (code: string) => string) {
	const method = g.space === 'srgb' ? '' : ` in ${g.space}`;
	const list = () =>
		sortStops(g.stops)
			.map(
				(stop) =>
					`${fmt(stop.colour)} ${percent(stop.position)}`,
			)
			.join(',\n  ');
	const at = `at ${percent(g.centre.x * 100)} ${percent(g.centre.y * 100)}`;
	const angle = `${Math.round(g.angle)}deg`;
	switch (g.mode) {
		case 'linear':
			return `background: linear-gradient(${angle}${method},\n  ${list()});`;
		case 'radial':
			return `background: radial-gradient(circle ${at}${method},\n  ${list()});`;
		case 'conic':
			return `background: conic-gradient(from ${angle} ${at}${method},\n  ${list()});`;
		case 'corners': {
			const c = g.corners;
			return `background:
  radial-gradient(ellipse at top left, ${fmt(c.topLeft)}, transparent 70%),
  radial-gradient(ellipse at top right, ${fmt(c.topRight)}, transparent 70%),
  radial-gradient(ellipse at bottom left, ${fmt(c.bottomLeft)}, transparent 70%),
  radial-gradient(ellipse at bottom right, ${fmt(c.bottomRight)}, transparent 70%);`;
		}
		case 'mesh': {
			const layers = g.points
				.map(
					(p) =>
						`radial-gradient(circle at ${Math.round(p.x * 100)}% ${Math.round(p.y * 100)}%, ${fmt(p.colour)}, transparent 60%)`,
				)
				.join(',\n  ');
			return `/* Mesh gradients cannot be perfectly replicated in CSS.
   Use image export for accurate results.
   Below is a rough approximation: */
background: ${layers};`;
		}
	}
}

// drawing

const byte = (v: number) => Math.round(clamp(v, 0, 1) * 255);

function fillPixels(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	colourAtPixel: (u: number, v: number) => Rgb,
) {
	const image = ctx.createImageData(width, height);
	const data = image.data;
	for (let y = 0; y < height; y++) {
		const v = height > 1 ? y / (height - 1) : 0;
		for (let x = 0; x < width; x++) {
			const rgb = colourAtPixel(
				width > 1 ? x / (width - 1) : 0,
				v,
			);
			const i = (y * width + x) * 4;
			data[i] = byte(rgb[0]);
			data[i + 1] = byte(rgb[1]);
			data[i + 2] = byte(rgb[2]);
			data[i + 3] = 255;
		}
	}
	ctx.putImageData(image, 0, 0);
}

function drawStops(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	g: Gradient,
) {
	let gradient: CanvasGradient;
	const centre = { x: g.centre.x * width, y: g.centre.y * height };
	if (g.mode === 'radial') {
		gradient = ctx.createRadialGradient(
			centre.x,
			centre.y,
			0,
			centre.x,
			centre.y,
			farthestCorner(centre, width, height),
		);
	} else if (g.mode === 'conic') {
		// canvas starts at +x
		gradient = ctx.createConicGradient(
			((g.angle - 90) * Math.PI) / 180,
			centre.x,
			centre.y,
		);
	} else {
		const line = cssLine(g.angle, width, height);
		gradient = ctx.createLinearGradient(
			line.start.x,
			line.start.y,
			line.end.x,
			line.end.y,
		);
	}
	for (const stop of ramp(g.stops, g.space))
		gradient.addColorStop(stop.offset, stop.colour);
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, width, height);
}

function drawCorners(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	corners: Corners,
) {
	const tl = rgbOf(corners.topLeft);
	const tr = rgbOf(corners.topRight);
	const bl = rgbOf(corners.bottomLeft);
	const br = rgbOf(corners.bottomRight);
	const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [
		a[0] + (b[0] - a[0]) * t,
		a[1] + (b[1] - a[1]) * t,
		a[2] + (b[2] - a[2]) * t,
	];
	fillPixels(ctx, width, height, (u, v) =>
		lerp(lerp(tl, tr, u), lerp(bl, br, u), v),
	);
}

function drawMesh(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	points: readonly MeshPoint[],
) {
	if (!points.length) return;
	const weighted = points.map((p) => ({
		x: p.x,
		y: p.y,
		rgb: rgbOf(p.colour),
	}));
	fillPixels(ctx, width, height, (u, v) => {
		let total = 0;
		let r = 0;
		let gr = 0;
		let b = 0;
		for (const point of weighted) {
			const weight = meshWeight(u - point.x, v - point.y);
			total += weight;
			r += point.rgb[0] * weight;
			gr += point.rgb[1] * weight;
			b += point.rgb[2] * weight;
		}
		return [r / total, gr / total, b / total];
	});
}

// xorshift: the same grain on every draw, so a drag does not shimmer
function grain(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	noise: number,
) {
	if (noise <= 0) return;
	const image = ctx.getImageData(0, 0, width, height);
	const data = image.data;
	const amount = (noise / 100) * 50;
	let state = 0x9e3779b9;
	for (let i = 0; i < data.length; i += 4) {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		const offset = ((state >>> 0) / 0xffffffff - 0.5) * 2 * amount;
		data[i] = data[i]! + offset;
		data[i + 1] = data[i + 1]! + offset;
		data[i + 2] = data[i + 2]! + offset;
	}
	ctx.putImageData(image, 0, 0);
}

export function renderGradient(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
	g: Gradient,
) {
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d', {
		willReadFrequently: g.noise > 0,
	});
	if (!ctx) return;
	if (g.mode === 'corners') drawCorners(ctx, width, height, g.corners);
	else if (g.mode === 'mesh') drawMesh(ctx, width, height, g.points);
	else drawStops(ctx, width, height, g);
	grain(ctx, width, height, g.noise);
}

// launch flags

export interface LaunchFlags {
	mode?: Mode;
	space?: Space;
	angle?: number;
	centre?: Point;
	stops?: Stop[];
	blends: number;
	size?: { width: number; height: number };
	noise?: number;
	select: number;
}

const iosTypes: Mode[] = ['linear', 'radial', 'conic', 'mesh'];

/**
 * The iOS launch arguments as query flags: ?gradType=<0 linear, 1 radial,
 * 2 conic, 3 mesh, or a mode name> ?gradSpace=<0 srgb, 1 oklab, 2 oklch>
 * ?gradAngle=<degrees> ?gradCentre=30,40 ?gradStops=ffd400@0,0033ff@100
 * ?gradAutoStep=<taps> ?gradSize=1080x1920 ?gradNoise=<0...100>
 * ?gradSelect=<index in position order>
 */
export function launchFlags(search: string): LaunchFlags {
	const query = new URLSearchParams(search);
	const number = (key: string) => {
		const text = query.get(key);
		if (text === null || text.trim() === '') return undefined;
		const value = Number(text);
		return Number.isFinite(value) ? value : undefined;
	};
	const flags: LaunchFlags = {
		blends: clamp(Math.floor(number('gradAutoStep') ?? 0), 0, 4),
		select: Math.max(0, Math.floor(number('gradSelect') ?? 0)),
	};
	const type = query.get('gradType');
	if (type !== null)
		flags.mode = modes.includes(type as Mode)
			? (type as Mode)
			: iosTypes[Number(type)];
	const space = number('gradSpace');
	if (space !== undefined) flags.space = spaces[space];
	const angle = number('gradAngle');
	if (angle !== undefined) flags.angle = wrapAngle(angle);
	const centre = query.get('gradCentre')?.split(',').map(Number);
	if (centre?.length === 2 && centre.every(Number.isFinite))
		flags.centre = {
			x: clamp(centre[0]! / 100, 0, 1),
			y: clamp(centre[1]! / 100, 0, 1),
		};
	const stops = (query.get('gradStops') ?? '')
		.split(',')
		.map((entry): Stop | undefined => {
			const [code, at] = entry.split('@');
			const rgb = parseHex(code ?? '');
			const position = Number(at);
			if (
				!rgb ||
				at === undefined ||
				!Number.isFinite(position)
			)
				return undefined;
			return {
				id: newId(),
				colour: hex(rgb),
				position: clamp(position, 0, 100),
			};
		})
		.filter((stop): stop is Stop => stop !== undefined);
	if (stops.length >= minStops) flags.stops = stops;
	const size = query.get('gradSize')?.split('x').map(Number);
	if (size?.length === 2 && size.every(Number.isFinite))
		flags.size = {
			width: clamp(
				Math.round(size[0]!),
				minExport,
				maxExport,
			),
			height: clamp(
				Math.round(size[1]!),
				minExport,
				maxExport,
			),
		};
	const noise = number('gradNoise');
	if (noise !== undefined) flags.noise = clamp(noise, 0, 100);
	return flags;
}
