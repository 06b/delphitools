import { encodeJxl } from 'delphitools-v2/lib/jxl';
import { encodeGif, type GifQuantisation } from 'delphitools-v2/lib/gif';
import { encodeTiff } from 'delphitools-v2/lib/tiff';

export type ImageFormat =
	| 'png'
	| 'jpeg'
	| 'webp'
	| 'jxl'
	| 'gif'
	| 'bmp'
	| 'tiff'
	| 'ico'
	| 'icns';

export type ResizeMode = 'original' | 'percentage' | 'custom';

export const FORMATS: { id: ImageFormat; label: string }[] = [
	{ id: 'png', label: 'PNG' },
	{ id: 'jpeg', label: 'JPEG' },
	{ id: 'webp', label: 'WebP' },
	{ id: 'jxl', label: 'JXL' },
	{ id: 'gif', label: 'GIF' },
	{ id: 'bmp', label: 'BMP' },
	{ id: 'tiff', label: 'TIFF' },
	{ id: 'ico', label: 'ICO' },
	{ id: 'icns', label: 'ICNS' },
];

export const RESIZE_MODES: { id: ResizeMode; label: string }[] = [
	{ id: 'original', label: 'Original' },
	{ id: 'percentage', label: 'Percentage' },
	{ id: 'custom', label: 'Custom' },
];

export const SCALE_PRESETS = [25, 50, 75, 150, 200];
export const ICO_SIZES = [16, 32, 48, 64, 128, 256];
export const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];
export const BIT_DEPTHS = [24, 32] as const;

export const QUANTISATIONS: { value: GifQuantisation; label: string }[] = [
	{ value: 'rgb565', label: 'RGB565 (best quality)' },
	{ value: 'rgb444', label: 'RGB444 (smaller)' },
	{ value: 'rgba4444', label: 'RGBA4444 (with transparency)' },
];

const ICNS_TYPES: Record<number, string> = {
	16: 'icp4',
	32: 'icp5',
	64: 'icp6',
	128: 'ic07',
	256: 'ic08',
	512: 'ic09',
	1024: 'ic10',
};

export interface Size {
	width: number;
	height: number;
}

export interface Settings {
	format: ImageFormat;
	resize: ResizeMode;
	percentage: number;
	/** Custom size; 0 until the first source sets it. */
	width: number;
	height: number;
	lock: boolean;
	/** With `lock`, the typed side; the other follows each image's aspect. */
	drives: 'width' | 'height';
	pngTransparency: boolean;
	pngBackground: string;
	jpegQuality: number;
	jpegBackground: string;
	webpLossless: boolean;
	webpQuality: number;
	jxlLossless: boolean;
	jxlQuality: number;
	gifMaxColours: number;
	gifQuantisation: GifQuantisation;
	bmpBitDepth: 24 | 32;
	icoMultiSize: boolean;
	icoSize: number;
	icnsMultiSize: boolean;
	icnsSize: number;
}

export const DEFAULTS: Settings = {
	format: 'webp',
	resize: 'original',
	percentage: 100,
	width: 0,
	height: 0,
	lock: true,
	drives: 'width',
	pngTransparency: true,
	pngBackground: '#ffffff',
	jpegQuality: 90,
	jpegBackground: '#ffffff',
	webpLossless: false,
	webpQuality: 90,
	jxlLossless: false,
	jxlQuality: 90,
	gifMaxColours: 256,
	gifQuantisation: 'rgb565',
	bmpBitDepth: 32,
	icoMultiSize: false,
	icoSize: 32,
	icnsMultiSize: false,
	icnsSize: 128,
};

export const extensionOf = (format: ImageFormat) =>
	format === 'jpeg' ? 'jpg' : format;

export const outputName = (name: string, format: ImageFormat) =>
	`${name.replace(/\.[^.]+$/, '') || 'image'}.${extensionOf(format)}`;

/** The size each image is drawn at before encoding. */
export function targetSize(natural: Size, settings: Settings): Size {
	const { resize, percentage, width, height, lock, drives } = settings;
	if (resize === 'percentage') {
		const scale = percentage / 100;
		return {
			width: Math.max(1, Math.round(natural.width * scale)),
			height: Math.max(1, Math.round(natural.height * scale)),
		};
	}
	if (resize !== 'custom' || !width || !height) return natural;
	if (!lock) return { width, height };
	if (drives === 'height')
		return {
			width: Math.max(
				1,
				Math.round(
					(height * natural.width) /
						natural.height,
				),
			),
			height,
		};
	return {
		width,
		height: Math.max(
			1,
			Math.round((width * natural.height) / natural.width),
		),
	};
}

function iconSizes(settings: Settings): number[] {
	if (settings.format === 'ico')
		return settings.icoMultiSize ? ICO_SIZES : [settings.icoSize];
	return (
		settings.icnsMultiSize ? ICNS_SIZES : [settings.icnsSize]
	).filter((size) => ICNS_TYPES[size]);
}

/** The pixels of the written file: icons are the largest square they hold. */
export function outputSize(natural: Size, settings: Settings): Size {
	if (settings.format !== 'ico' && settings.format !== 'icns')
		return targetSize(natural, settings);
	const side = Math.max(...iconSizes(settings));
	return { width: side, height: side };
}

export function backgroundFill(settings: Settings): string | null {
	const { format } = settings;
	if (format === 'jpeg') return settings.jpegBackground;
	if (format === 'png' && !settings.pngTransparency)
		return settings.pngBackground;
	if (format === 'bmp' && settings.bmpBitDepth === 24) return '#ffffff';
	return null;
}

export function keepsAlpha(settings: Settings): boolean {
	switch (settings.format) {
		case 'png':
			return settings.pngTransparency;
		case 'jpeg':
			return false;
		case 'gif':
			return settings.gifQuantisation === 'rgba4444';
		case 'bmp':
			return settings.bmpBitDepth === 32;
		default:
			return true;
	}
}

export function isLossy(settings: Settings): boolean {
	const { format } = settings;
	return (
		format === 'jpeg' ||
		(format === 'webp' && !settings.webpLossless) ||
		(format === 'jxl' && !settings.jxlLossless)
	);
}

/** "12.3 KB" as the figure and its unit. */
export function figureOf(text: string): [string, string] {
	const at = text.lastIndexOf(' ');
	return [text.slice(0, at), text.slice(at + 1)];
}

export function canvasToBlob(
	canvas: HTMLCanvasElement,
	mimeType: string,
	quality?: number,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) =>
				blob
					? resolve(blob)
					: reject(
							new Error(
								'Canvas toBlob failed',
							),
						),
			mimeType,
			quality === undefined ? undefined : quality / 100,
		);
	});
}

export function prepareCanvas(
	image: CanvasImageSource,
	{ width, height }: Size,
	background: string | null,
): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) throw new Error('No 2D context');
	if (background) {
		context.fillStyle = background;
		context.fillRect(0, 0, width, height);
	}
	context.drawImage(image, 0, 0, width, height);
	return canvas;
}

function imageData(canvas: HTMLCanvasElement): ImageData {
	return canvas
		.getContext('2d')!
		.getImageData(0, 0, canvas.width, canvas.height);
}

async function resizedPngs(
	canvas: HTMLCanvasElement,
	sizes: number[],
): Promise<ArrayBuffer[]> {
	const square = document.createElement('canvas');
	const context = square.getContext('2d')!;
	const buffers: ArrayBuffer[] = [];
	for (const size of sizes) {
		square.width = size;
		square.height = size;
		context.clearRect(0, 0, size, size);
		context.drawImage(canvas, 0, 0, size, size);
		buffers.push(
			await (
				await canvasToBlob(square, 'image/png')
			).arrayBuffer(),
		);
	}
	return buffers;
}

export function encodeBmp(data: ImageData, bitDepth: 24 | 32): Blob {
	const { width, height } = data;
	const pixels = data.data;
	const bytesPerPixel = bitDepth / 8;
	const rowSize = Math.ceil((width * bytesPerPixel) / 4) * 4;
	const pixelDataSize = rowSize * height;
	const headerSize = 14 + 40;
	const fileSize = headerSize + pixelDataSize;

	const buffer = new ArrayBuffer(fileSize);
	const view = new DataView(buffer);

	view.setUint8(0, 0x42);
	view.setUint8(1, 0x4d);
	view.setUint32(2, fileSize, true);
	view.setUint32(10, headerSize, true);

	view.setUint32(14, 40, true);
	view.setInt32(18, width, true);
	// top-down bmp rows
	view.setInt32(22, -height, true);
	view.setUint16(26, 1, true);
	view.setUint16(28, bitDepth, true);
	view.setUint32(30, 0, true);
	view.setUint32(34, pixelDataSize, true);
	// 72 dpi
	view.setUint32(38, 2835, true);
	view.setUint32(42, 2835, true);

	for (let y = 0; y < height; y++) {
		let offset = headerSize + y * rowSize;
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			view.setUint8(offset++, pixels[i + 2]!);
			view.setUint8(offset++, pixels[i + 1]!);
			view.setUint8(offset++, pixels[i]!);
			if (bitDepth === 32)
				view.setUint8(offset++, pixels[i + 3]!);
		}
	}

	return new Blob([buffer], { type: 'image/bmp' });
}

// ico header with pngs
export function buildIco(sizes: number[], pngs: ArrayBuffer[]): Blob {
	const headerSize = 6 + sizes.length * 16;
	const buffer = new ArrayBuffer(
		headerSize + pngs.reduce((sum, png) => sum + png.byteLength, 0),
	);
	const view = new DataView(buffer);

	view.setUint16(0, 0, true);
	view.setUint16(2, 1, true);
	view.setUint16(4, sizes.length, true);

	let dataOffset = headerSize;
	sizes.forEach((size, i) => {
		const entry = 6 + i * 16;
		const png = pngs[i]!;
		// zero encodes 256 pixels
		view.setUint8(entry, size >= 256 ? 0 : size);
		view.setUint8(entry + 1, size >= 256 ? 0 : size);
		view.setUint8(entry + 2, 0);
		view.setUint8(entry + 3, 0);
		view.setUint16(entry + 4, 1, true);
		view.setUint16(entry + 6, 32, true);
		view.setUint32(entry + 8, png.byteLength, true);
		view.setUint32(entry + 12, dataOffset, true);
		new Uint8Array(buffer, dataOffset, png.byteLength).set(
			new Uint8Array(png),
		);
		dataOffset += png.byteLength;
	});

	return new Blob([buffer], { type: 'image/x-icon' });
}

// icns big-endian png blocks
export function buildIcns(types: string[], pngs: ArrayBuffer[]): Blob {
	const fileSize =
		8 + pngs.reduce((sum, png) => sum + 8 + png.byteLength, 0);
	const buffer = new ArrayBuffer(fileSize);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);

	bytes.set([0x69, 0x63, 0x6e, 0x73]);
	view.setUint32(4, fileSize, false);

	let offset = 8;
	types.forEach((type, i) => {
		const png = pngs[i]!;
		for (let c = 0; c < 4; c++)
			bytes[offset + c] = type.charCodeAt(c);
		view.setUint32(offset + 4, 8 + png.byteLength, false);
		new Uint8Array(buffer, offset + 8, png.byteLength).set(
			new Uint8Array(png),
		);
		offset += 8 + png.byteLength;
	});

	return new Blob([buffer], { type: 'image/x-icns' });
}

export async function encode(
	canvas: HTMLCanvasElement,
	settings: Settings,
): Promise<Blob> {
	switch (settings.format) {
		case 'png':
			return canvasToBlob(canvas, 'image/png');
		case 'jpeg':
			return canvasToBlob(
				canvas,
				'image/jpeg',
				settings.jpegQuality,
			);
		case 'webp':
			return canvasToBlob(
				canvas,
				'image/webp',
				settings.webpLossless
					? 100
					: settings.webpQuality,
			);
		case 'jxl':
			return encodeJxl(canvas, {
				quality: settings.jxlQuality,
				lossless: settings.jxlLossless,
			});
		case 'gif': {
			const data = imageData(canvas);
			return new Blob(
				[
					encodeGif(
						data.data,
						data.width,
						data.height,
						settings.gifMaxColours,
						settings.gifQuantisation,
					),
				],
				{ type: 'image/gif' },
			);
		}
		case 'bmp':
			return encodeBmp(
				imageData(canvas),
				settings.bmpBitDepth,
			);
		case 'tiff': {
			const data = imageData(canvas);
			return new Blob(
				[
					encodeTiff(
						data.data,
						data.width,
						data.height,
					),
				],
				{ type: 'image/tiff' },
			);
		}
		case 'ico': {
			const sizes = iconSizes(settings);
			return buildIco(
				sizes,
				await resizedPngs(canvas, sizes),
			);
		}
		case 'icns': {
			const sizes = iconSizes(settings);
			return buildIcns(
				sizes.map((size) => ICNS_TYPES[size]!),
				await resizedPngs(canvas, sizes),
			);
		}
	}
}

/** One image through the settings, as the file it writes. */
export async function convert(
	image: CanvasImageSource,
	natural: Size,
	settings: Settings,
): Promise<Blob> {
	return encode(
		prepareCanvas(
			image,
			targetSize(natural, settings),
			backgroundFill(settings),
		),
		settings,
	);
}

// ponytail: samples a copy at most 512 px across; a lone transparent pixel can average out
export function hasAlpha(image: CanvasImageSource, natural: Size): boolean {
	const scale = Math.min(
		1,
		512 / Math.max(natural.width, natural.height),
	);
	const canvas = prepareCanvas(
		image,
		{
			width: Math.max(1, Math.round(natural.width * scale)),
			height: Math.max(1, Math.round(natural.height * scale)),
		},
		null,
	);
	const { data } = imageData(canvas);
	for (let i = 3; i < data.length; i += 4)
		if (data[i]! < 255) return true;
	return false;
}
