import exifr from 'exifr';
import type { ExifData } from 'delphitools-v2/components/tools/image-atlas/report';

// png iccp keyword, from exifr's ihdr parser
const ICC_KEYS = new Set([
	...(exifr.tagKeys.get('icc')?.values() ?? []),
	'ProfileName',
]);

/** The merged exifr output split into the ICC profile's fields and the rest. */
export function splitIcc(data: ExifData) {
	const exif: ExifData = {};
	const icc: ExifData = {};
	for (const [key, value] of Object.entries(data))
		(ICC_KEYS.has(key) ? icc : exif)[key] = value;
	return { exif, icc };
}

type Localised = { lang?: string; text?: string };

/** The profile's description; a v4 profile's mluc list gives its English entry. */
export function profileName(icc: ExifData): string | null {
	const desc = icc['ProfileDescription'];
	if (typeof desc === 'string' && desc) return desc;
	if (Array.isArray(desc)) {
		const list = desc as Localised[];
		const text = (list.find((e) => e.lang === 'en') ?? list[0])
			?.text;
		if (text) return text;
	}
	const keyword = icc['ProfileName'];
	return typeof keyword === 'string' && keyword ? keyword : null;
}

// ICC.1:2010 10.31 XYZType: 'XYZ ', 4 reserved, then s15Fixed16 X Y Z
function xyz(raw: unknown): [number, number, number] | null {
	if (!(raw instanceof Uint8Array) || raw.length < 20) return null;
	const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
	return [8, 12, 16].map((at) => view.getInt32(at) / 65536) as [
		number,
		number,
		number,
	];
}

// bradford D50 to D65 (lindbloom); matrix columns are D50-adapted
const D50_TO_D65 = [
	[0.9555766, -0.0230393, 0.0631636],
	[-0.0282895, 1.0099416, 0.0210077],
	[0.0122982, -0.020483, 1.3299098],
];

const SRGB: [number, number][] = [
	[0.64, 0.33],
	[0.3, 0.6],
	[0.15, 0.06],
];

function area([a, b, c]: [number, number][]) {
	return (
		Math.abs(
			(b![0] - a![0]) * (c![1] - a![1]) -
				(c![0] - a![0]) * (b![1] - a![1]),
		) / 2
	);
}

const matrixColumns = (icc: ExifData) =>
	[
		icc['RedMatrixColumn'],
		icc['GreenMatrixColumn'],
		icc['BlueMatrixColumn'],
	].map(xyz);

/** Area of the profile's primaries triangle over sRGB's on the xy diagram (iOS gamutOverSRGB); null without matrix columns. */
export function gamutOverSRGB(icc: ExifData): number | null {
	const columns = matrixColumns(icc);
	if (columns.some((c) => !c)) return null;
	const points = columns.map((column) => {
		const [x, y, z] = D50_TO_D65.map(
			(row) =>
				row[0]! * column![0] +
				row[1]! * column![1] +
				row[2]! * column![2],
		) as [number, number, number];
		const sum = x + y + z;
		return [x / sum, y / sum] as [number, number];
	});
	return area(points) / area(SRGB);
}

// ICC.1:2010 10.6 curveType and 10.18 parametricCurveType, as a 256-entry table of 8-bit codes
function curve(raw: unknown): Float64Array | null {
	if (!(raw instanceof Uint8Array) || raw.length < 12) return null;
	const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
	const type = String.fromCharCode(...raw.subarray(0, 4));
	let at: (x: number) => number;
	if (type === 'curv') {
		const count = view.getUint32(8);
		if (raw.length < 12 + count * 2) return null;
		const entry = (i: number) => view.getUint16(12 + i * 2) / 65535;
		if (count === 0) at = (x) => x;
		else if (count === 1) {
			const gamma = view.getUint16(12) / 256;
			at = (x) => x ** gamma;
		} else
			at = (x) => {
				const spot = x * (count - 1);
				const low = Math.floor(spot);
				const high = Math.min(count - 1, low + 1);
				return (
					entry(low) +
					(entry(high) - entry(low)) *
						(spot - low)
				);
			};
	} else if (type === 'para') {
		const kind = view.getUint16(8);
		const needs = [1, 3, 4, 5, 7][kind];
		if (needs === undefined || raw.length < 12 + needs * 4)
			return null;
		const [g = 1, a = 1, b = 0, c = 0, d = 0, e = 0, f = 0] =
			Array.from(
				{ length: needs },
				(_, i) => view.getInt32(12 + i * 4) / 65536,
			);
		const power = (x: number) => Math.max(0, a * x + b) ** g;
		at = [
			(x: number) => x ** g,
			(x: number) => (x >= -b / a ? power(x) : 0),
			(x: number) => (x >= -b / a ? power(x) + c : c),
			(x: number) => (x >= d ? power(x) : c * x),
			(x: number) => (x >= d ? power(x) + e : c * x + f),
		][kind]!;
	} else return null;
	return Float64Array.from({ length: 256 }, (_, i) => at(i / 255));
}

// lindbloom: XYZ D50 to linear sRGB, bradford-adapted
const XYZ_D50_TO_SRGB = [
	[3.1338561, -1.6168667, -0.4906146],
	[-0.9787684, 1.9161415, 0.033454],
	[0.0719453, -0.2289914, 1.4052427],
];

export interface SourceSpace {
	/** Per channel, 8-bit code to linear light. */
	curves: [Float64Array, Float64Array, Float64Array];
	/** Row-major, linear profile RGB to linear sRGB. */
	matrix: number[];
}

/** A matrix/TRC RGB profile's conversion to linear sRGB; null for other profiles (LUT, CMYK, grey). */
export function sourceSpace(icc: ExifData): SourceSpace | null {
	const columns = matrixColumns(icc);
	const curves = [icc['RedTRC'], icc['GreenTRC'], icc['BlueTRC']].map(
		curve,
	);
	if (columns.some((c) => !c) || curves.some((c) => !c)) return null;
	const matrix = XYZ_D50_TO_SRGB.flatMap((row) =>
		[0, 1, 2].map(
			(col) =>
				row[0]! * columns[col]![0] +
				row[1]! * columns[col]![1] +
				row[2]! * columns[col]![2],
		),
	);
	return {
		curves: curves as SourceSpace['curves'],
		matrix,
	};
}

// exifr inflates png iccp only in node (png.mjs findIcc)
export async function pngIcc(
	bytes: Uint8Array<ArrayBuffer>,
): Promise<ExifData | null> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
	const name = (at: number) =>
		String.fromCharCode(...bytes.subarray(at, at + 4));
	for (let at = 8; at + 8 <= bytes.length;) {
		const length = view.getUint32(at);
		const type = name(at + 4);
		if (type === 'IDAT' || type === 'IEND') return null;
		if (type === 'iCCP') {
			const data = bytes.subarray(at + 8, at + 8 + length);
			const nul = data.indexOf(0);
			if (nul < 0) return null;
			const stream = new Blob([data.subarray(nul + 2)])
				.stream()
				.pipeThrough(
					new DecompressionStream('deflate'),
				);
			const profile = new Uint8Array(
				await new Response(stream).arrayBuffer(),
			);
			const parser = exifr.segmentParsers.get('icc') as {
				parse(input: Uint8Array): ExifData;
			};
			return parser.parse(profile);
		}
		at += 12 + length;
	}
	return null;
}
