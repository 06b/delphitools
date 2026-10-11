import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getPdfJs, loadPdfDocument } from 'delphitools-v2/lib/pdfjs';
import { PX_TO_POINTS } from 'delphitools-v2/lib/pdf-pages';
import {
	blankPage,
	contentBox,
	contentPlacement,
	newId,
	pageSize,
	tileTransform,
	totalRotation,
	unrotatedSize,
	type ErrataPage,
	type PageCrop,
	type Rotation,
} from './doc-model';
import { store, setPageIndex } from './store';
import { editedBytes, setContentSource } from './content';

let sourceBytes: Uint8Array | null = null;
let sourcePdf: PDFDocumentProxy | null = null;

export function getSourceBytes(): Uint8Array | null {
	return sourceBytes;
}

async function setSource(bytes: Uint8Array | null): Promise<void> {
	await sourcePdf?.destroy();
	sourcePdf = null;
	sourceBytes = bytes;
	setContentSource(bytes);
	thumbCache.clear();
	if (bytes) sourcePdf = await loadPdfDocument(bytes.slice());
}

// content edits render from a rebuilt PDF; the build is keyed on the edits alone
let edited: { sig: string; pdf: Promise<PDFDocumentProxy | null> } | null =
	null;

function editSig(): string {
	const doc = store.getSnapshot();
	if (!doc) return '';
	return doc.pages
		.filter((p) => p.edits.length > 0)
		.map((p) => `${p.sourceIndex}:${JSON.stringify(p.edits)}`)
		.join('|');
}

store.subscribe(() => {
	const sig = editSig();
	if (edited?.sig === sig) return;
	const previous = edited;
	edited = {
		sig,
		pdf: (async () => {
			await previous?.pdf.then((p) => p?.destroy());
			const doc = store.getSnapshot();
			if (!sig || !doc) return null;
			const bytes = await editedBytes(doc.pages);
			return bytes ? loadPdfDocument(bytes) : null;
		})(),
	};
});

async function activePdf(): Promise<PDFDocumentProxy | null> {
	const e = await edited?.pdf;
	return e ?? sourcePdf;
}

function stripExt(name: string): string {
	return name.replace(/\.[^.]+$/, '');
}

export async function openPdf(file: File): Promise<void> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	await setSource(bytes);
	const pdf = sourcePdf!;
	const pages: ErrataPage[] = [];
	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i);
		const view = page.getViewport({ scale: 1, rotation: 0 });
		pages.push({
			id: newId(),
			sourceIndex: i - 1,
			image: null,
			baseRotation: (((page.rotate % 360) + 360) %
				360) as Rotation,
			rotation: 0,
			baseWidth: view.width,
			baseHeight: view.height,
			crop: null,
			resize: null,
			objects: [],
			edits: [],
		});
	}
	store.setDoc({ name: stripExt(file.name), pages });
	setPageIndex(0);
}

export async function imagePage(file: File): Promise<ErrataPage> {
	const dataUrl = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () =>
			reject(reader.error ?? new Error('read failed'));
		reader.readAsDataURL(file);
	});
	const img = await loadImage(dataUrl);
	const page = blankPage(
		img.naturalWidth * PX_TO_POINTS,
		img.naturalHeight * PX_TO_POINTS,
	);
	return {
		...page,
		image: {
			dataUrl,
			naturalWidth: img.naturalWidth,
			naturalHeight: img.naturalHeight,
		},
	};
}

export async function openImage(file: File): Promise<void> {
	const page = await imagePage(file);
	await setSource(null);
	store.setDoc({ name: stripExt(file.name), pages: [page] });
	setPageIndex(0);
}

export async function openFile(file: File): Promise<void> {
	if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
		await openPdf(file);
	else await openImage(file);
}

export function closeDoc(): void {
	void setSource(null);
	store.setDoc(null);
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
	let p = imageCache.get(src);
	if (!p) {
		p = new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () =>
				reject(new Error('image decode failed'));
			img.src = src;
		});
		imageCache.set(src, p);
	}
	return p;
}

const THUMB_WIDTH = 96;

const thumbCache = new Map<string, Promise<string>>();

function blank(width: number, height: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.ceil(width));
	canvas.height = Math.max(1, Math.ceil(height));
	return canvas;
}

/** the whole source box, unrotated, or null for blank pages */
async function contentCanvas(
	page: ErrataPage,
	scale: number,
): Promise<HTMLCanvasElement | null> {
	if (page.image) {
		const img = await loadImage(page.image.dataUrl);
		const canvas = blank(
			page.baseWidth * scale,
			page.baseHeight * scale,
		);
		canvas.getContext('2d')!.drawImage(
			img,
			0,
			0,
			canvas.width,
			canvas.height,
		);
		return canvas;
	}
	if (page.sourceIndex === null) return null;
	const pdf = await activePdf();
	if (!pdf) return null;
	const src = await pdf.getPage(page.sourceIndex + 1);
	const viewport = src.getViewport({ scale, rotation: 0 });
	const canvas = blank(viewport.width, viewport.height);
	await src.render({
		canvasContext: canvas.getContext('2d')!,
		viewport,
		canvas,
	}).promise;
	return canvas;
}

async function rasterise(
	page: ErrataPage,
	scale: number,
): Promise<HTMLCanvasElement> {
	const u = unrotatedSize(page);
	const c = contentBox(page);
	const p = contentPlacement(page);
	const flat = blank(u.width * scale, u.height * scale);
	const ctx = flat.getContext('2d')!;
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, flat.width, flat.height);
	const content = await contentCanvas(page, scale);
	if (content)
		ctx.drawImage(
			content,
			c.x * scale,
			c.y * scale,
			c.width * scale,
			c.height * scale,
			p.x * scale,
			p.y * scale,
			c.width * p.scale * scale,
			c.height * p.scale * scale,
		);
	const r = totalRotation(page);
	if (r === 0) return flat;
	const { width, height } = pageSize(page);
	const out = blank(width * scale, height * scale);
	const octx = out.getContext('2d')!;
	octx.translate(out.width / 2, out.height / 2);
	octx.rotate((r * Math.PI) / 180);
	octx.drawImage(flat, -flat.width / 2, -flat.height / 2);
	return out;
}

/** changes whenever the raster would */
export function pageKey(page: ErrataPage): string {
	return `${page.id}:${page.rotation}:${JSON.stringify(page.crop)}:${JSON.stringify(page.resize)}:${JSON.stringify(page.edits)}`;
}

export interface TileJob {
	promise: Promise<HTMLCanvasElement>;
	cancel: () => void;
}

/** the displayed `region` of a page, rendered fresh at `scale` px per point */
export function renderTile(
	page: ErrataPage,
	region: PageCrop,
	scale: number,
): TileJob {
	const canvas = blank(region.width * scale, region.height * scale);
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	const m = tileTransform(page, region, scale);
	const c = contentBox(page);
	// nothing outside the content box shows
	ctx.setTransform(...m);
	ctx.beginPath();
	ctx.rect(c.x, c.y, c.width, c.height);
	ctx.clip();
	let cancelled = false;
	let task: { cancel: () => void } | null = null;
	const promise = (async () => {
		if (page.image) {
			const img = await loadImage(page.image.dataUrl);
			if (!cancelled)
				ctx.drawImage(
					img,
					0,
					0,
					page.baseWidth,
					page.baseHeight,
				);
			return canvas;
		}
		if (page.sourceIndex === null) return canvas;
		const pdf = await activePdf();
		if (!pdf || cancelled) return canvas;
		const src = await pdf.getPage(page.sourceIndex + 1);
		if (cancelled) return canvas;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		const render = src.render({
			canvasContext: ctx,
			canvas,
			viewport: src.getViewport({ scale: 1, rotation: 0 }),
			transform: m,
		});
		task = render;
		try {
			await render.promise;
		} catch (error) {
			if (!cancelled) throw error;
		}
		return canvas;
	})();
	return {
		promise,
		cancel: () => {
			cancelled = true;
			task?.cancel();
		},
	};
}

export function renderThumb(
	page: ErrataPage,
	width = THUMB_WIDTH,
): Promise<string> {
	const k = `${pageKey(page)}:${width}`;
	let p = thumbCache.get(k);
	if (!p) {
		p = rasterise(page, width / pageSize(page).width).then((c) =>
			c.toDataURL('image/png'),
		);
		thumbCache.set(k, p);
	}
	return p;
}

export interface PageFontFace {
	/** CSS font-family pdf.js registered for this font */
	family: string;
	/** charcodes → the string that shows those glyphs in `family` */
	display(codes: number[]): string;
}

// pdf.js internals, not in its public typings. commonObjs holds FontFaceObjects
// (name, loadedName, data); the charcode → glyph mapping only exists in the
// worker, so it is read off the glyphs the page's operator list shows.
interface PdfJsGlyph {
	originalCharCode: number;
	fontChar: string;
}
interface PdfJsFontFace {
	name: string;
	loadedName: string;
}

function bare(name: string): string {
	return name.replace(/^[A-Z]{6}\+/, '');
}

/** the font face pdf.js converted and registered for a page font, by BaseFont name */
export async function pageFontFace(
	sourceIndex: number,
	baseFont: string,
): Promise<PageFontFace | null> {
	if (!sourcePdf) return null;
	const page = await sourcePdf.getPage(sourceIndex + 1);
	const { OPS } = await getPdfJs();
	// building the operator list loads the page's fonts into commonObjs and the document
	const ops = await page.getOperatorList();
	const glyphsByFont = new Map<string, Map<number, string>>();
	let current = '';
	ops.fnArray.forEach((fn, i) => {
		if (fn === OPS.setFont) {
			current = (ops.argsArray[i] as [string])[0];
			if (!glyphsByFont.has(current))
				glyphsByFont.set(current, new Map());
		} else if (fn === OPS.showText && current) {
			const map = glyphsByFont.get(current)!;
			for (const g of (
				ops.argsArray[i] as [(PdfJsGlyph | number)[]]
			)[0])
				if (
					typeof g === 'object' &&
					g &&
					!map.has(g.originalCharCode)
				)
					map.set(g.originalCharCode, g.fontChar);
		}
	});
	const want = bare(baseFont);
	const faces: { key: string; face: PdfJsFontFace }[] = [];
	for (const key of glyphsByFont.keys())
		if (page.commonObjs.has(key))
			faces.push({
				key,
				face: page.commonObjs.get(key) as PdfJsFontFace,
			});
	const hit =
		faces.find((f) => bare(f.face.name) === want) ??
		faces.find((f) => bare(f.face.name).startsWith(want));
	if (!hit) return null;
	const known = glyphsByFont.get(hit.key)!;
	return {
		family: hit.face.loadedName || hit.key,
		// a code the page never shows has no known glyph string; the unicode guess holds for Latin simple fonts
		display: (codes) =>
			codes
				.map(
					(c) =>
						known.get(c) ??
						String.fromCharCode(c),
				)
				.join(''),
	};
}

/** dev rig: which document tiles render from */
export async function debugActivePdf(): Promise<{
	edited: boolean;
	pages: number;
	firstPageOps: number;
} | null> {
	const pdf = await activePdf();
	if (!pdf) return null;
	const page = await pdf.getPage(1);
	const ops = await page.getOperatorList();
	return {
		edited: pdf !== sourcePdf,
		pages: pdf.numPages,
		firstPageOps: ops.fnArray.length,
	};
}
