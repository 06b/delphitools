import type * as Mupdf from 'mupdf';
import { getMupdf } from 'delphitools-v2/lib/mupdf';
import {
	boxAt,
	type ErrataDoc,
	type ErrataPage,
	type PageCrop,
	type RedactObject,
} from './doc-model';
import { store } from './store';

// displayed space, y down
export type Box = [number, number, number, number];

export function redactObject(rect: PageCrop): RedactObject {
	return { ...boxAt(rect), kind: 'redact' };
}

// mupdf rects are axis-aligned
export function redactBoxes(page: ErrataPage): Box[] {
	return page.objects.flatMap((o) => {
		if (o.kind !== 'redact') return [];
		const t = (o.angle * Math.PI) / 180;
		const w = Math.abs(o.w * o.scaleX);
		const h = Math.abs(o.h * o.scaleY);
		const c = Math.abs(Math.cos(t));
		const s = Math.abs(Math.sin(t));
		const hw = (w * c + h * s) / 2;
		const hh = (w * s + h * c) / 2;
		return [[o.cx - hw, o.cy - hh, o.cx + hw, o.cy + hh] as Box];
	});
}

export function intersects(a: Box, b: Box): boolean {
	return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

export function redactIds(doc: ErrataDoc | null): Set<string> {
	return new Set(
		doc?.pages.flatMap((p) =>
			p.objects
				.filter((o) => o.kind === 'redact')
				.map((o) => o.id),
		) ?? [],
	);
}

// one undo step
export function dropRedactions(keep: Set<string>): void {
	const doc = store.getSnapshot();
	if (!doc || [...redactIds(doc)].every((id) => keep.has(id))) return;
	store.update((d) => ({
		...d,
		pages: d.pages.map((p) => ({
			...p,
			objects: p.objects.filter(
				(o) => o.kind !== 'redact' || keep.has(o.id),
			),
		})),
	}));
}

// mupdf keeps field values
function dropField(widget: Mupdf.PDFObject): void {
	for (let o = widget; ;) {
		o.delete('V');
		o.delete('DV');
		o.delete('AP');
		const parent = o.get('Parent');
		if (!parent.isDictionary()) return;
		const kids = parent.get('Kids');
		for (let i = kids.length - 1; i >= 0; i--)
			if (kids.get(i).asIndirect() === o.asIndirect())
				kids.delete(i);
		if (kids.length > 0) return;
		o = parent;
	}
}

// page i is pages[i]
export async function redactPdf(
	bytes: Uint8Array,
	pages: ErrataPage[],
): Promise<Uint8Array> {
	const boxes = pages.map(redactBoxes);
	if (boxes.every((b) => b.length === 0)) return bytes;
	const mupdf = await getMupdf();
	const { PDFPage } = mupdf;
	const doc = new mupdf.PDFDocument(bytes);
	try {
		boxes.forEach((rects, i) => {
			if (rects.length === 0) return;
			const page = doc.loadPage(i);
			const hit = (b: Box) =>
				rects.some((r) => intersects(r, b));
			// mupdf keeps overlapping annotations
			for (const a of [...page.getAnnotations()])
				if (hit(a.getBounds()))
					page.deleteAnnotation(a);
			for (const w of [...page.getWidgets()])
				if (hit(w.getBounds())) {
					const obj = w.getObject();
					page.deleteAnnotation(w);
					dropField(obj);
				}
			for (const l of page.getLinks())
				if (hit(l.getBounds())) page.deleteLink(l);
			page.getObject().delete('Thumb');
			for (const r of rects)
				page.createAnnotation('Redact').setRect(r);
			page.applyRedactions(
				true,
				PDFPage.REDACT_IMAGE_PIXELS,
				PDFPage.REDACT_LINE_ART_REMOVE_IF_TOUCHED,
				PDFPage.REDACT_TEXT_REMOVE,
			);
		});
		// drops orphaned originals
		const buf = doc.saveToBuffer('garbage=compact,compress');
		const out = buf.asUint8Array().slice();
		buf.destroy();
		return out;
	} finally {
		doc.destroy();
	}
}
