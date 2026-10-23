import {
	rgbToOklab,
	oklabToRgb,
	rgbToHex,
	labToLch,
	hexToRgb,
	type Triple,
} from 'delphitools-v2/lib/colour-maths';

export type ExtractionStrategy =
	| 'dominant'
	| 'vibrant'
	| 'muted'
	| 'light'
	| 'dark'
	| 'warm'
	| 'cool'
	| 'accent';

export interface Cluster {
	// oklab [l, a, b]
	centroid: Triple;
	hex: string;
	count: number;
}

export const STRATEGIES: {
	key: ExtractionStrategy;
	name: string;
	description: string;
}[] = [
	{
		key: 'dominant',
		name: 'Dominant',
		description:
			'The most prominent colours by area — what the image is mostly made of',
	},
	{
		key: 'vibrant',
		name: 'Vibrant',
		description:
			'The most saturated, punchy colours — the ones that pop',
	},
	{
		key: 'muted',
		name: 'Muted',
		description:
			'Understated, desaturated tones — the quiet palette',
	},
	{
		key: 'light',
		name: 'Light',
		description:
			'The brightest colours — highlights, glows, and washed-out tones',
	},
	{
		key: 'dark',
		name: 'Dark',
		description:
			'Deep shadows and rich darks — moody and grounding',
	},
	{
		key: 'warm',
		name: 'Warm',
		description: 'Reds, oranges, yellows, and earthy tones',
	},
	{
		key: 'cool',
		name: 'Cool',
		description: 'Blues, greens, and icy tones',
	},
	{
		key: 'accent',
		name: 'Accent',
		description:
			'Rare standout colours that are far from the dominant palette',
	},
];

// ≤22,500 pixels clustered
const SAMPLE_EDGE = 150;
export const MAX_CLUSTERS = 32;
const KMEANS_ITERATIONS = 20;
export const MIN_COLOURS = 3;
export const MAX_COLOURS = 11;
/** Long edge of the palettised picture; the download is full size. */
export const PAINT_EDGE = 720;

// squared omits sqrt
export function oklabDistance(a: Triple, b: Triple): number {
	const dL = a[0] - b[0];
	const da = a[1] - b[1];
	const db = a[2] - b[2];
	return dL * dL + da * da + db * db;
}

/** The image drawn at most `edge` px on its long side; zero-dim canvas throws. */
export function downsample(
	image: CanvasImageSource & { width: number; height: number },
	edge = SAMPLE_EDGE,
): HTMLCanvasElement {
	let w = image.width;
	let h = image.height;
	const scale = edge / Math.max(w, h);
	if (scale < 1) {
		w = Math.max(1, Math.round(w * scale));
		h = Math.max(1, Math.round(h * scale));
	}

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	canvas.getContext('2d')?.drawImage(image, 0, 0, w, h);
	return canvas;
}

export function pixelsFromCanvas(canvas: HTMLCanvasElement): Triple[] {
	const ctx = canvas.getContext('2d');
	if (!ctx || canvas.width === 0 || canvas.height === 0) return [];

	const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const pixels: Triple[] = [];
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3]! < 128) continue;
		pixels.push(rgbToOklab(data[i]!, data[i + 1]!, data[i + 2]!));
	}
	return pixels;
}

// k-means++ seeding; random injectable
export function seedCentroids(
	pixels: Triple[],
	k: number,
	random: () => number = Math.random,
): Triple[] {
	const pick = (index: number) =>
		pixels[Math.min(pixels.length - 1, Math.max(0, index))]!;

	const centroids: Triple[] = [
		pick(Math.floor(random() * pixels.length)),
	];
	const nearest = new Float64Array(pixels.length).fill(Infinity);

	for (let c = 1; c < k; c++) {
		const last = centroids[c - 1]!;
		let total = 0;
		for (let i = 0; i < pixels.length; i++) {
			const d = oklabDistance(pixels[i]!, last);
			if (d < nearest[i]!) nearest[i] = d;
			total += nearest[i]!;
		}

		let r = random() * total;
		let index = 0;
		for (let i = 0; i < pixels.length; i++) {
			r -= nearest[i]!;
			if (r <= 0) {
				index = i;
				break;
			}
		}
		centroids.push(pick(index));
	}

	return centroids;
}

// lloyd's k-means, fixed iterations
export function clusterPixels(
	pixels: Triple[],
	k: number,
	random: () => number = Math.random,
): Cluster[] {
	if (pixels.length === 0) return [];

	let centroids = seedCentroids(
		pixels,
		Math.min(k, pixels.length),
		random,
	);
	const assignments = new Int32Array(pixels.length);

	for (let iteration = 0; iteration < KMEANS_ITERATIONS; iteration++) {
		for (let i = 0; i < pixels.length; i++) {
			let best = 0;
			let bestDistance = Infinity;
			for (let c = 0; c < centroids.length; c++) {
				const d = oklabDistance(
					pixels[i]!,
					centroids[c]!,
				);
				if (d < bestDistance) {
					bestDistance = d;
					best = c;
				}
			}
			assignments[i] = best;
		}

		const sums: Triple[] = centroids.map(() => [0, 0, 0]);
		const counts = new Int32Array(centroids.length);
		for (let i = 0; i < pixels.length; i++) {
			const c = assignments[i]!;
			const sum = sums[c]!;
			const pixel = pixels[i]!;
			sum[0] += pixel[0];
			sum[1] += pixel[1];
			sum[2] += pixel[2];
			counts[c] = counts[c]! + 1;
		}

		centroids = centroids.map((previous, c) => {
			const n = counts[c]!;
			if (n === 0) return previous;
			const sum = sums[c]!;
			return [sum[0] / n, sum[1] / n, sum[2] / n];
		});
	}

	const sizes = new Int32Array(centroids.length);
	for (let i = 0; i < pixels.length; i++) {
		const c = assignments[i]!;
		sizes[c] = sizes[c]! + 1;
	}

	return centroids
		.map((centroid, i) => ({
			centroid,
			hex: rgbToHex(...oklabToRgb(...centroid)),
			count: sizes[i]!,
		}))
		.filter((cluster) => cluster.count > 0);
}

function dominantCentroids(clusters: Cluster[]): Triple[] {
	const sorted = [...clusters].sort((a, b) => b.count - a.count);
	const threshold = sorted[Math.floor(sorted.length / 3)]?.count ?? 0;
	return sorted
		.filter((cluster) => cluster.count >= threshold)
		.map((cluster) => cluster.centroid);
}

function score(
	cluster: Cluster,
	strategy: ExtractionStrategy,
	large: Triple[],
): number {
	const [L, a, b] = cluster.centroid;
	const [, chroma, hue] = labToLch(L, a, b);

	switch (strategy) {
		case 'dominant':
			return cluster.count;
		case 'vibrant':
			return chroma;
		case 'muted':
			return 1 / (chroma + 0.001);
		case 'light':
			return L;
		case 'dark':
			return 1 - L;
		case 'warm': {
			const isWarm = (hue >= 0 && hue <= 70) || hue >= 320;
			return isWarm ? chroma + 0.5 : chroma * 0.1;
		}
		case 'cool': {
			const isCool = hue >= 150 && hue <= 300;
			return isCool ? chroma + 0.5 : chroma * 0.1;
		}
		case 'accent': {
			let nearest = Infinity;
			for (const centroid of large) {
				const d = oklabDistance(
					cluster.centroid,
					centroid,
				);
				if (d < nearest) nearest = d;
			}
			// rare colours outrank common
			return nearest / Math.log(cluster.count + 2);
		}
	}
}

export function rankClusters(
	clusters: Cluster[],
	strategy: ExtractionStrategy,
	count: number,
): Cluster[] {
	const large = strategy === 'accent' ? dominantCentroids(clusters) : [];
	return clusters
		.map((cluster) => ({
			cluster,
			score: score(cluster, strategy, large),
		}))
		.sort((x, y) => y.score - x.score)
		.slice(0, count)
		.map((scored) => scored.cluster);
}

function nearest(colour: Triple, palette: Triple[]): number {
	let best = 0;
	let bestDistance = Infinity;
	for (let i = 0; i < palette.length; i++) {
		const d = oklabDistance(colour, palette[i]!);
		if (d < bestDistance) {
			bestDistance = d;
			best = i;
		}
	}
	return best;
}

/** Share of the image nearest each palette colour; the shares sum to 1. */
export function coverage(clusters: Cluster[], palette: Cluster[]): number[] {
	const total = clusters.reduce((sum, c) => sum + c.count, 0);
	if (total === 0 || palette.length === 0) return palette.map(() => 0);
	const targets = palette.map((c) => c.centroid);
	const sums = palette.map(() => 0);
	for (const cluster of clusters)
		sums[nearest(cluster.centroid, targets)]! += cluster.count;
	return sums.map((sum) => sum / total);
}

let grid: Triple[] | undefined;

/** Oklab of every 5-bit rgb colour, the paint lookup's index space. */
function oklabGrid(): Triple[] {
	grid ??= Array.from({ length: 1 << 15 }, (_, i) =>
		rgbToOklab(
			((i >> 10) * 255) / 31,
			(((i >> 5) & 31) * 255) / 31,
			((i & 31) * 255) / 31,
		),
	);
	return grid;
}

/** Every opaque pixel replaced by its nearest palette colour, in place. */
export function paintPixels(data: Uint8ClampedArray, hexes: string[]) {
	if (hexes.length === 0) return;
	const inks = hexes.map((code): Triple => hexToRgb(code) ?? [0, 0, 0]);
	const targets = inks.map((rgb) => rgbToOklab(...rgb));
	const lookup = new Uint8Array(1 << 15);
	oklabGrid().forEach((lab, i) => (lookup[i] = nearest(lab, targets)));
	for (let at = 0; at < data.length; at += 4) {
		if (data[at + 3] === 0) continue;
		const ink =
			inks[
				lookup[
					((data[at]! >> 3) << 10) |
						((data[at + 1]! >> 3) << 5) |
						(data[at + 2]! >> 3)
				]!
			]!;
		data[at] = ink[0];
		data[at + 1] = ink[1];
		data[at + 2] = ink[2];
	}
}

/** The image at most `edge` px long, each pixel its nearest palette colour. */
export function paint(
	image: CanvasImageSource & { width: number; height: number },
	hexes: string[],
	edge = Infinity,
): HTMLCanvasElement {
	const canvas = downsample(image, edge);
	const context = canvas.getContext('2d', { willReadFrequently: true })!;
	const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
	paintPixels(pixels.data, hexes);
	context.putImageData(pixels, 0, 0);
	return canvas;
}
