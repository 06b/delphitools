import {
	A4_POINTS,
	blankPage,
	newId,
	pageSize,
	rotatePage,
	withCrop,
	withResize,
	type ContentEdit,
	type ErrataPage,
	type PageCrop,
	type PageResize,
} from './doc-model';
import {
	addObject,
	currentPage,
	getPageIndex,
	setPageIndex,
	store,
	updatePage,
} from './store';
import { duplicatePages, updatePages } from './organise';
import { imagePage } from './source';
import { textObject } from './stamps';
import { setActiveTool } from './tool';
import { selectObject } from './ui';

export function rotateCurrent(pageId: string, turns: 1 | -1): void {
	updatePage(pageId, (page) => rotatePage(page, turns));
}

export function deletePage(pageId: string): void {
	store.update((doc) => {
		if (doc.pages.length <= 1) return doc;
		return {
			...doc,
			pages: doc.pages.filter((p) => p.id !== pageId),
		};
	});
	setPageIndex(getPageIndex());
}

export function insertPageAt(index: number, page: ErrataPage): void {
	store.update((doc) => {
		const pages = doc.pages.slice();
		pages.splice(
			Math.max(0, Math.min(index, pages.length)),
			0,
			page,
		);
		return { ...doc, pages };
	});
	const doc = store.getSnapshot();
	if (doc) setPageIndex(doc.pages.findIndex((p) => p.id === page.id));
}

export function insertPageAfter(pageId: string | null, page: ErrataPage): void {
	const doc = store.getSnapshot();
	const at = pageId
		? (doc?.pages.findIndex((p) => p.id === pageId) ?? -1)
		: -1;
	insertPageAt(at + 1, page);
}

function sizeOf(pageId: string): { width: number; height: number } {
	const ref = store.getSnapshot()?.pages.find((p) => p.id === pageId);
	return ref ? pageSize(ref) : A4_POINTS;
}

export function insertBlankAfter(pageId: string): void {
	const { width, height } = sizeOf(pageId);
	insertPageAfter(pageId, blankPage(width, height));
}

export function duplicateAfter(pageId: string): void {
	updatePages((pages) => duplicatePages(pages, new Set([pageId])));
	const doc = store.getSnapshot();
	if (doc) setPageIndex(doc.pages.findIndex((p) => p.id === pageId) + 1);
}

/** one black pixel image */
export function insertBlackAfter(pageId: string): void {
	const { width, height } = sizeOf(pageId);
	const pixel = document.createElement('canvas');
	pixel.width = pixel.height = 1;
	pixel.getContext('2d')!.fillRect(0, 0, 1, 1);
	insertPageAfter(pageId, {
		...blankPage(width, height),
		image: {
			dataUrl: pixel.toDataURL('image/png'),
			naturalWidth: 1,
			naturalHeight: 1,
		},
	});
}

const TEXT_PAGE_SIZE = 48;

/** centred, selected text */
export function insertTextPageAfter(pageId: string, text: string): void {
	const { width, height } = sizeOf(pageId);
	const object = textObject(
		text,
		TEXT_PAGE_SIZE,
		'#000000',
		width / 2,
		height / 2,
	);
	insertPageAfter(pageId, {
		...blankPage(width, height),
		objects: [object],
	});
	setActiveTool('select');
	selectObject(object.id);
}

export function resizePage(pageId: string, resize: PageResize | null): void {
	updatePage(pageId, (page) => withResize(page, resize));
}

/** one undo step */
export function resizePages(
	ids: ReadonlySet<string>,
	resize: (page: ErrataPage) => PageResize | null,
): void {
	if (ids.size === 0) return;
	store.update((doc) => ({
		...doc,
		pages: doc.pages.map((p) =>
			ids.has(p.id) ? withResize(p, resize(p)) : p,
		),
	}));
}

export function cropPage(pageId: string, crop: PageCrop | null): void {
	updatePage(pageId, (page) => withCrop(page, crop));
}

export function movePage(fromId: string, toId: string): void {
	if (fromId === toId) return;
	store.update((doc) => {
		const from = doc.pages.findIndex((p) => p.id === fromId);
		const to = doc.pages.findIndex((p) => p.id === toId);
		if (from === -1 || to === -1) return doc;
		const pages = doc.pages.slice();
		const [moved] = pages.splice(from, 1);
		pages.splice(to, 0, moved!);
		return { ...doc, pages };
	});
	const doc = store.getSnapshot();
	if (doc) setPageIndex(doc.pages.findIndex((p) => p.id === fromId));
}

export function addContentEdits(pageId: string, edits: ContentEdit[]): void {
	if (edits.length === 0) return;
	store.update((doc) => {
		const source = doc.pages.find(
			(p) => p.id === pageId,
		)?.sourceIndex;
		// copies share source stream
		return {
			...doc,
			pages: doc.pages.map((p) =>
				p.id === pageId ||
				(source != null && p.sourceIndex === source)
					? {
							...p,
							edits: [
								...p.edits,
								...edits,
							],
						}
					: p,
			),
		};
	});
}

/** an image file becomes an object at the centre of the current page, at most half the page each way */
export async function placeImage(file: File): Promise<void> {
	const page = currentPage();
	if (!page) return;
	const { image } = await imagePage(file);
	if (!image) return;
	const size = pageSize(page);
	const scale = Math.min(
		1,
		size.width / 2 / image.naturalWidth,
		size.height / 2 / image.naturalHeight,
	);
	const id = newId();
	addObject(page.id, {
		id,
		kind: 'image',
		cx: size.width / 2,
		cy: size.height / 2,
		w: image.naturalWidth * scale,
		h: image.naturalHeight * scale,
		scaleX: 1,
		scaleY: 1,
		angle: 0,
		dataUrl: image.dataUrl,
	});
	setActiveTool('select');
	selectObject(id);
}
