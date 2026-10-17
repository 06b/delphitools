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

/** Area of the profile's primaries triangle over sRGB's on the xy diagram (iOS gamutOverSRGB); null without matrix columns. */
export function gamutOverSRGB(icc: ExifData): number | null {
	const columns = [
		icc['RedMatrixColumn'],
		icc['GreenMatrixColumn'],
		icc['BlueMatrixColumn'],
	].map(xyz);
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

// exifr inflates png iccp only in node (png.mjs findIcc)
export async function pngIcc(file: Blob): Promise<ExifData | null> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const view = new DataView(bytes.buffer);
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
