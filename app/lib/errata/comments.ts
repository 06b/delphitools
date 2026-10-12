import {
	PDFArray,
	PDFDict,
	PDFHexString,
	PDFName,
	PDFNumber,
	PDFString,
	type PDFObject,
	type PDFPage,
} from 'pdf-lib';
import {
	boxAt,
	displayedToUser,
	totalRotation,
	unrotatedSize,
	unrotatedToDisplayed,
	type CommentObject,
	type ErrataPage,
} from './doc-model';

/** note icon edge, points */
const NOTE_SIZE = 20;

const TEXT = PDFName.of('Text');
const SUBTYPE = PDFName.of('Subtype');
const POPUP = PDFName.of('Popup');

function isNote(annot: PDFDict | undefined): annot is PDFDict {
	return annot?.get(SUBTYPE) === TEXT;
}

function readString(
	dict: PDFDict,
	key: string,
): PDFString | PDFHexString | null {
	const v = dict.lookup(PDFName.of(key));
	return v instanceof PDFString || v instanceof PDFHexString ? v : null;
}

function readDate(dict: PDFDict): string {
	const s = readString(dict, 'M') ?? readString(dict, 'CreationDate');
	try {
		return s ? s.decodeDate().toISOString() : '';
	} catch {
		return '';
	}
}

const AUTHOR_KEY = 'errata:comment-author';

export function commentAuthor(): string {
	try {
		return localStorage.getItem(AUTHOR_KEY) ?? '';
	} catch {
		return '';
	}
}

export function setCommentAuthor(name: string): void {
	try {
		localStorage.setItem(AUTHOR_KEY, name);
	} catch {
		// private mode
	}
}

export function newComment(
	cx: number,
	cy: number,
	author: string,
): CommentObject {
	const half = NOTE_SIZE / 2;
	return {
		...boxAt({
			x: cx - half,
			y: cy - half,
			width: NOTE_SIZE,
			height: NOTE_SIZE,
		}),
		kind: 'comment',
		text: '',
		author,
		date: new Date().toISOString(),
	};
}

/** the page's /Text annotations as comment objects; `page` is the freshly loaded page */
export function readComments(src: PDFPage, page: ErrataPage): CommentObject[] {
	const annots = src.node.Annots();
	if (!annots) return [];
	const box = src.getCropBox();
	const r = totalRotation(page);
	const u = unrotatedSize(page);
	const half = NOTE_SIZE / 2;
	const out: CommentObject[] = [];
	for (let i = 0; i < annots.size(); i++) {
		const annot = annots.lookupMaybe(i, PDFDict);
		if (!isNote(annot)) continue;
		const rect = annot.lookupMaybe(PDFName.of('Rect'), PDFArray);
		const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = (
			rect?.asArray() ?? []
		).map((n) => (n instanceof PDFNumber ? n.asNumber() : 0));
		// icon at top-left
		const ux = Math.min(x1, x2) + half - box.x;
		const uy = box.y + box.height - Math.max(y1, y2) + half;
		const d = unrotatedToDisplayed(ux, uy, r, u.width, u.height);
		out.push({
			...newComment(d.x, d.y, ''),
			text: readString(annot, 'Contents')?.decodeText() ?? '',
			author: readString(annot, 'T')?.decodeText() ?? '',
			date: readDate(annot),
		});
	}
	return out;
}

/** replaces the page's /Text annotations (and their popups) with the page's comment objects */
export function writeComments(pdfPage: PDFPage, page: ErrataPage): void {
	const annots = pdfPage.node.Annots();
	if (annots) {
		const gone = new Set<PDFObject>();
		for (let i = 0; i < annots.size(); i++) {
			const annot = annots.lookupMaybe(i, PDFDict);
			if (!isNote(annot)) continue;
			gone.add(annots.get(i));
			const popup = annot.get(POPUP);
			if (popup) gone.add(popup);
		}
		for (let i = annots.size() - 1; i >= 0; i--)
			if (gone.has(annots.get(i))) annots.remove(i);
	}
	const ctx = pdfPage.doc.context;
	const box = pdfPage.getCropBox();
	const r = totalRotation(page);
	const u = unrotatedSize(page);
	const half = NOTE_SIZE / 2;
	for (const o of page.objects) {
		if (o.kind !== 'comment') continue;
		const c = displayedToUser(o.cx, o.cy, r, u.width, u.height);
		const x = box.x + c.x;
		const y = box.y + c.y;
		const dict = ctx.obj({
			Type: 'Annot',
			Subtype: 'Text',
			Rect: [x - half, y - half, x + half, y + half],
			Contents: PDFHexString.fromText(o.text),
			T: PDFHexString.fromText(o.author),
			Name: 'Comment',
			C: [1, 0.82, 0],
			// print, nozoom, norotate
			F: 28,
			P: pdfPage.ref,
			...(o.date
				? { M: PDFString.fromDate(new Date(o.date)) }
				: {}),
		});
		pdfPage.node.addAnnot(ctx.register(dict));
	}
}
