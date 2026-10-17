/** Colour model, bits per component and alpha flag, as ImageIO reports them (kCGImagePropertyColorModel, Depth, HasAlpha). */
export interface PixelFormat {
	model: string;
	depth: number;
	alpha: boolean;
}

const text = (bytes: Uint8Array, at: number, length = 4) =>
	String.fromCharCode(...bytes.subarray(at, at + length));

// png spec 11.2.2 ihdr
function png(bytes: Uint8Array, view: DataView): PixelFormat | null {
	if (bytes.length < 33 || text(bytes, 12) !== 'IHDR') return null;
	const depth = bytes[24]!;
	const type = bytes[25]!;
	let alpha = type === 4 || type === 6;
	for (let at = 8; !alpha && at + 8 <= bytes.length;) {
		const chunk = text(bytes, at + 4);
		if (chunk === 'IDAT' || chunk === 'IEND') break;
		alpha = chunk === 'tRNS';
		at += 12 + view.getUint32(at);
	}
	return {
		model: type === 0 || type === 4 ? 'Gray' : 'RGB',
		depth,
		alpha,
	};
}

// itu t.81 b.2.2
const SOF = new Set([
	0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
	0xcf,
]);
const JPEG_MODEL: Record<number, string> = { 1: 'Gray', 3: 'RGB', 4: 'CMYK' };

function jpeg(bytes: Uint8Array, view: DataView): PixelFormat | null {
	for (let at = 2; at + 9 < bytes.length;) {
		if (bytes[at] !== 0xff) return null;
		const marker = bytes[at + 1]!;
		if (marker === 0xff) {
			at++;
			continue;
		}
		if (SOF.has(marker)) {
			const model = JPEG_MODEL[bytes[at + 9]!];
			return model
				? { model, depth: bytes[at + 4]!, alpha: false }
				: null;
		}
		at += 2 + view.getUint16(at + 2);
	}
	return null;
}

// webp spec alpha bits
function webp(bytes: Uint8Array, view: DataView): PixelFormat | null {
	if (bytes.length < 30 || text(bytes, 8) !== 'WEBP') return null;
	const alpha = {
		'VP8 ': false,
		VP8X: (bytes[20]! & 0x10) !== 0,
		VP8L: ((view.getUint32(21, true) >>> 28) & 1) === 1,
	}[text(bytes, 12)];
	return alpha === undefined ? null : { model: 'RGB', depth: 8, alpha };
}

/** The format a PNG, JPEG or WebP header declares; null for other files. */
export function pixelFormat(bytes: Uint8Array): PixelFormat | null {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
	if (text(bytes, 1, 3) === 'PNG') return png(bytes, view);
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes, view);
	if (text(bytes, 0) === 'RIFF') return webp(bytes, view);
	return null;
}
