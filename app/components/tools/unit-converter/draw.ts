/** UnitConverterPicture's draw(_:), as SVG markup. */
import {
	fromBase,
	labelWidth,
	stackFrames,
	tickLabel,
	ticks,
	toBase,
	weightsOf,
	type Instrument,
	type Pose,
	type Rect,
	type Unit,
} from 'delphitools-v2/components/tools/unit-converter/units';

export interface Scene {
	width: number;
	height: number;
	instrument: Instrument;
	from: Unit;
	to: Unit;
	hasValue: boolean;
	shown: Pose;
	/** The readout's box in the picture. */
	readout: Rect;
	/** Prefix for gradient and clip ids. */
	id: string;
}

const fg = 'var(--canon-foreground)';
const primary = 'var(--canon-primary)';
const muted = 'var(--canon-muted-foreground)';
const card = 'var(--canon-card)';
const mono = 'var(--canon-mono-font)';
const tickSize = 9;
const plateSize = 11;
const stemHeight = 14;
const balanceWidth = 560;

const mix = (colour: string, percent: number) =>
	`color-mix(in srgb, ${colour} ${percent}%, transparent)`;
const n = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
const esc = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function rect(r: Rect, style: string) {
	return `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(Math.max(0, r.width))}" height="${n(Math.max(0, r.height))}" style="${style}"/>`;
}

function path(d: string, style: string, extra = '') {
	return `<path d="${d}" style="${style}"${extra}/>`;
}

interface LabelOptions {
	size?: number;
	weight?: number;
	/** 0 start, 0.5 middle, 1 end; same for the vertical. */
	anchor?: [number, number];
	halo?: boolean;
}

function label(
	text: string,
	x: number,
	y: number,
	colour: string,
	{
		size = tickSize,
		weight = 500,
		anchor = [0, 0],
		halo = false,
	}: LabelOptions = {},
) {
	const across = ['start', 'middle', 'end'][anchor[0] * 2]!;
	const down = ['hanging', 'central', 'text-after-edge'][anchor[1] * 2]!;
	const haloStyle = halo
		? `stroke: ${card}; stroke-width: 3px; paint-order: stroke; stroke-linejoin: round;`
		: '';
	return `<text x="${n(x)}" y="${n(y)}" text-anchor="${across}" dominant-baseline="${down}" style="fill: ${colour}; font-family: ${mono}; font-size: ${size}px; font-weight: ${weight}; ${haloStyle}">${esc(text)}</text>`;
}

function plateWidth(scene: Scene) {
	const widest = Math.max(
		labelWidth(scene.from.symbol, plateSize),
		labelWidth(scene.to.symbol, plateSize),
	);
	return Math.max(36, Math.ceil(widest) + 12);
}

/** The unit's name plate at the start of its scale: ink for the from unit, primary for the result. */
function plate(unit: Unit, isResult: boolean, r: Rect) {
	return (
		rect(r, `fill: ${isResult ? primary : fg}`) +
		label(
			unit.symbol,
			r.x + r.width / 2,
			r.y + r.height / 2,
			isResult
				? 'var(--canon-primary-foreground)'
				: 'var(--canon-background)',
			{ size: plateSize, weight: 700, anchor: [0.5, 0.5] },
		)
	);
}

/** Graduates a rule from x0 to x1 at `edge`; `down` hangs the ticks below the edge, else they rise above it. */
function rule(
	scene: Scene,
	unit: Unit,
	x0: number,
	x1: number,
	edge: number,
	down: boolean,
	ink: string,
	outside: boolean,
) {
	const { lo, span } = scene.shown;
	let out = '';
	const lineHeight = 11;
	for (const tick of ticks(unit, lo, span, x1 - x0, 40, tickSize)) {
		const x = x0 + tick.offset;
		const length = tick.major ? 10 : 5;
		out += rect(
			{
				x: x - 0.5,
				y: down ? edge : edge - length,
				width: 1,
				height: length,
			},
			`fill: ${ink}`,
		);
		if (!tick.label) continue;
		const width = labelWidth(tick.label, tickSize);
		// no clipped numbers
		if (x + 3 + width > x1 + 2) continue;
		// inside clears minor ticks
		const y = outside
			? down
				? edge + length + 1
				: edge - length - 1 - lineHeight
			: down
				? edge + 5
				: edge - 5 - lineHeight;
		out += label(
			tick.label,
			outside ? x - width / 2 : x + 3,
			y,
			ink,
		);
	}
	return out;
}

function tape(scene: Scene, strip: Rect) {
	const plateW = plateWidth(scene);
	const height = Math.min(52, strip.height);
	const t = {
		x: strip.x + plateW + 8,
		y: strip.y + strip.height / 2 - height / 2,
		width: strip.width - plateW - 8,
		height,
	};
	if (t.width <= 20) return '';
	const { value, lo, span } = scene.shown;
	const end =
		t.x + Math.min(1, Math.max(0, (value - lo) / span)) * t.width;
	let out =
		plate(scene.from, false, {
			x: strip.x,
			y: t.y,
			width: plateW,
			height: height / 2 - 1,
		}) +
		plate(scene.to, true, {
			x: strip.x,
			y: t.y + height / 2 + 1,
			width: plateW,
			height: height / 2 - 1,
		});
	out += rect(t, `fill: ${card}`);
	out += rect(
		{ x: t.x, y: t.y, width: end - t.x, height: t.height },
		`fill: ${mix(primary, 14)}`,
	);
	out += rect(
		{
			x: t.x + 0.5,
			y: t.y + 0.5,
			width: t.width - 1,
			height: t.height - 1,
		},
		`fill: none; stroke: ${mix(muted, 60)}; stroke-width: 1`,
	);
	out += rule(
		scene,
		scene.from,
		t.x,
		t.x + t.width,
		t.y,
		true,
		fg,
		false,
	);
	out += rule(
		scene,
		scene.to,
		t.x,
		t.x + t.width,
		t.y + t.height,
		false,
		primary,
		false,
	);
	if (scene.hasValue)
		out += rect(
			{
				x: end - 1,
				y: t.y - 6,
				width: 2,
				height: t.height + 12,
			},
			`fill: ${primary}`,
		);
	return out;
}

function thermometer(scene: Scene, strip: Rect) {
	const plateW = plateWidth(scene);
	const tube = 12;
	const bulb = 13;
	const cy = strip.y + strip.height / 2;
	const bx = strip.x + plateW + 10 + bulb;
	const x0 = bx + bulb + 8;
	const x1 = strip.x + strip.width - 10;
	if (x1 - x0 <= 40) return '';
	const { value, lo, span } = scene.shown;
	const xFor = (base: number) => x0 + ((base - lo) / span) * (x1 - x0);
	const right = strip.x + strip.width;
	const clip = `${scene.id}-tube`;
	const shape = `M${n(bx)} ${n(cy - tube / 2)}H${n(right - tube / 2)}A6 6 0 0 1 ${n(right - tube / 2)} ${n(cy + tube / 2)}H${n(bx)}Z M${n(bx - bulb)} ${n(cy)}a${bulb} ${bulb} 0 1 1 ${bulb * 2} 0a${bulb} ${bulb} 0 1 1 ${-bulb * 2} 0Z`;
	let out =
		plate(scene.from, false, {
			x: strip.x,
			y: cy - 26,
			width: plateW,
			height: 20,
		}) +
		plate(scene.to, true, {
			x: strip.x,
			y: cy + 6,
			width: plateW,
			height: 20,
		});
	out += `<clipPath id="${clip}"><path d="${shape}"/></clipPath><g clip-path="url(#${clip})">`;
	out += rect(strip, `fill: ${card}`);
	// below absolute zero: muted
	if (lo < 0) {
		const edge = Math.min(xFor(0), right);
		out += rect(
			{
				x: bx,
				y: cy - tube,
				width: edge - bx,
				height: tube * 2,
			},
			'fill: var(--canon-muted)',
		);
	}
	if (scene.hasValue) {
		const level = Math.min(x1 + 6, Math.max(x0 - 6, xFor(value)));
		out += rect(
			{
				x: bx - bulb,
				y: cy - bulb,
				width: level - bx + bulb,
				height: bulb * 2,
			},
			`fill: ${primary}`,
		);
	}
	out += '</g>';
	out += path(
		shape,
		`fill: none; stroke: ${mix(muted, 60)}; stroke-width: 1`,
	);
	// water freezes and boils
	for (const x of [273.15, 373.15].map(xFor))
		if (x >= x0 && x <= x1)
			out += path(
				`M${n(x)} ${n(cy - 30)}V${n(cy + 30)}`,
				`fill: none; stroke: ${mix(muted, 45)}; stroke-width: 1; stroke-dasharray: 2 2`,
			);
	out += rule(
		scene,
		scene.from,
		x0,
		x1,
		cy - tube / 2 - 3,
		false,
		fg,
		true,
	);
	out += rule(
		scene,
		scene.to,
		x0,
		x1,
		cy + tube / 2 + 3,
		true,
		primary,
		true,
	);
	return out;
}

function gaugeRadius(kind: Instrument, height: number, width: number) {
	return Math.max(
		20,
		Math.min(
			(height - (kind === 'manometer' ? stemHeight : 0)) / 2,
			width / 2,
		),
	);
}

function metal(id: string, horizontal: boolean) {
	const end = horizontal ? 'x2="1" y2="0"' : 'x2="0" y2="1"';
	return `<linearGradient id="${id}" x1="0" y1="0" ${end}><stop offset="0" style="stop-color: ${mix(muted, 55)}"/><stop offset="1" style="stop-color: ${mix(muted, 20)}"/></linearGradient>`;
}

function arc(cx: number, cy: number, r: number, a: number, b: number) {
	const large = b - a > Math.PI ? 1 : 0;
	return `M${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}A${n(r)} ${n(r)} 0 ${large} 1 ${n(cx + Math.cos(b) * r)} ${n(cy + Math.sin(b) * r)}`;
}

function gauge(scene: Scene, box: Rect) {
	const kind = scene.instrument;
	const manometer = kind === 'manometer';
	const radius = gaugeRadius(kind, box.height, box.width);
	const cx = box.x + box.width / 2;
	const cy = box.y + radius;
	const bezel = Math.max(5, radius * 0.08);
	const face = radius - bezel;
	const start = manometer ? (Math.PI * 3) / 4 : (Math.PI * 5) / 6;
	const sweep = manometer ? (Math.PI * 3) / 2 : (Math.PI * 4) / 3;
	const point = (angle: number, distance: number) => [
		cx + Math.cos(angle) * distance,
		cy + Math.sin(angle) * distance,
	];
	const down = `${scene.id}-metal`;
	const across = `${scene.id}-across`;
	let out = `<defs>${metal(down, false)}${metal(across, true)}</defs>`;
	if (manometer) {
		const neck = {
			x: cx - 5,
			y: cy + radius - 2,
			width: 10,
			height: 6,
		};
		const nut = {
			x: cx - 13,
			y: neck.y + 6,
			width: 26,
			height: stemHeight - 5,
		};
		out +=
			rect(neck, `fill: url(#${across})`) +
			rect(nut, `fill: url(#${across})`);
		for (const x of [nut.x + 8, nut.x + nut.width - 8])
			out += rect(
				{ x, y: nut.y, width: 1, height: nut.height },
				`fill: ${mix(muted, 50)}`,
			);
	}
	out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radius)}" style="fill: url(#${down})"/>`;
	out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(face)}" style="fill: ${card}; stroke: ${mix(muted, 50)}; stroke-width: 1"/>`;

	const outer = face - 3;
	const inner = face * 0.56;
	const { value, lo, span } = scene.shown;
	const fraction = scene.hasValue
		? Math.min(1.02, Math.max(0, (value - lo) / span))
		: 0;
	const needle = start + sweep * fraction;
	if (scene.hasValue && fraction > 0)
		out += path(
			arc(
				cx,
				cy,
				inner + 2,
				start,
				Math.min(needle, start + sweep),
			),
			`fill: none; stroke: ${mix(primary, 25)}; stroke-width: 4`,
		);
	out += path(
		arc(cx, cy, inner, start, start + sweep),
		`fill: none; stroke: ${primary}; stroke-width: 1`,
	);

	const font = face > 70 ? 9 : 8;
	for (const [unit, ink, rim] of [
		[scene.from, fg, outer],
		[scene.to, primary, inner],
	] as const) {
		const isOuter = rim === outer;
		const reachOf = isOuter ? rim - 14 : rim - 11;
		const length = reachOf * sweep;
		for (const tick of ticks(
			unit,
			lo,
			span,
			length,
			isOuter ? 26 : 20,
			font,
		)) {
			const angle = start + (sweep * tick.offset) / length;
			const long = tick.major
				? isOuter
					? 7
					: 5
				: isOuter
					? 3.5
					: 2.5;
			const width = tick.major
				? kind === 'speedometer' && isOuter
					? 2
					: 1.2
				: 1;
			const [ax, ay] = point(angle, rim);
			const [bx, by] = point(angle, rim - long);
			out += path(
				`M${n(ax!)} ${n(ay!)}L${n(bx!)} ${n(by!)}`,
				`stroke: ${ink}; stroke-width: ${width}`,
			);
			if (!tick.label) continue;
			const w = labelWidth(tick.label, font);
			const h = font * 1.2;
			// inset by label extent
			const reach =
				(Math.abs(Math.cos(angle)) * w) / 2 +
				(Math.abs(Math.sin(angle)) * h) / 2;
			const [lx, ly] = point(angle, rim - long - 3 - reach);
			out += label(tick.label, lx!, ly!, ink, {
				size: font,
				anchor: [0.5, 0.5],
			});
		}
	}

	const symbol = face > 70 ? 11 : 10;
	out += label(scene.from.symbol, cx, cy + face * 0.42, fg, {
		size: symbol,
		weight: 700,
		anchor: [0.5, 0],
	});
	out += label(scene.to.symbol, cx, cy + face * 0.42 + 13, primary, {
		size: symbol,
		weight: 700,
		anchor: [0.5, 0],
	});

	if (scene.hasValue) {
		const [tx, ty] = point(needle, outer - 4);
		const [kx, ky] = point(needle + Math.PI, face * 0.18);
		const sx = Math.cos(needle + Math.PI / 2);
		const sy = Math.sin(needle + Math.PI / 2);
		const points = [
			[tx!, ty!],
			[cx + sx * 2.6, cy + sy * 2.6],
			[kx! + sx * 3.4, ky! + sy * 3.4],
			[kx! - sx * 3.4, ky! - sy * 3.4],
			[cx - sx * 2.6, cy - sy * 2.6],
		];
		out += path(
			`M${points.map(([x, y]) => `${n(x!)} ${n(y!)}`).join('L')}Z`,
			`fill: ${primary}; filter: drop-shadow(1px 2px 1.25px ${mix(fg, 30)})`,
		);
	}
	out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="6" style="fill: url(#${down}); stroke: ${muted}; stroke-width: 1"/>`;
	return out;
}

/** Two pans at one height, hung from far above: from-unit weights on the left, the same mass in result-unit weights on the right. */
function balance(scene: Scene, region: Rect, top: number) {
	const wire = mix(muted, 70);
	const centreX = region.x + region.width / 2;
	const panWidth = region.width * 0.47;
	const reach = region.width * 0.25;
	const centres = [centreX - reach, centreX + reach] as const;
	const rim = region.y + region.height - 12;
	// cords meet far above
	const hookY = region.y - region.height * 2.5;
	if (rim - top <= 40 || panWidth <= 40) return '';

	const quantity = scene.hasValue ? Math.max(0, scene.shown.value) : 0;
	const sides = [
		{ unit: scene.from, ink: fg },
		{ unit: scene.to, ink: primary },
	].map((side) => {
		const weights = weightsOf(fromBase(side.unit, quantity));
		return {
			...side,
			weights,
			mass: weights
				? toBase(side.unit, weights.denomination)
				: 0,
		};
	});
	// 1.6:1 ingots, side ∛mass
	const heaviest = Math.max(
		...sides.map((s) => s.mass),
		Number.MIN_VALUE,
	);
	const shapes = sides.map((side) => {
		const size = Math.cbrt(side.mass / heaviest);
		const blocks = side.weights
			? side.weights.full + (side.weights.part > 0 ? 1 : 0)
			: 0;
		return { width: 1.6 * size, height: size, blocks };
	});
	// within the cords, with room for labels
	const fits = (frames: Rect[][]) =>
		frames.every((stack, i) =>
			stack.every((frame) => {
				const apex = centres[i]!;
				const half =
					((panWidth / 2 - 4) *
						(frame.y - hookY)) /
					(rim - hookY);
				return (
					frame.y >= top + 16 &&
					frame.x >= apex - half + 3 &&
					frame.x + frame.width <= apex + half - 3
				);
			}),
		);
	const layout = (perLayer: number, unit: number) =>
		shapes.map((shape, i) =>
			stackFrames(shape, perLayer, unit, centres[i]!, rim),
		);
	let best = { frames: layout(1, 0), score: 0 };
	for (let perLayer = 1; perLayer <= 4; perLayer++) {
		let low = 2;
		let high = 80;
		for (let i = 0; i < 12; i++) {
			const unit = (low + high) / 2;
			if (fits(layout(perLayer, unit))) low = unit;
			else high = unit;
		}
		// tall towers score lower
		const layers = Math.max(
			...shapes.map((s) => Math.ceil(s.blocks / perLayer)),
		);
		const score = low * (layers > 4 ? 0.75 : 1);
		if (score > best.score)
			best = { frames: layout(perLayer, low), score };
	}

	const cords = `${scene.id}-cords`;
	const pan = `${scene.id}-pan`;
	let out = `<defs><linearGradient id="${cords}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(top)}" x2="0" y2="${n(top + 40)}"><stop offset="0" style="stop-color: ${wire}; stop-opacity: 0"/><stop offset="1" style="stop-color: ${wire}"/></linearGradient>${metal(pan, false)}</defs>`;
	for (const apex of centres)
		for (const x of [
			apex - panWidth / 2 + 4,
			apex + panWidth / 2 - 4,
		])
			out += path(
				`M${n(apex)} ${n(hookY)}L${n(x)} ${n(rim)}`,
				`stroke: url(#${cords}); stroke-width: 1`,
			);

	const font = 9;
	sides.forEach((side, s) => {
		const { weights, ink } = side;
		const frames = best.frames[s]!;
		if (!weights) return;
		const name = `${tickLabel(weights.denomination)} ${side.unit.symbol}`;
		const first = frames[0];
		const nameFits = first
			? labelWidth(name, font) + 6 <= first.width * 0.95 &&
				first.height >= 11
			: false;
		frames.forEach((r, index) => {
			const isPart = index === weights.full;
			const lip = Math.min(4, r.width * 0.1);
			const ingot = `M${n(r.x)} ${n(r.y + r.height)}L${n(r.x + lip)} ${n(r.y)}L${n(r.x + r.width - lip)} ${n(r.y)}L${n(r.x + r.width)} ${n(r.y + r.height)}Z`;
			const clip = `${scene.id}-ingot-${s}-${index}`;
			out += path(ingot, `fill: ${card}`);
			out += `<clipPath id="${clip}"><path d="${ingot}"/></clipPath>`;
			out += `<g clip-path="url(#${clip})">${rect(
				isPart
					? {
							...r,
							width:
								r.width *
								weights.part,
						}
					: r,
				`fill: ${mix(ink, 22)}`,
			)}</g>`;
			out += path(
				ingot,
				`fill: none; stroke: ${ink}; stroke-width: 1.2${isPart ? '; stroke-dasharray: 3 2' : ''}`,
			);
			const text = isPart
				? tickLabel(
						Math.round(weights.part * 100) /
							100,
					)
				: name;
			const shows = isPart
				? labelWidth(text, font) + 6 <= r.width &&
					r.height >= 11
				: nameFits;
			if (shows)
				out += label(
					text,
					r.x + r.width / 2,
					r.y + r.height / 2,
					ink,
					{
						size: font,
						weight: 600,
						anchor: [0.5, 0.5],
					},
				);
		});
		if (!nameFits && first) {
			const left = Math.min(...frames.map((f) => f.x));
			const right = Math.max(
				...frames.map((f) => f.x + f.width),
			);
			const topY = Math.min(...frames.map((f) => f.y));
			out += label(name, (left + right) / 2, topY - 3, ink, {
				size: font,
				weight: 600,
				anchor: [0.5, 1],
				halo: true,
			});
		}
	});

	for (const apex of centres) {
		const x0 = apex - panWidth / 2;
		const x1 = apex + panWidth / 2;
		const bottom = rim + 10;
		out += path(
			`M${n(x0)} ${n(rim)}L${n(x1)} ${n(rim)}C${n(x1 - panWidth * 0.15)} ${n(bottom + 1)} ${n(x0 + panWidth * 0.15)} ${n(bottom + 1)} ${n(x0)} ${n(rim)}Z`,
			`fill: url(#${pan})`,
		);
		out += path(
			`M${n(x0 - 1)} ${n(rim)}L${n(x1 + 1)} ${n(rim)}`,
			`stroke: ${mix(muted, 80)}; stroke-width: 1.5`,
		);
	}
	return out;
}

/** A measuring jug: the from scale up the left wall, the result up the right. */
function jug(scene: Scene, box: Rect) {
	const b = {
		x: box.x + 10,
		y: box.y + 8,
		width: box.width - 14,
		height: box.height - 8,
	};
	if (b.width <= 40 || b.height <= 40) return '';
	const right = b.x + b.width;
	const bottom = b.y + b.height;
	const corner = 12;
	const outline = `M${n(b.x - 9)} ${n(b.y - 6)}L${n(b.x)} ${n(b.y + 8)}L${n(b.x)} ${n(bottom - corner)}Q${n(b.x)} ${n(bottom)} ${n(b.x + corner)} ${n(bottom)}L${n(right - corner)} ${n(bottom)}Q${n(right)} ${n(bottom)} ${n(right)} ${n(bottom - corner)}L${n(right)} ${n(b.y)}`;
	const inside = `${outline}L${n(b.x - 9)} ${n(b.y - 6)}Z`;
	const zero = bottom - 4;
	const full = b.y + 22;
	const { value, lo, span } = scene.shown;
	const fraction = scene.hasValue
		? Math.min(1.04, Math.max(0, (value - lo) / span))
		: 0;
	const level = zero - fraction * (zero - full);
	const clip = `${scene.id}-jug`;
	let out = `<clipPath id="${clip}"><path d="${inside}"/></clipPath><g clip-path="url(#${clip})">`;
	out += rect(
		{
			x: b.x - 10,
			y: b.y - 10,
			width: b.width + 20,
			height: b.height + 20,
		},
		`fill: ${card}`,
	);
	if (scene.hasValue) {
		out += rect(
			{
				x: b.x - 10,
				y: level,
				width: b.width + 20,
				height: bottom - level + 2,
			},
			`fill: ${mix(primary, 16)}`,
		);
		out += rect(
			{ x: b.x, y: level - 1, width: b.width, height: 2 },
			`fill: ${primary}`,
		);
	}
	out += '</g>';
	out += path(
		outline,
		`fill: none; stroke: ${mix(muted, 70)}; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round`,
	);
	for (const [unit, ink, left] of [
		[scene.from, fg, true],
		[scene.to, primary, false],
	] as const) {
		const wallX = left ? b.x + 2 : right - 2;
		for (const tick of ticks(
			unit,
			lo,
			span,
			zero - full,
			22,
			tickSize,
		)) {
			const y = zero - tick.offset;
			const long = tick.major ? 9 : 5;
			out += rect(
				{
					x: left ? wallX : wallX - long,
					y: y - 0.5,
					width: long,
					height: 1,
				},
				`fill: ${ink}`,
			);
			if (!tick.label || tick.offset <= 0) continue;
			out += label(
				tick.label,
				left ? wallX + long + 3 : wallX - long - 3,
				y,
				ink,
				{
					anchor: [left ? 0 : 1, 0.5],
					halo: true,
				},
			);
		}
		out += label(
			unit.symbol,
			left ? wallX + 3 : wallX - 3,
			b.y + 4,
			left ? muted : ink,
			{
				size: 10,
				weight: 700,
				anchor: [left ? 0 : 1, 0],
			},
		);
	}
	return out;
}

/** The quantity and one result unit as squares to one scale, the quantity ruled in result units. */
function squares(scene: Scene, box: Rect) {
	const quantity = scene.hasValue ? Math.max(0, scene.shown.value) : 0;
	const unit = scene.shown.span;
	const largest = Math.max(quantity, unit);
	if (!(largest > 0) || !Number.isFinite(largest)) return '';
	const side = Math.min(box.width, box.height) - 2;
	const perRoot = side / Math.sqrt(largest);
	const qs = Math.sqrt(quantity) * perRoot;
	const us = Math.max(2, Math.sqrt(unit) * perRoot);
	const square = (length: number) => ({
		x: box.x + 1,
		y: box.y + box.height - 1 - length,
		width: length,
		height: length,
	});
	const q = square(qs);
	const u = square(us);
	let out = '';
	if (qs > 0.5) {
		out += rect(q, `fill: ${mix(fg, 6)}`);
		// ruled in result units
		const cells = qs / us;
		if (us >= 5 && cells > 1 && cells < 200)
			for (let offset = us; offset < qs - 0.5; offset += us) {
				out += rect(
					{
						x: q.x + offset,
						y: q.y,
						width: 1,
						height: q.height,
					},
					`fill: ${mix(primary, 30)}`,
				);
				out += rect(
					{
						x: q.x,
						y: q.y + q.height - offset,
						width: q.width,
						height: 1,
					},
					`fill: ${mix(primary, 30)}`,
				);
			}
		out += rect(q, `fill: none; stroke: ${fg}; stroke-width: 1.5`);
	}
	out += rect(
		u,
		`fill: ${mix(primary, 14)}; stroke: ${primary}; stroke-width: 1.5; stroke-dasharray: 4 3`,
	);
	const text = `1 ${scene.to.symbol}`;
	const width = labelWidth(text, 11);
	out +=
		us >= width + 10 && us >= 11 + 8
			? label(text, u.x + 5, u.y + 4, primary, {
					size: 11,
					weight: 700,
				})
			: label(text, u.x + u.width + 5, u.y - 2, primary, {
					size: 11,
					weight: 700,
					anchor: [0, 1],
				});
	return out;
}

/** The inner area: the panel padding, 12 px from the top. */
export function innerArea(width: number, height: number): Rect {
	return {
		x: 16,
		y: 12,
		width: Math.max(0, width - 32),
		height: Math.max(0, height - 12 - 16),
	};
}

export function isStrip(instrument: Instrument) {
	return instrument === 'tape' || instrument === 'thermometer';
}

/** Width the square instruments take on the leading side; the readout keeps to the rest. */
export function instrumentWidth(instrument: Instrument, area: Rect) {
	const most = area.width * 0.55;
	switch (instrument) {
		case 'speedometer':
		case 'manometer':
			return gaugeRadius(instrument, area.height, most) * 2;
		case 'jug':
			return Math.min(area.height * 0.8 + 16, most);
		case 'squares':
			return Math.min(area.height, most);
		default:
			return area.width;
	}
}

export function draw(scene: Scene): string {
	const area = innerArea(scene.width, scene.height);
	if (area.width <= 40 || area.height <= 40) return '';
	const { instrument, readout } = scene;
	const readoutBottom = readout.y + readout.height;
	if (instrument === 'balance') {
		// from left, result right
		const region = {
			...area,
			width: Math.min(area.width, balanceWidth),
		};
		const under =
			readout.x < region.x + region.width &&
			readout.x + readout.width > region.x;
		return balance(
			scene,
			region,
			under ? readoutBottom + 6 : area.y,
		);
	}
	if (isStrip(instrument)) {
		const top = readoutBottom + 6;
		const strip = {
			x: area.x,
			y: top,
			width: area.width,
			height: Math.max(0, area.y + area.height - top),
		};
		return instrument === 'tape'
			? tape(scene, strip)
			: thermometer(scene, strip);
	}
	const box = { ...area, width: instrumentWidth(instrument, area) };
	if (instrument === 'jug') return jug(scene, box);
	if (instrument === 'squares') return squares(scene, box);
	return gauge(scene, box);
}
