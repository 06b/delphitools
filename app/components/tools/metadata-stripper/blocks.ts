import type { MetadataReport } from 'delphitools-v2/lib/metadata';

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
