import { formatBytes } from 'delphitools-v2/lib/image-compress';
import { aspect } from 'delphitools-v2/components/tools/placeholder-genny/placeholder';
import type { SourceSpace } from 'delphitools-v2/components/tools/image-atlas/icc';

export interface Row {
	label: string;
	value: string;
	level?: number;
}

export interface Section {
	title: string;
	rows: Row[];
}

export type ExifData = Record<string, unknown>;
export type Dimensions = { w: number; h: number };
export type GpsPoint = {
	lat: number;
	lon: number;
	alt?: number;
	altRef?: number;
};

const DASH = '—';

// excluded from buildsections
const HERO_CAMERA_KEYS = new Set([
	'make',
	'model',
	'lensmake',
	'lensmodel',
	'lens',
	'lensspecification',
	'software',
]);

// excluded from buildsections
const HERO_FILE_KEYS = new Set(['format', 'imageformat']);

const MAX_CELL_CHARS = 180;
const MAX_REPORT_VALUE_CHARS = 500;

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

export function formatValue(value: unknown): string {
	if (value == null) return '';
	if (value instanceof Date) {
		return value.toLocaleString();
	}
	if (Array.isArray(value)) {
		return value.map(formatValue).join(', ');
	}
	if (typeof value === 'object') {
		try {
			const obj = value as Record<string, unknown>;
			if (
				obj.value !== undefined &&
				typeof obj.value === 'string'
			)
				return String(obj.value);
			return JSON.stringify(value);
		} catch {
			return Object.prototype.toString.call(value);
		}
	}
	if (typeof value === 'number') {
		return Number.isInteger(value)
			? String(value)
			: String(Math.round(value * 1e6) / 1e6);
	}
	// eslint-disable-next-line @typescript-eslint/no-base-to-string
	return String(value);
}

export function gpsFromExif(data: ExifData): GpsPoint | null {
	const lat = (data.latitude ?? data.GPSLatitude ?? data.gpsLatitude) as
		number | undefined;
	const lon = (data.longitude ??
		data.GPSLongitude ??
		data.gpsLongitude) as number | undefined;
	const alt = (data.GPSAltitude ?? data.gpsAltitude) as
		number | undefined;
	// altref 1: below sea-level
	const altRef = (data.GPSAltitudeRef ?? data.gpsAltitudeRef) as
		number | undefined;
	if (
		typeof lat === 'number' &&
		typeof lon === 'number' &&
		Number.isFinite(lat) &&
		Number.isFinite(lon)
	) {
		const resolvedAlt =
			typeof alt === 'number'
				? altRef === 1
					? -Math.abs(alt)
					: Math.abs(alt)
				: undefined;
		return { lat, lon, alt: resolvedAlt, altRef };
	}
	return null;
}

const LABEL_ACRONYMS: Record<string, string> = {
	Iso: 'ISO',
	Gps: 'GPS',
	Exif: 'Exif',
	Xmp: 'XMP',
	Iptc: 'IPTC',
	'F Number': 'F-Number',
	'Y Cb Cr': 'YCbCr',
};

const LABEL_OVERRIDES: Record<string, string> = {
	Name: 'File Name',
	Size: 'File Size',
	Type: 'MIME Type',
	'Date Time Original': 'Date Taken',
	'Focal Length In35mm Format': '35mm Equivalent',
};

export function prettyLabel(key: string): string {
	// exifr keys are camelcase
	let s = key.replace(/_/g, ' ').trim();
	s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
	s = s.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
	s = s
		.split(/\s+/)
		.map(
			(w) =>
				w.charAt(0).toUpperCase() +
				w.slice(1).toLowerCase(),
		)
		.join(' ');

	for (const [word, acronym] of Object.entries(LABEL_ACRONYMS)) {
		s = s.replace(new RegExp(`\\b${word}\\b`, 'g'), acronym);
	}

	return LABEL_OVERRIDES[s] ?? s;
}

const ENUM_LABELS: Record<string, Record<string, string>> = {
	colorspace: { '1': 'sRGB', '65535': 'Uncalibrated' },
	ycbcrpositioning: { '1': 'Centered', '2': 'Co-sited' },
	contrast: { '0': 'Normal', '1': 'Soft', '2': 'Hard' },
	saturation: { '0': 'Normal', '1': 'Low', '2': 'High' },
	sharpness: { '0': 'Normal', '1': 'Soft', '2': 'Hard' },
	customrendered: { '0': 'Normal', '1': 'Custom' },
	exposuremode: { '0': 'Auto', '1': 'Manual', '2': 'Auto bracket' },
	whitebalance: { '0': 'Auto', '1': 'Manual' },
	scenecapturetype: {
		'0': 'Standard',
		'1': 'Landscape',
		'2': 'Portrait',
		'3': 'Night scene',
	},
	gaincontrol: { '0': 'None', '1': 'Low gain up', '2': 'High gain up' },
	sensingmethod: {
		'1': 'Not defined',
		'2': 'One-chip color area',
		'3': 'Two-chip color area',
	},
	filesource: { '3': 'Digital camera' },
	scenetype: { '1': 'Directly photographed' },
	subjectdistancerange: {
		'0': 'Unknown',
		'1': 'Macro',
		'2': 'Close view',
		'3': 'Distant view',
	},
	exposureprogram: {
		'0': 'Not defined',
		'1': 'Manual',
		'2': 'Normal program',
		'3': 'Aperture priority',
		'4': 'Shutter priority',
		'5': 'Creative program',
		'6': 'Action program',
		'7': 'Portrait mode',
		'8': 'Landscape mode',
	},
	meteringmode: {
		'0': 'Unknown',
		'1': 'Average',
		'2': 'Center-weighted average',
		'3': 'Spot',
		'4': 'Multi-spot',
		'5': 'Multi-segment',
		'6': 'Partial',
		'255': 'Other',
	},
	lightsource: {
		'0': 'Unknown',
		'1': 'Daylight',
		'2': 'Fluorescent',
		'3': 'Tungsten (incandescent)',
		'4': 'Flash',
		'9': 'Fine weather',
		'10': 'Cloudy weather',
		'11': 'Shade',
		'12': 'Daylight fluorescent',
		'13': 'Day white fluorescent',
		'14': 'Cool white fluorescent',
		'15': 'White fluorescent',
		'16': 'Warm white fluorescent',
		'17': 'Standard light A',
		'18': 'Standard light B',
		'19': 'Standard light C',
		'20': 'D55',
		'21': 'D65',
		'22': 'D75',
		'23': 'D50',
		'24': 'ISO studio tungsten',
		'255': 'Other',
	},
	resolutionunit: { '2': 'Inches', '3': 'cm' },
	gpsmeasuremode: { '2': '2D measurement', '3': '3D measurement' },
};

// noise: blobs and plumbing
const IGNORED_KEYS = new Set([
	// exifr file path key
	'directory',
	'hdrplusmakernote',
	'makernote',
	'makernotes',
	'usercomment',
	'thumbnail',
	'thumbnailimage',
	'previewimage',
	'embeddedimage',
	// mpf: multi-picture format
	'mpf',
	// sensor calibration blobs
	'cfapattern',
	'cfaplane',
	'cfalayout',
	'oecf',
	'spatialfrequencyresponse',
	'devicesettingdescription',
	'imageboundary',
	'printim',
	'printimversion',
	'interopoffset',
	'interopversion',
	// tiff offsets: huge arrays
	'stripoffsets',
	'stripbytecounts',
	'tileoffsets',
	'tilebytecounts',
	'rowsperstrip',
	'whitepoint',
	'primarychromaticities',
	'ycbcrcoefficients',
	'referenceblackwhite',
	'subjectarea',
	'subjectlocation',
	// byte arrays, not strings
	'exifversion',
	'flashpixversion',
	// opaque component ordering array
	'componentsconfiguration',
	'gpsversionid',
	'gpsprocessingmethod',
	'gpsareainformation',
	// xp tags: kilobytes padding
	'xptitle',
	'xpcomment',
	'xpauthor',
	'xpkeywords',
	'xpsubject',
	'documentid',
	'instanceid',
	'originaldocumentid',
	'renditionclass',
	'preservedfilename',
	// camera raw xmp structs
	'look',
	'pointcolors',
	'masks',
	'retouchinfo',
	'applicationnotes',
	'padding',
	'offsetschema',
	'relatedsoundfile',
]);

// exif infinity sentinel, rounded
const EXIF_INFINITY_THRESHOLD = 4294967245;

const NUMERIC_VALUE_FORMATTERS: Record<
	string,
	(raw: number, base: string) => string
> = {
	subjectdistance: (raw, base) =>
		raw >= EXIF_INFINITY_THRESHOLD ? 'Infinity' : `${base} m`,
	exposuretime: (raw, base) => {
		if (raw <= 0 || raw >= 1) return base;
		const denom = Math.round(1 / raw);
		return denom > 0 ? `${base} (1/${denom}s)` : base;
	},
	exposurecompensation: (_raw, base) => `${base} EV`,
	fnumber: (_raw, base) => (base.startsWith('f/') ? base : `f/${base}`),
	focallength: (_raw, base) => `${base} mm`,
	focallengthin35mmformat: (_raw, base) => `${base} mm`,
	digitalzoomratio: (raw, base) => {
		if (!Number.isFinite(raw)) return DASH;
		return raw === 0 ? 'No zoom' : `${base}×`;
	},
};

export function prettyValue(key: string, raw: unknown): string {
	const base = formatValue(raw);
	const k = key.toLowerCase();

	const enumMap = ENUM_LABELS[k];
	if (enumMap) {
		const mapped = enumMap[String(raw)];
		if (mapped) return mapped;
	}

	if (typeof raw === 'number') {
		// digitalzoomratio guards non-finite itself
		if (!Number.isFinite(raw) && k !== 'digitalzoomratio')
			return DASH;
		const formatter = NUMERIC_VALUE_FORMATTERS[k];
		if (formatter) return formatter(raw, base);
	}

	if (k === 'iso' || k === 'isospeedratings') {
		if (typeof raw === 'number' || Array.isArray(raw))
			return `ISO ${base}`;
	}

	return base;
}

function sectionForKey(key: string): string {
	const k = key.toLowerCase();
	if (
		k.startsWith('gps') ||
		k === 'latitude' ||
		k === 'longitude' ||
		k === 'gpsaltitude'
	)
		return 'Location';
	if (
		/(make|model|lens|bodyserial|lensserial|camera|software|artist|hostcomputer|copyright|owner)/.test(
			k,
		)
	)
		return 'Camera';
	if (
		/(fnumber|exposure|iso|shutter|focal|flash|whitebalance|metering|brightness|lightsource|aperture)/.test(
			k,
		)
	)
		return 'Capture';
	if (
		/(datetime|createdate|modifydate|gpsdate|offsettime|subsec)/.test(
			k,
		)
	)
		return 'Dates';
	if (
		k.startsWith('xmp') ||
		k.includes('xmlns') ||
		k.startsWith('dc:') ||
		k.startsWith('xmp:')
	)
		return 'XMP';
	if (
		k.startsWith('iptc') ||
		k === 'caption' ||
		k === 'keywords' ||
		k === 'city' ||
		k === 'country'
	)
		return 'IPTC';
	if (
		/(imagewidth|imageheight|imagesize|orientation|resolution|colordata|bitspersample|photometric|compress)/.test(
			k,
		)
	)
		return 'Image';
	return 'Other';
}

function filteredExifEntries(exif: ExifData): [string, unknown][] {
	return Object.entries(exif)
		.filter(([key, raw]) => {
			if (key === 'errors') return false;
			const lk = key.toLowerCase();
			if (IGNORED_KEYS.has(lk)) return false;
			if (lk.includes('makernote') || lk.includes('hdrplus'))
				return false;
			if (lk.includes('serial')) return false;
			// xmp edit-history subtrees
			if (
				lk.includes('history') ||
				lk.includes('derivedfrom') ||
				lk.includes('manifest') ||
				lk.includes('ingredient') ||
				lk.includes('pantry')
			)
				return false;
			if (raw instanceof Uint8Array) return false;
			if (raw instanceof ArrayBuffer) return false;
			if (HERO_CAMERA_KEYS.has(lk)) return false;
			if (HERO_FILE_KEYS.has(lk)) return false;
			return true;
		})
		.sort(([a], [b]) => a.localeCompare(b));
}

const SECTION_ORDER = [
	'Camera',
	'Capture',
	'Image',
	'Location',
	'Dates',
	'XMP',
	'IPTC',
	'Other',
];

export function buildSections(exif: ExifData | null): Section[] {
	if (!exif) return [];
	const buckets = new Map<string, Row[]>();
	for (const [key, raw] of filteredExifEntries(exif)) {
		let value = prettyValue(key, raw);
		if (!value) continue;
		if (value.length > MAX_CELL_CHARS) {
			const preview = value.slice(0, MAX_CELL_CHARS);
			value = `${preview} … (+${value.length - MAX_CELL_CHARS} chars)`;
		}
		const section = sectionForKey(key);
		if (!buckets.has(section)) buckets.set(section, []);
		buckets.get(section)!.push({ label: prettyLabel(key), value });
	}
	return SECTION_ORDER.flatMap((title) => {
		const rows = buckets.get(title);
		return rows?.length ? [{ title, rows }] : [];
	});
}

export interface FileFacts {
	name: string;
	size: number;
	type: string;
	dims: Dimensions | null;
	exif: ExifData | null;
}

/** File, the camera hero rows, then the EXIF sections; the leftover camera rows join the hero. */
export function atlasSections(facts: FileFacts): Section[] {
	const { exif, dims } = facts;
	const file: Row[] = [
		{ label: prettyLabel('Name'), value: facts.name },
		{ label: prettyLabel('Size'), value: formatBytes(facts.size) },
		{ label: prettyLabel('Type'), value: facts.type || DASH },
	];
	if (dims)
		file.push({
			label: prettyLabel('Dimensions'),
			value: `${dims.w} × ${dims.h}`,
		});
	const format = exif?.['Format'] ?? exif?.['ImageFormat'];
	if (format)
		file.push({
			label: prettyLabel('Format'),
			value: formatValue(format),
		});
	const sections: Section[] = [{ title: 'File', rows: file }];

	const camera: Row[] = [];
	if (exif) {
		const make = asString(exif['Make']);
		const model = asString(exif['Model']);
		const lensMake =
			asString(exif['LensMake']) ??
			asString(exif['Lens Make']);
		const lensModel =
			exif['LensModel'] ??
			exif['Lens'] ??
			exif['LensSpecification'];
		const hero: [string, unknown][] = [
			['Make', make],
			['Model', model],
			['LensMake', lensMake],
			['LensModel', lensModel],
		];
		for (const [key, value] of hero)
			if (value)
				camera.push({
					label: prettyLabel(key),
					value: prettyValue(key, value),
				});
		if (exif['Software'])
			camera.push({
				label: prettyLabel('Software'),
				value: prettyValue(
					'Software',
					exif['Software'],
				),
			});
	}
	const rest = buildSections(exif);
	const leftover = rest.find((s) => s.title === 'Camera');
	if (camera.length || leftover)
		sections.push({
			title: 'Camera',
			rows: [...camera, ...(leftover?.rows ?? [])],
		});
	return [...sections, ...rest.filter((s) => s.title !== 'Camera')];
}

/** The loaded layout's first sections, each value a dash. */
export const blankSections: Section[] = [
	{
		title: 'File',
		rows: ['Name', 'Size', 'Type', 'Dimensions'].map((key) => ({
			label: prettyLabel(key),
			value: DASH,
		})),
	},
	{
		title: 'Camera',
		rows: ['Make', 'Model', 'LensMake', 'LensModel'].map((key) => ({
			label: prettyLabel(key),
			value: DASH,
		})),
	},
];

// the gps line shows these
const COORDINATE_LABELS = new Set(
	[
		'latitude',
		'longitude',
		'GPSLatitude',
		'GPSLongitude',
		'GPSLatitudeRef',
		'GPSLongitudeRef',
	].map(prettyLabel),
);

/** Location rows less the ones the coordinate line already shows (iOS showLocation). */
export function locationRows(sections: Section[], gps: GpsPoint | null) {
	const rows = sections.find((s) => s.title === 'Location')?.rows ?? [];
	return gps
		? rows.filter((row) => !COORDINATE_LABELS.has(row.label))
		: rows;
}

// characters; longer values wrap (iOS longValue)
const LONG_VALUE = 22;

/** Short values as tiles, long ones as lines of their own (iOS tiles). */
export function tileSplit(rows: Row[]) {
	return {
		short: rows.filter((row) => row.value.length <= LONG_VALUE),
		long: rows.filter((row) => row.value.length > LONG_VALUE),
	};
}

export function fieldCount(exif: ExifData | null) {
	return exif
		? Object.keys(exif).filter((k) => k !== 'errors').length
		: 0;
}

/** Format, size and field count for the source row (iOS summary). */
export function summary(type: string, size: number, fields: number) {
	const format = type.startsWith('image/')
		? type.slice('image/'.length).replace(/\+.*/, '').toUpperCase()
		: '';
	const count =
		fields === 0
			? 'no metadata'
			: fields === 1
				? '1 field'
				: `${fields} fields`;
	return [format, formatBytes(size), count].filter(Boolean).join(' · ');
}

/** Aspect ratio and megapixels, `16:9  8.3 MP` (iOS ImageAtlasPicture.caption). */
export function caption(width: number, height: number) {
	const mp = (width * height) / 1_000_000;
	const figure =
		mp >= 10
			? mp.toFixed(0)
			: mp >= 0.1
				? mp.toFixed(1)
				: mp.toFixed(2);
	return `${aspect(width, height)}  ${figure} MP`;
}

// iOS ImageAtlasPicture metrics
const PADDING = 16;
const ROOM = 44;
const CAPTION = 16;
const FRAME = 2;
const TALLEST = { share: 0.75, px: 420 };

/** Banner height for a picture of `pixels` across `width`, rules included (iOS canvasFittingHeight). */
export function bannerHeight(
	width: number,
	pixels: { width: number; height: number },
) {
	const room = Math.max(1, width - PADDING * 2 - ROOM);
	const tallest = Math.min(width * TALLEST.share, TALLEST.px);
	const image = Math.max(
		96,
		Math.min((room * pixels.height) / pixels.width, tallest),
	);
	return Math.round(
		PADDING / 2 + ROOM + image + 6 + CAPTION + PADDING + FRAME * 2,
	);
}

export interface Scan {
	/** Red, green and blue counts of opaque-enough pixels, 256 bins each. */
	histogram: [number[], number[], number[]];
	/** Share of pixels not fully opaque. */
	transparent: number;
	/** Share of the visible, not black pixels whose colour sRGB cannot show; null when the profile cannot be read. */
	outside: number | null;
}

/** The file's own RGBA bytes, the same size as the scanned ones, and their space. */
export interface Source {
	pixels: ArrayLike<number>;
	space: SourceSpace;
}

/** Histograms, transparency and the share outside sRGB of RGBA bytes; without `source` the bytes are sRGB, none outside. */
export function scanPixels(data: ArrayLike<number>, source?: Source): Scan {
	const histogram: Scan['histogram'] = [
		new Array<number>(256).fill(0),
		new Array<number>(256).fill(0),
		new Array<number>(256).fill(0),
	];
	let clear = 0;
	let coloured = 0;
	let outside = 0;
	const pixels = Math.floor(data.length / 4);
	const [red, green, blue] = source?.space.curves ?? [];
	const m = source?.space.matrix ?? [];
	for (let i = 0; i < pixels * 4; i += 4) {
		const alpha = data[i + 3]!;
		if (alpha < 255) clear++;
		if (alpha === 0) continue;
		histogram[0][data[i]!]!++;
		histogram[1][data[i + 1]!]!++;
		histogram[2][data[i + 2]!]!++;
		// iOS ImageColourScan.plotChromaticity: alpha above 0.004, brightest above 0.002, a channel below -1 % of it
		const own = source?.pixels;
		if (!own || own[i + 3]! < 2) continue;
		const r = red![own[i]!]!;
		const g = green![own[i + 1]!]!;
		const b = blue![own[i + 2]!]!;
		const sr = m[0]! * r + m[1]! * g + m[2]! * b;
		const sg = m[3]! * r + m[4]! * g + m[5]! * b;
		const sb = m[6]! * r + m[7]! * g + m[8]! * b;
		const brightest = Math.max(sr, sg, sb);
		if (brightest <= 0.002) continue;
		coloured++;
		if (Math.min(sr, sg, sb) < -0.01 * brightest) outside++;
	}
	return {
		histogram,
		transparent: pixels ? clear / pixels : 0,
		outside: coloured ? outside / coloured : 0,
	};
}

/** Tallest bin, end bins aside, as they hold clipping (iOS ImageColourScopes.peak). */
export function peak(bins: number[][]) {
	const inner = Math.max(
		0,
		...bins.map((b) =>
			b.length > 2 ? Math.max(...b.slice(1, -1)) : 0,
		),
	);
	return inner > 0
		? inner
		: Math.max(0, ...bins.map((b) => Math.max(...b)));
}

export function percent(share: number) {
	const value = Math.round(share * 1000) / 10;
	return `${value} %`;
}

export function reportText(
	exif: ExifData | null,
	gps: GpsPoint | null,
	fileName: string,
	fileSize: number,
	dims: Dimensions | null,
	colour: Row[] = [],
): string {
	if (!exif && !gps) return '';
	const lines: string[] = [];
	lines.push(`File: ${fileName} (${formatBytes(fileSize)})`);
	if (dims) lines.push(`Dimensions: ${dims.w} × ${dims.h}`);
	lines.push('');
	// iOS reportText: a section heading, a line per known row
	const known = colour.filter((row) => row.value !== DASH);
	if (known.length)
		lines.push(
			'COLOUR',
			...known.map((row) => `${row.label}: ${row.value}`),
			'',
		);
	if (!exif || Object.keys(exif).length === 0) {
		lines.push('No EXIF/XMP/IPTC metadata found.');
	} else {
		for (const [k, v] of filteredExifEntries(exif)) {
			let val = prettyValue(k, v);
			if (val.length > MAX_REPORT_VALUE_CHARS) {
				val = `${val.slice(0, MAX_REPORT_VALUE_CHARS)} … (truncated)`;
			}
			lines.push(`${prettyLabel(k)}: ${val}`);
		}
	}
	if (gps) {
		lines.push('');
		lines.push(
			`GPS: ${gps.lat.toFixed(6)}, ${gps.lon.toFixed(6)}${gps.alt !== undefined ? ` alt ${Math.round(gps.alt)}m` : ''}`,
		);
	}
	return lines.join('\n');
}
