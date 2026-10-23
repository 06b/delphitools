export interface MaskShape {
	id: string;
	label: string;
	d: string;
}

export const VARIANTS = 12;

// paths in 0..100 viewbox
const C = 50;
const R = 46;
const TAU = Math.PI * 2;
const ARC = 96;

type Pt = [number, number];
type Rnd = () => number;

const fix = (n: number) => String(Math.round(n * 100) / 100);

const polar = (angle: number, r: number, cx = C, cy = C): Pt => [
	cx + r * Math.cos(angle),
	cy + r * Math.sin(angle),
];

const ring = (
	n: number,
	radius: (k: number) => number,
	start = -Math.PI / 2,
	cx = C,
	cy = C,
): Pt[] =>
	Array.from({ length: n }, (_, k) =>
		polar(start + (k / n) * TAU, radius(k), cx, cy),
	);

const sample = (n: number, at: (t: number) => Pt): Pt[] =>
	Array.from({ length: n }, (_, k) => at((k / n) * TAU));

const rotate = (pts: Pt[], turns: number): Pt[] => {
	const c = Math.cos(turns * TAU);
	const s = Math.sin(turns * TAU);
	return pts.map(([x, y]) => [
		C + (x - C) * c - (y - C) * s,
		C + (x - C) * s + (y - C) * c,
	]);
};

// shared factor keeps proportions
const fit = (parts: Pt[][]): Pt[][] => {
	const reach = Math.max(
		...parts.flat().map(([x, y]) => Math.hypot(x - C, y - C)),
	);
	const k = Math.min(1, R / reach);
	return parts.map((pts) =>
		pts.map(([x, y]) => [C + (x - C) * k, C + (y - C) * k]),
	);
};

const poly = (pts: Pt[]) =>
	`M${pts.map(([x, y]) => `${fix(x)} ${fix(y)}`).join('L')}Z`;

// closed catmull-rom cubics
const smooth = (pts: Pt[]) => {
	const n = pts.length;
	const at = (i: number) => pts[(i + n) % n]!;
	let d = `M${fix(at(0)[0])} ${fix(at(0)[1])}`;
	for (let i = 0; i < n; i++) {
		const [p0, p1, p2, p3] = [
			at(i - 1),
			at(i),
			at(i + 1),
			at(i + 2),
		];
		const c1: Pt = [
			p1[0] + (p2[0] - p0[0]) / 6,
			p1[1] + (p2[1] - p0[1]) / 6,
		];
		const c2: Pt = [
			p2[0] - (p3[0] - p1[0]) / 6,
			p2[1] - (p3[1] - p1[1]) / 6,
		];
		d += `C${fix(c1[0])} ${fix(c1[1])} ${fix(c2[0])} ${fix(c2[1])} ${fix(p2[0])} ${fix(p2[1])}`;
	}
	return d + 'Z';
};

const spin = (turns: number, ...parts: Pt[][]) =>
	fit(parts.map((pts) => rotate(pts, turns)))
		.map(poly)
		.join('');

// clockwise winding, r=0 safe
const rrect = (x: number, y: number, w: number, h: number, r: number): Pt[] => {
	const corners: [number, number, number][] = [
		[x + w - r, y + r, -0.25],
		[x + w - r, y + h - r, 0],
		[x + r, y + h - r, 0.25],
		[x + r, y + r, 0.5],
	];
	return corners.flatMap(([cx, cy, start]) =>
		Array.from({ length: 13 }, (_, k) =>
			polar((start + (k / 12) * 0.25) * TAU, r, cx, cy),
		),
	);
};

// mulberry32
const seeded =
	(seed: number): Rnd =>
	() => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};

const count = (rnd: Rnd, from: number, span: number) =>
	from + Math.floor(rnd() * span);

const HEART = sample(ARC, (t) => {
	const s = R / 17;
	return [
		C + 16 * Math.sin(t) ** 3 * s,
		C -
			(13 * Math.cos(t) -
				5 * Math.cos(2 * t) -
				2 * Math.cos(3 * t) -
				Math.cos(4 * t) +
				2) *
				s,
	];
});

const DROP = (() => {
	const r = 0.68 * R;
	const cy = C + R - r;
	const beta = Math.acos(r / (2 * R - r));
	const from = -Math.PI / 2 + beta;
	const sweep = TAU - 2 * beta;
	return [
		[C, C - R] as Pt,
		...Array.from({ length: 65 }, (_, k) =>
			polar(from + (k / 64) * sweep, r, C, cy),
		),
	];
})();

const LEAF = sample(ARC, (t) => [
	C + R * Math.cos(t),
	C + 0.58 * R * Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** 1.7,
]);

const EGG = sample(ARC, (t) => [
	C + 0.78 * R * Math.cos(t) * (1 + 0.18 * Math.sin(t)),
	C + 0.95 * R * Math.sin(t),
]);

const ARROW: Pt[] = [
	[C - R, C - 0.22 * R],
	[C + 0.1 * R, C - 0.22 * R],
	[C + 0.1 * R, C - 0.55 * R],
	[C + R, C],
	[C + 0.1 * R, C + 0.55 * R],
	[C + 0.1 * R, C + 0.22 * R],
	[C - R, C + 0.22 * R],
];

const BOLT: Pt[] = [
	[56, 4],
	[24, 56],
	[45, 56],
	[40, 96],
	[76, 44],
	[55, 44],
	[62, 4],
];

const BUBBLE_BODY = rrect(C - R, C - R, 2 * R, 1.5 * R, 0.3 * R);
const BUBBLE_TAIL: Pt[] = [
	[C - 0.35 * R, C + 0.3 * R],
	[C + 0.05 * R, C + 0.3 * R],
	[C - 0.55 * R, C + R],
];

const cross = (a: number): Pt[] => [
	[C - a, C - R],
	[C + a, C - R],
	[C + a, C - a],
	[C + R, C - a],
	[C + R, C + a],
	[C + a, C + a],
	[C + a, C + R],
	[C - a, C + R],
	[C - a, C + a],
	[C - R, C + a],
	[C - R, C - a],
	[C - a, C - a],
];

const gear = (n: number): Pt[] => {
	const step = TAU / n;
	return Array.from(
		{ length: n },
		(_, k) => k * step - Math.PI / 2,
	).flatMap((a) => [
		polar(a - 0.3 * step, 0.76 * R),
		polar(a - 0.17 * step, R),
		polar(a + 0.17 * step, R),
		polar(a + 0.3 * step, 0.76 * R),
	]);
};

const pie = (turns: number): Pt[] => [
	[C, C],
	...Array.from({ length: 65 }, (_, k) =>
		polar(-Math.PI / 2 + (k / 64) * turns * TAU, R),
	),
];

// disc minus shifted copy
const moon = (d: number): Pt[] => {
	const phi = Math.acos(d / (2 * R));
	const outer = Array.from({ length: 65 }, (_, k) =>
		polar(phi + (k / 64) * (TAU - 2 * phi), R),
	);
	const inner = Array.from({ length: 65 }, (_, k) =>
		polar(Math.PI + phi - (k / 64) * 2 * phi, R, C + d),
	);
	return [...outer, ...inner];
};

const jittered = (
	rnd: Rnd,
	n: number,
	radius: (k: number) => number,
	jitter = 0.5,
): Pt[] => {
	const start = rnd() * TAU;
	return Array.from({ length: n }, (_, k) =>
		polar(
			start + ((k + (rnd() - 0.5) * jitter) / n) * TAU,
			radius(k),
		),
	);
};

const blob = (rnd: Rnd, lobes: number, floor: number): Pt[] =>
	jittered(rnd, lobes, () => R * (floor + (1 - floor) * rnd()));

const splat = (rnd: Rnd): Pt[] =>
	jittered(rnd, 2 * count(rnd, 5, 5), (k) =>
		k % 2 ? R * (0.5 + 0.2 * rnd()) : R * (0.85 + 0.15 * rnd()),
	);

const shard = (rnd: Rnd): Pt[] =>
	jittered(rnd, count(rnd, 4, 4), () => R * (0.7 + 0.3 * rnd()), 0.6);

// inward bites stay in-box
const torn = (rnd: Rnd): Pt[] => {
	const a = 0.92 * R;
	const b = a * (0.65 + 0.35 * rnd());
	const edge = (from: Pt, to: Pt, nx: number, ny: number): Pt[] =>
		Array.from({ length: 10 }, (_, k) => {
			const t = k / 10;
			const bite = rnd() * 0.12 * R;
			return [
				from[0] + (to[0] - from[0]) * t + nx * bite,
				from[1] + (to[1] - from[1]) * t + ny * bite,
			];
		});
	return [
		...edge([C - a, C - b], [C + a, C - b], 0, 1),
		...edge([C + a, C - b], [C + a, C + b], -1, 0),
		...edge([C + a, C + b], [C - a, C + b], 0, -1),
		...edge([C - a, C + b], [C - a, C - b], 1, 0),
	];
};

const cloud = (rnd: Rnd): Pt[][] => {
	const puffs = count(rnd, 3, 3);
	return [
		rrect(C - 0.75 * R, C + 0.1 * R, 1.5 * R, 0.4 * R, 0.2 * R),
		...Array.from({ length: puffs }, (_, k) => {
			const cx = C + (k / (puffs - 1) - 0.5) * 1.1 * R;
			const cy = C + (0.1 - 0.15 * rnd()) * R;
			const big =
				k === Math.floor(puffs / 2)
					? 0.5
					: 0.3 + 0.15 * rnd();
			const r = Math.min(
				R * big,
				R - Math.hypot(cx - C, cy - C),
			);
			return ring(48, () => r, 0, cx, cy);
		}),
	];
};

// holes inside body floor
const puddle = (rnd: Rnd): Pt[][] => [
	blob(rnd, count(rnd, 6, 4), 0.62),
	...Array.from({ length: count(rnd, 1, 3) }, () => {
		const [cx, cy] = polar(rnd() * TAU, rnd() * 0.22 * R);
		return ring(
			count(rnd, 5, 3),
			() => R * (0.12 + 0.12 * rnd()),
			rnd() * TAU,
			cx,
			cy,
		).reverse();
	}),
];

const pixel = (rnd: Rnd): Pt[][] => {
	const n = 9;
	const cell = (2 * R) / n;
	const radii = Array.from({ length: 7 }, () => 0.55 + 0.45 * rnd());
	const start = rnd() * TAU;
	const radiusAt = (angle: number) => {
		const u = ((((angle - start) / TAU) % 1) + 1) % 1;
		const k = Math.floor(u * radii.length);
		const f = u * radii.length - k;
		return (
			R *
			(radii[k % radii.length]! * (1 - f) +
				radii[(k + 1) % radii.length]! * f)
		);
	};
	const squares: Pt[][] = [];
	for (let gy = 0; gy < n; gy++) {
		for (let gx = 0; gx < n; gx++) {
			const x = C - R + gx * cell;
			const y = C - R + gy * cell;
			const mx = x + cell / 2 - C;
			const my = y + cell / 2 - C;
			if (Math.hypot(mx, my) < radiusAt(Math.atan2(my, mx))) {
				squares.push([
					[x, y],
					[x + cell, y],
					[x + cell, y + cell],
					[x, y + cell],
				]);
			}
		}
	}
	return squares;
};

const families: [string, (i: number, t: number, rnd: Rnd) => string][] = [
	['polygon', (i) => poly(ring(i + 3, () => R))],
	[
		'squircle',
		(i) => {
			const p = 2 + i * 1.5;
			const f = (v: number) =>
				Math.sign(v) * Math.abs(v) ** (2 / p);
			return poly(
				sample(ARC, (a) => [
					C + R * f(Math.cos(a)),
					C + R * f(Math.sin(a)),
				]),
			);
		},
	],
	['rounded', (_, t) => poly(rrect(C - R, C - R, 2 * R, 2 * R, t * R))],
	[
		'pill',
		(_, t) => {
			const h = 2 * R * (1 - 0.7 * t);
			return poly(rrect(C - R, C - h / 2, 2 * R, h, h / 2));
		},
	],
	['star', (i) => poly(ring(2 * (i + 3), (k) => (k % 2 ? 0.5 * R : R)))],
	[
		'burst',
		(i) =>
			poly(
				ring(2 * (8 + 2 * i), (k) =>
					k % 2 ? 0.8 * R : R,
				),
			),
	],
	[
		'crown',
		(_, __, rnd) =>
			poly(
				jittered(
					rnd,
					2 * count(rnd, 8, 7),
					(k) =>
						k % 2
							? R *
								(0.6 +
									0.25 *
										rnd())
							: R,
					0.3,
				),
			),
	],
	[
		'flower',
		(i) => smooth(ring(2 * (i + 3), (k) => (k % 2 ? 0.6 * R : R))),
	],
	[
		'seal',
		(i) => smooth(ring(2 * (8 + i), (k) => (k % 2 ? 0.86 * R : R))),
	],
	[
		'gear',
		(i) =>
			poly(gear(5 + i)) +
			poly(ring(48, () => 0.3 * R).reverse()),
	],
	['cross', (_, t) => poly(cross(R * (0.12 + 0.63 * t)))],
	[
		'ring',
		(_, t) =>
			poly(ring(ARC, () => R)) +
			poly(ring(ARC, () => 0.78 * R * t).reverse()),
	],
	['pie', (_, t) => poly(pie(0.25 + 0.7 * t))],
	['moon', (_, t) => poly(moon(2 * R * (0.35 + 0.6 * t)))],
	['blob', (_, __, rnd) => smooth(blob(rnd, count(rnd, 5, 4), 0.62))],
	['splat', (_, __, rnd) => smooth(splat(rnd))],
	['puddle', (_, __, rnd) => puddle(rnd).map(smooth).join('')],
	['cloud', (_, __, rnd) => cloud(rnd).map(poly).join('')],
	['shard', (_, __, rnd) => poly(shard(rnd))],
	['torn', (_, __, rnd) => poly(torn(rnd))],
	['pixel', (_, __, rnd) => pixel(rnd).map(poly).join('')],
	['heart', (i) => spin(i / VARIANTS, HEART)],
	['drop', (i) => spin(i / VARIANTS, DROP)],
	['leaf', (i) => spin(i / VARIANTS + 1 / 8, LEAF)],
	['egg', (i) => spin(i / VARIANTS, EGG)],
	['arrow', (i) => spin(i / VARIANTS, ARROW)],
	['bolt', (i) => spin(i / VARIANTS, BOLT)],
	['bubble', (i) => spin(i / VARIANTS, BUBBLE_BODY, BUBBLE_TAIL)],
];

export const MASK_COLUMNS = families.length;

export const MASK_FAMILIES = families.map(([id]) => id);

// shuffle breaks family columns
export const MASK_SHAPES: MaskShape[] = (() => {
	const all = families.flatMap(([id, at], f) =>
		Array.from({ length: VARIANTS }, (_, i) => ({
			id: `${id}-${i + 1}`,
			label: `${id[0]!.toUpperCase()}${id.slice(1)} ${i + 1}`,
			d: at(
				i,
				i / (VARIANTS - 1),
				seeded(f * 131 + i * 7 + 1),
			),
		})),
	);
	const rnd = seeded(7);
	for (let i = all.length - 1; i > 0; i--) {
		const k = Math.floor(rnd() * (i + 1));
		[all[i], all[k]] = [all[k]!, all[i]!];
	}
	return all;
})();

export const DEFAULT_MASK = MASK_SHAPES.find(
	(shape) => shape.id === 'squircle-4',
)!;
