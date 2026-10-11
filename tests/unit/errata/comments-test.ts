import { module, test } from 'qunit';
import { PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib';
import {
	blankPage,
	type CommentObject,
	type ErrataPage,
	type Rotation,
} from 'delphitools-v2/lib/errata/doc-model';
import {
	newComment,
	readComments,
	writeComments,
} from 'delphitools-v2/lib/errata/comments';

function note(cx: number, cy: number, text: string): CommentObject {
	return {
		...newComment(cx, cy, 'Ruby'),
		text,
		date: '2026-10-12T09:30:00.000Z',
	};
}

function annotDicts(doc: PDFDocument, pageIndex: number): PDFDict[] {
	const annots = doc.getPage(pageIndex).node.Annots();
	if (!annots) return [];
	return annots.asArray().map((r) => doc.context.lookup(r) as PDFDict);
}

function subtype(d: PDFDict): string | undefined {
	return d.get(PDFName.of('Subtype'))?.toString();
}

async function roundTrip(rotation: Rotation) {
	const doc = await PDFDocument.create();
	const pdfPage = doc.addPage([400, 500]);
	const page: ErrataPage = {
		...blankPage(400, 500),
		sourceIndex: 0,
		baseRotation: rotation,
		objects: [note(60, 90, 'Café — ünïcode'), note(300, 200, '')],
	};
	writeComments(pdfPage, page);
	const reloaded = await PDFDocument.load(await doc.save());
	return { page, read: readComments(reloaded.getPage(0), page) };
}

module('Unit | errata | comments', function () {
	test('round trips text, author, date and position', async function (assert) {
		const { page, read } = await roundTrip(0);
		assert.strictEqual(read.length, 2);
		const [a] = read;
		const [src] = page.objects as CommentObject[];
		assert.strictEqual(a!.text, src!.text);
		assert.strictEqual(a!.author, 'Ruby');
		assert.strictEqual(a!.date, src!.date);
		assert.ok(Math.abs(a!.cx - 60) < 0.01, `cx ${a!.cx}`);
		assert.ok(Math.abs(a!.cy - 90) < 0.01, `cy ${a!.cy}`);
		assert.notStrictEqual(a!.id, src!.id);
	});

	test('round trips position on a rotated page', async function (assert) {
		const { read } = await roundTrip(90);
		assert.ok(
			Math.abs(read[0]!.cx - 60) < 0.01,
			`cx ${read[0]!.cx}`,
		);
		assert.ok(
			Math.abs(read[0]!.cy - 90) < 0.01,
			`cy ${read[0]!.cy}`,
		);
	});

	test('writes a Text annotation dict', async function (assert) {
		const doc = await PDFDocument.create();
		const pdfPage = doc.addPage([400, 500]);
		writeComments(pdfPage, {
			...blankPage(400, 500),
			objects: [note(60, 90, 'hello')],
		});
		const [d] = annotDicts(doc, 0);
		assert.strictEqual(subtype(d!), '/Text');
		assert.strictEqual(
			d!
				.lookup(PDFName.of('Contents'), PDFHexString)
				.decodeText(),
			'hello',
		);
		assert.strictEqual(d!.get(PDFName.of('P')), pdfPage.ref);
		assert.deepEqual(
			d!
				.get(PDFName.of('Rect'))
				?.toString()
				.replace(/\s+/g, ' '),
			'[ 50 400 70 420 ]',
		);
	});

	test('replaces existing notes and their popups, keeps other annotations', async function (assert) {
		const doc = await PDFDocument.create();
		const pdfPage = doc.addPage([400, 500]);
		const ctx = doc.context;
		const old = ctx.register(
			ctx.obj({
				Type: 'Annot',
				Subtype: 'Text',
				Rect: [10, 10, 30, 30],
			}),
		);
		const popup = ctx.register(
			ctx.obj({
				Type: 'Annot',
				Subtype: 'Popup',
				Parent: old,
				Rect: [30, 10, 200, 100],
			}),
		);
		(ctx.lookup(old) as PDFDict).set(PDFName.of('Popup'), popup);
		const square = ctx.register(
			ctx.obj({
				Type: 'Annot',
				Subtype: 'Square',
				Rect: [100, 100, 150, 150],
			}),
		);
		for (const ref of [old, popup, square])
			pdfPage.node.addAnnot(ref);

		writeComments(pdfPage, {
			...blankPage(400, 500),
			objects: [note(60, 90, 'new')],
		});
		assert.deepEqual(annotDicts(doc, 0).map(subtype), [
			'/Square',
			'/Text',
		]);
	});

	test('a page without comments loses its notes', async function (assert) {
		const doc = await PDFDocument.create();
		const pdfPage = doc.addPage([400, 500]);
		writeComments(pdfPage, {
			...blankPage(400, 500),
			objects: [note(60, 90, 'gone')],
		});
		writeComments(pdfPage, blankPage(400, 500));
		assert.strictEqual(annotDicts(doc, 0).length, 0);
	});
});
