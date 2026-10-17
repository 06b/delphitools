export interface Point {
	x: number;
	y: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface Rect extends Point, Size {}

/** The image fitted inside the area, centred. */
export function fitRect(area: Size, image: Size): Rect {
	if (!image.width || !image.height || !area.width || !area.height)
		return { x: 0, y: 0, ...area };
	const scale = Math.min(
		area.width / image.width,
		area.height / image.height,
	);
	const width = image.width * scale;
	const height = image.height * scale;
	return {
		x: (area.width - width) / 2,
		y: (area.height - height) / 2,
		width,
		height,
	};
}

/** Centre of an image pixel in area points. */
export function place(pixel: Point, fit: Rect, image: Size): Point {
	return {
		x: fit.x + ((pixel.x + 0.5) / image.width) * fit.width,
		y: fit.y + ((pixel.y + 0.5) / image.height) * fit.height,
	};
}

/** The image pixel under an area point, kept inside the image. */
export function pixelAt(point: Point, fit: Rect, image: Size): Point {
	return clampPixel(
		{
			x:
				((point.x - fit.x) / Math.max(fit.width, 1)) *
				image.width,
			y:
				((point.y - fit.y) / Math.max(fit.height, 1)) *
				image.height,
		},
		image,
	);
}

export function clampPixel(pixel: Point, image: Size): Point {
	return {
		x: Math.min(Math.max(Math.floor(pixel.x), 0), image.width - 1),
		y: Math.min(Math.max(Math.floor(pixel.y), 0), image.height - 1),
	};
}

export function contains(rect: Rect, point: Point) {
	return (
		point.x >= rect.x &&
		point.y >= rect.y &&
		point.x < rect.x + rect.width &&
		point.y < rect.y + rect.height
	);
}

/** The Pick button under the lens and the value line above it, px. */
export const lensParts = {
	pick: { width: 64, height: 36 },
	detail: 24,
	gap: 6,
};

const clamp = (value: number, low: number, high: number) =>
	Math.max(Math.min(value, high), low);

/**
 * The lens centred on `centre`, the value line above it and the Pick
 * button under it, the three kept inside `area` together (the lens then
 * sits off the pixel). `detail` is the value line's top centre.
 */
export function lensLayout(centre: Point, side: number, area: Size) {
	const { pick, detail, gap } = lensParts;
	const above = detail + gap;
	const below = gap + pick.height;
	const x = clamp(centre.x - side / 2, 8, area.width - side - 8);
	const y = clamp(
		centre.y - side / 2,
		4 + above,
		area.height - 4 - below - side,
	);
	const mid = x + side / 2;
	return {
		lens: { x, y, width: side, height: side },
		pick: {
			x: clamp(
				mid - pick.width / 2,
				4,
				area.width - pick.width - 4,
			),
			y: y + side + gap,
			...pick,
		},
		detail: { x: mid, y: y - above },
	};
}

const pairs = (text: string | null): Point[] =>
	(text ?? '').split(';').flatMap((pair) => {
		const [x, y, ...rest] = pair.split(',').map(Number);
		return rest.length === 0 &&
			Number.isFinite(x) &&
			Number.isFinite(y)
			? [{ x: x!, y: y! }]
			: [];
	});

/**
 * The iOS launch arguments as query flags: ?pickerImage (a drawn sample)
 * ?pickerPixel=x,y ?pickerPicks=x,y;x,y ?pickerLater.
 */
export function launchFlags(search: string) {
	const query = new URLSearchParams(search);
	return {
		image: query.has('pickerImage'),
		pixel: pairs(query.get('pickerPixel'))[0],
		picks: pairs(query.get('pickerPicks')),
		later: query.has('pickerLater'),
	};
}
