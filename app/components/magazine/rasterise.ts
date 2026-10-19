import { domToCanvas } from 'modern-screenshot';

export interface LinkRect {
	href: string;
	u0: number;
	v0: number;
	u1: number;
	v1: number;
}

// 10 pages of 1536 px RGBA with mipmaps stay near 100 MB of GPU memory
const MAX_TEXTURE_HEIGHT = 1536;

/** Device px per CSS px for a page `pageHeight` CSS px tall that shows `screenHeight` CSS px tall. */
export function textureScale(pageHeight: number, screenHeight: number) {
	const wanted =
		(screenHeight * (window.devicePixelRatio || 1)) / pageHeight;
	return Math.min(MAX_TEXTURE_HEIGHT / pageHeight, Math.max(1, wanted));
}

export function linkRects(page: HTMLElement): LinkRect[] {
	const box = page.getBoundingClientRect();
	return [
		...page.querySelectorAll<HTMLAnchorElement>(
			'[data-magazine-link]',
		),
	].map((link) => {
		const rect = link.getBoundingClientRect();
		return {
			href: link.getAttribute('href') ?? '',
			u0: (rect.left - box.left) / box.width,
			v0: (rect.top - box.top) / box.height,
			u1: (rect.right - box.left) / box.width,
			v1: (rect.bottom - box.top) / box.height,
		};
	});
}

export function rasterise(page: HTMLElement, scale: number) {
	return domToCanvas(page, {
		scale,
		width: page.offsetWidth,
		height: page.offsetHeight,
	});
}
