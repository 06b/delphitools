import {
	allSeries,
	type PaperSize,
} from 'delphitools-v2/components/tools/paper-sizes/data';

export interface PaperPick {
	series: string;
	size: PaperSize;
	key: string;
}

export const allPicks: PaperPick[] = allSeries.flatMap((series) =>
	series.sizes.map((size) => ({
		series: series.id,
		size,
		key: `${series.id}/${size.id}`,
	})),
);

export function named(id: string): PaperPick | undefined {
	return allPicks.find(
		(pick) => pick.size.id.toLowerCase() === id.toLowerCase(),
	);
}

export const unitLabels = ['mm', 'in', 'in ½', 'pt', 'px'];
export const unitNames = [
	'Millimetres',
	'Inches',
	'Eighths',
	'Points',
	'Pixels',
];
export type PaperUnit = 0 | 1 | 2 | 3 | 4;
export const pixelUnit: PaperUnit = 4;
export const dpis = [72, 150, 300, 600];

const mmPerInch = 25.4;

/** At most `places` decimals, no trailing zeros. */
export function decimal(value: number, places = 2): string {
	return String(Number(value.toFixed(places)));
}

/** Whole millimetres or points bare, else one decimal. */
function tenths(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Nearest eighth of an inch as a vulgar fraction; exact within 0.01 in. */
export function eighths(inches: number): { text: string; exact: boolean } {
	const rounded = Math.round(inches * 8) / 8;
	const whole = Math.floor(rounded);
	const glyph = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'][
		Math.round((rounded - whole) * 8) % 8
	]!;
	const text = whole === 0 && glyph ? glyph : `${whole}${glyph}`;
	return { text, exact: Math.abs(rounded - inches) < 0.01 };
}

export function pixels(mm: number, dpi: number): number {
	return Math.round((mm / mmPerInch) * dpi);
}

/** The size in a unit, as the cells and the legend show it. */
export function dimensions(
	size: PaperSize,
	unit: PaperUnit,
	dpi: number,
): string {
	const { widthMM: w, heightMM: h } = size;
	switch (unit) {
		case 0:
			return `${tenths(w)} × ${tenths(h)} mm`;
		case 1:
			return `${decimal(w / mmPerInch)} × ${decimal(h / mmPerInch)} in`;
		case 2: {
			const [x, y] = [
				eighths(w / mmPerInch),
				eighths(h / mmPerInch),
			];
			return `${x.exact && y.exact ? '' : '≈ '}${x.text} × ${y.text}″`;
		}
		case 3:
			return `${tenths((w / mmPerInch) * 72)} × ${tenths((h / mmPerInch) * 72)} pt`;
		case 4:
			return `${pixels(w, dpi)} × ${pixels(h, dpi)} px`;
	}
}

export type PaperQuery =
	| { kind: 'none' }
	| { kind: 'name'; text: string }
	/** millimetres; `dpi` and `pixels` when the query was in pixels */
	| {
			kind: 'size';
			width: number;
			height: number;
			dpi?: number;
			pixels?: [number, number];
	  };

const pixelPattern = /^(\d+)\s*[x×]\s*(\d+)\s*@?\s*(\d+)\s*dpi$/;
const sizePattern = /^([\d.,]+)\s*[x×]\s*([\d.,]+)\s*(mm|in|"|″)?$/;

/** Bare numbers both under 50 are inches; a decimal comma is a point. */
export function parseQuery(text: string): PaperQuery {
	const query = text.trim().toLowerCase();
	if (!query) return { kind: 'none' };
	const pixelled = pixelPattern.exec(query);
	if (pixelled) {
		const [w, h, dpi] = pixelled.slice(1).map(Number) as [
			number,
			number,
			number,
		];
		if (dpi > 0)
			return {
				kind: 'size',
				width: (w / dpi) * mmPerInch,
				height: (h / dpi) * mmPerInch,
				dpi,
				pixels: [w, h],
			};
	}
	const sized = sizePattern.exec(query);
	if (sized) {
		const [w, h] = [sized[1]!, sized[2]!].map((part) =>
			Number(part.replace(',', '.')),
		) as [number, number];
		if (Number.isFinite(w) && Number.isFinite(h)) {
			const unit = sized[3];
			const inches =
				unit === 'in' ||
				unit === '"' ||
				unit === '″' ||
				(!unit && w < 50 && h < 50);
			return inches
				? {
						kind: 'size',
						width: w * mmPerInch,
						height: h * mmPerInch,
					}
				: { kind: 'size', width: w, height: h };
		}
	}
	return { kind: 'name', text: query };
}

export function matches(query: PaperQuery, pick: PaperPick): boolean {
	if (query.kind !== 'name') return true;
	return [pick.size.name, pick.size.id, pick.series].some((part) =>
		part.toLowerCase().includes(query.text),
	);
}

export interface Closest {
	pick: PaperPick;
	/** millimetres over (+) or under (−) the target, turned to match it when that is closer */
	dw: number;
	dh: number;
}

/** Nearest sizes by corner distance, either way up. */
export function closest(width: number, height: number, limit = 5): Closest[] {
	return allPicks
		.map((pick) => {
			const { widthMM: w, heightMM: h } = pick.size;
			const upright = Math.hypot(w - width, h - height);
			const turned = Math.hypot(w - height, h - width);
			return turned < upright
				? {
						pick,
						distance: turned,
						dw: w - height,
						dh: h - width,
					}
				: {
						pick,
						distance: upright,
						dw: w - width,
						dh: h - height,
					};
		})
		.sort((a, b) => a.distance - b.distance)
		.slice(0, limit)
		.map(({ pick, dw, dh }) => ({ pick, dw, dh }));
}

export function signed(mm: number): string {
	const whole = Math.round(mm);
	return whole > 0 ? `+${whole}` : whole < 0 ? `−${-whole}` : '0';
}

/** Rounded standard sizes: a ratio within 0.5 % of a whole or half number is that number. */
export function ratio(value: number): string {
	const nominal = Math.round(value * 2) / 2;
	return decimal(
		Math.abs(value - nominal) < nominal * 0.005 ? nominal : value,
	);
}

/** The larger area over the smaller. */
export function areaRatio(a: PaperSize, b: PaperSize): number {
	const [small, large] = [
		a.widthMM * a.heightMM,
		b.widthMM * b.heightMM,
	].sort((x, y) => x - y) as [number, number];
	return large / small;
}

export const arrangements = ['stacked', 'sideBySide', 'aboveBelow'] as const;
export type Arrangement = (typeof arrangements)[number];
export const arrangementNames = ['Stacked', 'Side by side', 'Above and below'];

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface Size {
	width: number;
	height: number;
}

/** Never scaled past A4: a small sheet does not fill the picture. */
export const reference: Size = { width: 210, height: 297 };
export const gap = 20;

/** The sheets to one scale, the group centred in `area` and standing on one line, x from the inline start. */
export function frames(
	sizes: Size[],
	arrangement: Arrangement,
	area: Rect,
): Rect[] {
	if (sizes.length === 0) return [];
	const apart = sizes.length === 2 ? arrangement : 'stacked';
	const across = apart === 'sideBySide' ? gap : 0;
	const down = apart === 'aboveBelow' ? gap : 0;
	const widths = sizes.map((s) => s.width);
	const heights = sizes.map((s) => s.height);
	const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
	const span = {
		width:
			apart === 'sideBySide'
				? sum(widths)
				: Math.max(...widths),
		height:
			apart === 'aboveBelow'
				? sum(heights)
				: Math.max(...heights),
	};
	const scale = Math.max(
		0,
		Math.min(
			(area.width - across) /
				Math.max(span.width, reference.width),
			(area.height - down) /
				Math.max(span.height, reference.height),
		),
	);
	const group = {
		width: span.width * scale + across,
		height: span.height * scale + down,
	};
	const left = area.x + area.width / 2 - group.width / 2;
	const bottom = area.y + area.height / 2 + group.height / 2;
	const scaled = sizes.map((s) => ({
		width: s.width * scale,
		height: s.height * scale,
	}));
	if (apart === 'sideBySide') {
		let x = left;
		return scaled.map((s) => {
			const rect = { x, y: bottom - s.height, ...s };
			x += s.width + gap;
			return rect;
		});
	}
	if (apart === 'aboveBelow') {
		let y = bottom - group.height;
		return scaled.map((s) => {
			const rect = { x: left, y, ...s };
			y += s.height + gap;
			return rect;
		});
	}
	return scaled.map((s) => ({ x: left, y: bottom - s.height, ...s }));
}

const mediaBoxPattern =
	/\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/;

/** The first MediaBox in PDF source, in points. */
export function mediaBox(source: string): [number, number] | undefined {
	const found = mediaBoxPattern.exec(source);
	if (!found) return undefined;
	const [x0, y0, x1, y1] = found.slice(1).map(Number) as [
		number,
		number,
		number,
		number,
	];
	return [Math.abs(x1 - x0), Math.abs(y1 - y0)];
}

/** A query for a page `points` in PDF points, in whole millimetres. */
export function pageQuery([width, height]: [number, number]): string {
	const mm = (points: number) => Math.round((points / 72) * mmPerInch);
	return `${mm(width)}x${mm(height)}mm`;
}
