export type PlaceholderFormat = 'png' | 'svg';

export interface PlaceholderSpec {
	width: number;
	height: number;
	/** `#rrggbb` */
	background: string;
	foreground: string;
	text: string;
}

export const maxDimension = 4096;

export const presets = [
	{ label: 'HD', width: 1920, height: 1080 },
	{ label: 'Square', width: 1000, height: 1000 },
	{ label: 'Banner', width: 1200, height: 400 },
	{ label: 'Thumb', width: 300, height: 200 },
	{ label: 'Social', width: 1200, height: 630 },
	{ label: 'Avatar', width: 400, height: 400 },
];

export function placeholderFontSize(width: number, height: number): number {
	return Math.min(width, height) / 8;
}

export function placeholderLabel(
	text: string,
	width: number,
	height: number,
): string {
	return text || `${width} × ${height}`;
}

export function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export function placeholderSvg(spec: PlaceholderSpec): string {
	const { width, height, background, foreground } = spec;
	const fontSize = placeholderFontSize(width, height);
	const label = escapeXml(placeholderLabel(spec.text, width, height));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect fill="${escapeXml(background)}" width="${width}" height="${height}"/>
  <text fill="${escapeXml(foreground)}" font-family="monospace" font-size="${fontSize}" font-weight="bold" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">${label}</text>
</svg>`;
}

// btoa throws above U+00FF
export function base64Utf8(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

export function drawPlaceholder(
	canvas: HTMLCanvasElement,
	spec: PlaceholderSpec,
): void {
	const { width, height } = spec;
	canvas.width = width;
	canvas.height = height;

	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	ctx.fillStyle = spec.background;
	ctx.fillRect(0, 0, width, height);

	ctx.fillStyle = spec.foreground;
	ctx.font = `bold ${placeholderFontSize(width, height)}px monospace`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(
		placeholderLabel(spec.text, width, height),
		width / 2,
		height / 2,
	);
}

/** Width to height in lowest terms, or to two decimals against 1 when the terms stay large. */
export function aspect(width: number, height: number): string {
	if (width <= 0 || height <= 0) return '—';
	const gcd = (a: number, b: number): number =>
		b === 0 ? a : gcd(b, a % b);
	const divisor = gcd(width, height);
	const [w, h] = [width / divisor, height / divisor];
	return Math.max(w, h) <= 64
		? `${w}:${h}`
		: `${(width / height).toFixed(2)}:1`;
}

export const baseName = ({ width, height }: PlaceholderSpec) =>
	`placeholder-${width}x${height}`;
