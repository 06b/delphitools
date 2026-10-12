import type { GpsFix, MetadataReport } from 'delphitools-v2/lib/metadata';

/** iOS MetadataScan.Block, in lamp order. */
export const blockNames = [
	'EXIF',
	'GPS',
	'TIFF',
	'IPTC',
	'XMP',
	'MakerNote',
	'ICC',
	'C2PA',
] as const;
export type Block = (typeof blockNames)[number];
export type LampState = 'off' | 'on' | 'struck';

// ponytail: web report labels map to blocks; a JPEG or GIF comment counts as EXIF, PNG text chunks as none
const byLabel: Record<string, Block> = {
	'GPS coordinates': 'GPS',
	'GPS timestamp': 'GPS',
	Camera: 'TIFF',
	Modified: 'TIFF',
	Software: 'TIFF',
	Artist: 'TIFF',
	Copyright: 'TIFF',
	Description: 'TIFF',
	Lens: 'EXIF',
	'Camera serial': 'EXIF',
	'Lens serial': 'EXIF',
	'Owner name': 'EXIF',
	Taken: 'EXIF',
	Digitised: 'EXIF',
	Comment: 'EXIF',
	Thumbnail: 'EXIF',
	MakerNote: 'MakerNote',
	IPTC: 'IPTC',
	'XMP packet': 'XMP',
	'Colour profile': 'ICC',
};

/** The blocks a report shows. */
export function blocksOf(report: MetadataReport | null): Set<Block> {
	const blocks = new Set<Block>();
	if (!report) return blocks;
	for (const { label } of report.entries) {
		const block = byLabel[label];
		if (block) blocks.add(block);
	}
	if (report.c2pa) blocks.add('C2PA');
	return blocks;
}

/** Lit where found, struck where stripping took it away (iOS MetadataScan.lamps). */
export function lamps(found: Set<Block>, left: Set<Block> | null): LampState[] {
	return blockNames.map((block) => {
		if (!found.has(block)) return 'off';
		if (!left) return 'on';
		return left.has(block) ? 'on' : 'struck';
	});
}

/** Latitudes the map draws (iOS TimeCalcWorld). */
export const north = 80;
export const south = -60;
export const mapAspect = 360 / (north - south);

/** Where a place falls on a 360 by (north - south) map, latitude clamped. */
export function mapPoint(lat: number, lon: number) {
	const clamped = Math.min(Math.max(lat, south), north);
	return { x: lon + 180, y: north - clamped };
}

/** Degrees to four places with hemisphere letters (iOS MetadataScan.label). */
export function locationLabel({ lat, lon }: GpsFix) {
	return `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(4)}° ${lon < 0 ? 'W' : 'E'}`;
}

/** Natural Earth 110 m land rings as one SVG path in map units. */
export function landPath(rings: number[][][]): string {
	return rings
		.filter((ring) => ring.length > 2)
		.map(
			(ring) =>
				`M${ring
					.map(
						([lon = 0, lat = 0]) =>
							`${(lon + 180).toFixed(1)} ${(north - lat).toFixed(1)}`,
					)
					.join('L')}Z`,
		)
		.join('');
}
