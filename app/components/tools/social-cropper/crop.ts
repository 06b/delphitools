export interface Size {
	width: number;
	height: number;
}

export interface Point {
	x: number;
	y: number;
}

export interface Rect extends Point, Size {}

export interface CropRatio {
	name: string;
	width: number;
	height: number;
	/** e.g. 1.91:1 */
	label: string;
}

export interface CropPlatform {
	/** Lowercase name, used in the export file name and ?cropPlatform. */
	id: string;
	name: string;
	ratios: CropRatio[];
}

const ratio = (name: string, width: number, height: number): CropRatio => ({
	name,
	width,
	height,
	label: `${width}:${height}`,
});

const platform = (name: string, ratios: CropRatio[]): CropPlatform => ({
	id: name.toLowerCase(),
	name,
	ratios,
});

// the iOS CropPresets, which cite a source per platform; x omitted there
export const platforms: CropPlatform[] = [
	platform('Bluesky', [
		ratio('Square', 1, 1),
		ratio('Landscape', 16, 9),
		ratio('Portrait', 3, 4),
		ratio('Wide', 2, 1),
	]),
	platform('Facebook', [
		ratio('Portrait', 4, 5),
		ratio('Square', 1, 1),
		ratio('Landscape', 1.91, 1),
		ratio('Stories', 9, 16),
	]),
	platform('Instagram', [
		ratio('Square', 1, 1),
		ratio('Portrait', 3, 4),
		ratio('Classic', 4, 5),
		ratio('Landscape', 1.91, 1),
		ratio('Reels', 9, 16),
	]),
	platform('LinkedIn', [
		ratio('Square', 1, 1),
		ratio('Portrait', 4, 5),
		ratio('Landscape', 1.91, 1),
	]),
	platform('Mastodon', [ratio('Preview', 16, 9)]),
	platform('Pinterest', [ratio('Portrait', 2, 3), ratio('Square', 1, 1)]),
	platform('Threads', [
		ratio('Square', 1, 1),
		ratio('Portrait', 4, 5),
		ratio('Landscape', 1.91, 1),
		ratio('Stories', 9, 16),
	]),
	platform('TikTok', [
		ratio('Portrait', 9, 16),
		ratio('Square', 1, 1),
		ratio('Landscape', 16, 9),
	]),
	platform('YouTube', [
		ratio('Thumbnail', 16, 9),
		ratio('Shorts', 9, 16),
		ratio('Post', 1, 1),
	]),
];

export const instagram = platforms.find(({ id }) => id === 'instagram')!;

/** The blank sheet's shape before an image arrives. */
export const emptyPixels: Size = { width: 1600, height: 1200 };

/** The largest crop of `aspect` in `size` round `centre`, kept inside, in whole pixels. */
export function crop(aspect: number, size: Size, centre: Point): Rect {
	if (!(size.width > 0 && size.height > 0 && aspect > 0))
		return { x: 0, y: 0, width: 0, height: 0 };
	// rounding the size first keeps the crop inside the image
	const width = Math.round(Math.min(size.width, size.height * aspect));
	const height = Math.round(Math.min(size.height, width / aspect));
	const place = (middle: number, side: number, room: number) =>
		Math.min(
			Math.max(Math.round(middle - side / 2), 0),
			room - side,
		);
	return {
		x: place(centre.x, width, size.width),
		y: place(centre.y, height, size.height),
		width,
		height,
	};
}

export const middle = ({ x, y, width, height }: Rect): Point => ({
	x: x + width / 2,
	y: y + height / 2,
});

/** Same-named ratio on the new platform, else its first. */
export function sameRatio(next: CropPlatform, current: CropRatio): CropRatio {
	return (
		next.ratios.find(({ name }) => name === current.name) ??
		next.ratios[0]!
	);
}

export const fileName = (
	stem: string,
	platform: CropPlatform,
	ratio: CropRatio,
) => `${stem}-${platform.id}-${ratio.label}.png`;
