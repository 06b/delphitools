import { PDFDict, PDFDocument, PDFName, type PDFPage } from 'pdf-lib';
import {
	applyMatrix,
	bounds,
	pageSize,
	tileTransform,
	type ContentEdit,
	type ErrataPage,
	type Matrix,
} from './doc-model';
import {
	groupLines,
	readPageContent,
	type Box,
	type ContentItem,
	type PageContent,
	type TextLine,
} from './content/interpret';
import { SUBSTITUTE_RES, rewriteStream } from './content/rewrite';

export interface DisplayedBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PageContentView {
	content: PageContent;
	lines: TextLine[];
	/** user space box → displayed page space (points, y down, rotation and crop applied) */
	toDisplayed(box: Box): DisplayedBox;
	/** displayed delta → user space delta */
	toUserDelta(dx: number, dy: number): { dx: number; dy: number };
	toDisplayedPoint(x: number, y: number): { x: number; y: number };
}

let sourceBytes: Uint8Array | null = null;
let clean: Promise<PDFDocument> | null = null;
const cache = new Map<string, PageContent>();

/** source.ts hands the open PDF's bytes over; null closes it */
export function setContentSource(
	bytes: Uint8Array | null,
	loaded?: Promise<PDFDocument>,
): void {
	sourceBytes = bytes;
	clean = loaded ?? null;
	cache.clear();
}

export function loadSourceDoc(bytes: Uint8Array): Promise<PDFDocument> {
	return PDFDocument.load(bytes, {
		ignoreEncryption: true,
		updateMetadata: false,
	});
}

function cleanDoc(): Promise<PDFDocument> | null {
	if (!sourceBytes) return null;
	if (!clean) clean = loadSourceDoc(sourceBytes);
	return clean;
}

/** the page's edits replayed on its streams; returns the rewritten streams and the content after them */
export function applyPageEdits(
	src: PDFPage,
	edits: ContentEdit[],
): { content: PageContent; streams: Map<string, Uint8Array> } {
	const streams = new Map<string, Uint8Array>();
	let content = readPageContent(src);
	const substituted = edits.filter((e) => e.kind === 'text' && e.font);
	if (substituted.length) {
		for (const e of substituted)
			addSubstituteFont(src, content, e.stream);
		content = readPageContent(src);
	}
	for (const edit of edits) {
		const target =
			edit.stream === ''
				? content
				: content.forms.get(edit.stream);
		if (!target) continue;
		const bytes = rewriteStream(
			target,
			content.items.filter((it) => it.stream === edit.stream),
			edit,
		);
		streams.set(edit.stream, bytes);
		content = readPageContent(src, streams);
	}
	return { content, streams };
}

/** a standard Helvetica dict under SUBSTITUTE_RES in the resources the stream reads its fonts from */
function addSubstituteFont(
	src: PDFPage,
	content: PageContent,
	stream: string,
): void {
	const ctx = src.doc.context;
	const form = stream ? content.forms.get(stream) : undefined;
	let res = form
		? ctx.lookupMaybe(
				form.dict.get(PDFName.of('Resources')),
				PDFDict,
			)
		: undefined;
	if (!res) {
		res = ctx.lookupMaybe(
			src.node.get(PDFName.of('Resources')),
			PDFDict,
		);
		if (!res) {
			// inherited from the page tree: give the page its own copy, the shared one stays as it is
			const inherited = ctx.lookupMaybe(
				src.node.getInheritableAttribute(
					PDFName.of('Resources'),
				),
				PDFDict,
			);
			res = ctx.obj({});
			if (inherited)
				for (const [k, v] of inherited.entries())
					res.set(k, v);
			src.node.set(PDFName.of('Resources'), res);
		}
	}
	let fonts = ctx.lookupMaybe(res.get(PDFName.of('Font')), PDFDict);
	if (!fonts) {
		fonts = ctx.obj({});
		res.set(PDFName.of('Font'), fonts);
	}
	if (fonts.has(PDFName.of(SUBSTITUTE_RES))) return;
	fonts.set(
		PDFName.of(SUBSTITUTE_RES),
		ctx.register(
			ctx.obj({
				Type: 'Font',
				Subtype: 'Type1',
				BaseFont: 'Helvetica',
				Encoding: 'WinAnsiEncoding',
			}),
		),
	);
}

export async function pageContent(
	page: ErrataPage,
): Promise<PageContentView | null> {
	if (page.sourceIndex === null) return null;
	const docPromise = cleanDoc();
	if (!docPromise) return null;
	const doc = await docPromise;
	const src = doc.getPage(page.sourceIndex);
	const key = `${page.sourceIndex}:${JSON.stringify(page.edits)}`;
	let content = cache.get(key);
	if (!content) {
		content = applyPageEdits(src, page.edits).content;
		cache.set(key, content);
	}
	const crop = src.getCropBox();
	const size = pageSize(page);
	const m = tileTransform(
		page,
		{ x: 0, y: 0, width: size.width, height: size.height },
		1,
	);
	const toDisplayedPoint = (ux: number, uy: number) =>
		applyMatrix(m, ux - crop.x, crop.y + crop.height - uy);
	const toDisplayed = (b: Box): DisplayedBox =>
		bounds(
			[
				[b.x0, b.y0],
				[b.x1, b.y0],
				[b.x0, b.y1],
				[b.x1, b.y1],
			].map(([ux, uy]) => toDisplayedPoint(ux!, uy!)),
		);
	const toUserDelta = (dx: number, dy: number) => {
		const d = invertLinear(m, dx, dy);
		// source box space is y down
		return { dx: d.x, dy: -d.y };
	};
	return {
		content,
		lines: groupLines(content.items),
		toDisplayed,
		toUserDelta,
		toDisplayedPoint,
	};
}

function invertLinear(m: Matrix, x: number, y: number) {
	const [a, b, c, d] = m;
	const det = a * d - b * c || 1;
	return { x: (d * x - c * y) / det, y: (a * y - b * x) / det };
}

/** write every page's edits into `doc` (a pdf-lib document of the same source) */
export function applyEditsToDoc(doc: PDFDocument, pages: ErrataPage[]): void {
	const ctx = doc.context;
	const done = new Set<number>();
	for (const page of pages) {
		if (page.sourceIndex === null || page.edits.length === 0)
			continue;
		// copies share edits
		if (done.has(page.sourceIndex)) continue;
		done.add(page.sourceIndex);
		const src = doc.getPage(page.sourceIndex);
		const { content, streams } = applyPageEdits(src, page.edits);
		for (const [path, bytes] of streams) {
			const stream = ctx.flateStream(bytes);
			if (path === '') {
				src.node.set(
					PDFName.of('Contents'),
					ctx.register(stream),
				);
				continue;
			}
			const form = content.forms.get(path);
			if (!form) continue;
			for (const [k, v] of form.dict.entries()) {
				const key = k.decodeText();
				if (
					key === 'Length' ||
					key === 'Filter' ||
					key === 'DecodeParms'
				)
					continue;
				stream.dict.set(k, v);
			}
			// ponytail: a form shared by several pages changes on all of them
			form.parent.set(
				PDFName.of(form.name),
				ctx.register(stream),
			);
		}
	}
}

/** the source PDF with all edits applied, for rendering */
export async function editedBytes(
	pages: ErrataPage[],
): Promise<Uint8Array | null> {
	if (!sourceBytes) return null;
	// ponytail: a fresh load per build; cache the document and restore streams if this is slow on big files
	const doc = await loadSourceDoc(sourceBytes);
	applyEditsToDoc(doc, pages);
	return doc.save({ useObjectStreams: false });
}

export type { ContentItem, TextLine };
