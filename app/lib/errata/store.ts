import { createHistoryStore } from 'delphitools-v2/lib/history-store';
import type { ErrataDoc, ErrataPage, PageObject } from './doc-model';

export const store = createHistoryStore<ErrataDoc>();

let pageIndex = 0;
const pageListeners = new Set<() => void>();

export function getPageIndex(): number {
	const doc = store.getSnapshot();
	if (!doc) return 0;
	return Math.min(pageIndex, Math.max(0, doc.pages.length - 1));
}

export function setPageIndex(index: number): void {
	const doc = store.getSnapshot();
	const next = Math.max(0, Math.min(index, (doc?.pages.length ?? 1) - 1));
	if (next === pageIndex) return;
	pageIndex = next;
	for (const l of pageListeners) l();
}

export function subscribePage(listener: () => void): () => void {
	pageListeners.add(listener);
	return () => {
		pageListeners.delete(listener);
	};
}

export function currentPage(): ErrataPage | null {
	return store.getSnapshot()?.pages[getPageIndex()] ?? null;
}

export function updatePage(
	pageId: string,
	mutator: (page: ErrataPage) => ErrataPage,
): void {
	store.update((doc) => {
		const index = doc.pages.findIndex((p) => p.id === pageId);
		if (index === -1) return doc;
		const next = mutator(doc.pages[index]!);
		if (next === doc.pages[index]) return doc;
		const pages = doc.pages.slice();
		pages[index] = next;
		return { ...doc, pages };
	});
}

export function addObject(pageId: string, object: PageObject): void {
	updatePage(pageId, (page) => ({
		...page,
		objects: [...page.objects, object],
	}));
}

export function patchObjects(
	pageId: string,
	patches: ReadonlyMap<string, Partial<PageObject>>,
): void {
	if (patches.size === 0) return;
	updatePage(pageId, (page) => ({
		...page,
		objects: page.objects.map((o) => {
			const patch = patches.get(o.id);
			return patch ? ({ ...o, ...patch } as PageObject) : o;
		}),
	}));
}

export function removeObjects(pageId: string, ids: readonly string[]): void {
	if (ids.length === 0) return;
	const gone = new Set(ids);
	updatePage(pageId, (page) => ({
		...page,
		objects: page.objects.filter((o) => !gone.has(o.id)),
	}));
}
