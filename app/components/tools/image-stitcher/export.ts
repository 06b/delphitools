import { encodeJxl } from 'delphitools-v2/lib/jxl';
import {
	drawLayout,
	type Layout,
} from 'delphitools-v2/components/tools/image-stitcher/stitch';

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'jxl';

export const formats: {
	id: ExportFormat;
	label: string;
	mime: string;
	ext: string;
	lossy: boolean;
	alpha: boolean;
}[] = [
	{
		id: 'png',
		label: 'PNG',
		mime: 'image/png',
		ext: 'png',
		lossy: false,
		alpha: true,
	},
	{
		id: 'jpeg',
		label: 'JPEG',
		mime: 'image/jpeg',
		ext: 'jpg',
		lossy: true,
		alpha: false,
	},
	{
		id: 'webp',
		label: 'WebP',
		mime: 'image/webp',
		ext: 'webp',
		lossy: true,
		alpha: true,
	},
	{
		id: 'jxl',
		label: 'JXL',
		mime: 'image/jxl',
		ext: 'jxl',
		lossy: true,
		alpha: true,
	},
];

// the web tool's fixed quality
const quality = 90;

const meta = (id: ExportFormat) => formats.find((f) => f.id === id)!;

// libjxl needs a secure origin
export const jxlAvailable = () =>
	typeof window !== 'undefined' && window.isSecureContext;

/** The layout drawn at its export size; formats without alpha get a white ground. */
export function render(layout: Layout, format: ExportFormat) {
	const canvas = document.createElement('canvas');
	drawLayout(canvas, layout, !meta(format).alpha);
	return canvas;
}

export async function encode(
	canvas: HTMLCanvasElement,
	format: ExportFormat,
): Promise<Blob> {
	if (format === 'jxl')
		return encodeJxl(canvas, { quality, lossless: false });
	const { mime, lossy } = meta(format);
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, mime, lossy ? quality / 100 : undefined),
	);
	if (!blob) throw new Error('Canvas toBlob failed');
	if (blob.type && blob.type !== mime)
		throw new Error(
			`Encoder produced ${blob.type} instead of ${mime}`,
		);
	return blob;
}
