import {
	A4_POINTS,
	blankPage,
	newId,
	pageSize,
	rotatePage,
	type ErrataPage,
} from './doc-model';
import { store } from './store';

type Ids = ReadonlySet<string>;

/** the pages in `ids`, in document order, moved to insertion index `to` of the unmoved list */
export function movePages(
	pages: readonly ErrataPage[],
	ids: Ids,
	to: number,
): ErrataPage[] {
	const at = pages.slice(0, to).filter((p) => !ids.has(p.id)).length;
	const rest = pages.filter((p) => !ids.has(p.id));
	rest.splice(at, 0, ...pages.filter((p) => ids.has(p.id)));
	return rest;
}

export function rotatePages(
	pages: readonly ErrataPage[],
	ids: Ids,
	turns: 1 | -1,
): ErrataPage[] {
	return pages.map((p) => (ids.has(p.id) ? rotatePage(p, turns) : p));
}

/** never removes the last page */
export function deletePages(
	pages: readonly ErrataPage[],
	ids: Ids,
): ErrataPage[] {
	const rest = pages.filter((p) => !ids.has(p.id));
	return rest.length > 0 ? rest : pages.slice();
}

/** each page followed by its copy; content edits are shared, objects get new ids */
export function duplicatePages(
	pages: readonly ErrataPage[],
	ids: Ids,
): ErrataPage[] {
	return pages.flatMap((p) =>
		ids.has(p.id)
			? [
					p,
					{
						...p,
						id: newId(),
						objects: p.objects.map((o) => ({
							...o,
							id: newId(),
						})),
					},
				]
			: [p],
	);
}

/** a blank page the size of the last selected page, after it; at the end without a selection */
export function insertBlank(
	pages: readonly ErrataPage[],
	ids: Ids,
): ErrataPage[] {
	let at = pages.length;
	for (let i = pages.length - 1; i >= 0; i--)
		if (ids.has(pages[i]!.id)) {
			at = i + 1;
			break;
		}
	const ref = pages[at - 1];
	const size = ref ? pageSize(ref) : A4_POINTS;
	const next = pages.slice();
	next.splice(at, 0, blankPage(size.width, size.height));
	return next;
}

/** one undo step; an unchanged order is no step */
export function updatePages(
	op: (pages: readonly ErrataPage[]) => ErrataPage[],
): void {
	store.update((doc) => {
		const pages = op(doc.pages);
		const same =
			pages.length === doc.pages.length &&
			pages.every((p, i) => p === doc.pages[i]);
		return same ? doc : { ...doc, pages };
	});
}
