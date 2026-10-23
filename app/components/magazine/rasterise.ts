import { createContext, destroyContext, domToCanvas } from 'modern-screenshot';

export interface LinkRect {
	href: string;
	u0: number;
	v0: number;
	u1: number;
	v1: number;
}

// 10 pages of 2048 px RGBA with mipmaps stay near 170 MB of GPU memory
const MAX_TEXTURE_HEIGHT = 2048;

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

// modern-screenshot 4.7.0 reads default styles from a srcdoc iframe without
// waiting for it; Firefox's blank first document has no UA styles
function loadedSandbox(doc: Document) {
	const frame = doc.createElement('iframe');
	frame.width = '0';
	frame.height = '0';
	frame.style.visibility = 'hidden';
	frame.style.position = 'fixed';
	const loaded = new Promise<HTMLIFrameElement>((resolve) =>
		frame.addEventListener('load', () => resolve(frame), {
			once: true,
		}),
	);
	frame.srcdoc = '<!DOCTYPE html><meta charset="UTF-8"><body>';
	doc.body.append(frame);
	return loaded;
}

export async function rasterise(page: HTMLElement, scale: number) {
	const context = await createContext(page, {
		scale,
		width: page.offsetWidth,
		height: page.offsetHeight,
		// the default-style diff drops text-decoration: none on links;
		// without an href the copy gets no UA link style
		onCloneEachNode: (node) => {
			if (node instanceof HTMLAnchorElement)
				node.removeAttribute('href');
		},
	});
	context.sandbox = await loadedSandbox(page.ownerDocument);
	try {
		return await domToCanvas(context);
	} finally {
		destroyContext(context);
	}
}
