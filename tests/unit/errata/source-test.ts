import { module, test } from 'qunit';
import { PDFDocument } from 'pdf-lib';
import { createHistoryStore } from 'delphitools-v2/lib/history-store';
import { redactObject } from 'delphitools-v2/lib/errata/redact';
import {
	closeDoc,
	getSourceBytes,
	openPdf,
	replaceDocument,
} from 'delphitools-v2/lib/errata/source';
import { addObject, store } from 'delphitools-v2/lib/errata/store';
import type { PageObject } from 'delphitools-v2/lib/errata/doc-model';

// redact export loads mupdf
const rect = (): PageObject => ({
	...redactObject(10, 10, 50, 20),
	kind: 'shape',
	shape: 'rect',
	colour: '#000',
	strokeWidth: 1,
});

async function fixture(): Promise<File> {
	const doc = await PDFDocument.create();
	doc.addPage([400, 500]);
	doc.addPage([300, 300]);
	return new File([new Uint8Array(await doc.save())], 'fixture.pdf', {
		type: 'application/pdf',
	});
}

module('Unit | errata | source versions', function (hooks) {
	hooks.afterEach(function () {
		closeDoc();
	});

	test('history states cover current, undo, redo', function (assert) {
		const h = createHistoryStore<{ n: number }>();
		assert.deepEqual(h.states(), []);
		h.setDoc({ n: 1 });
		h.update(() => ({ n: 2 }));
		h.update(() => ({ n: 3 }));
		h.undo();
		assert.deepEqual(
			h.states().map((s) => s.n),
			[2, 1, 3],
		);
		h.update(() => ({ n: 4 }));
		assert.deepEqual(
			h.states().map((s) => s.n),
			[4, 1, 2],
			'a new step drops redo',
		);
	});

	test('replace is one undo step and swaps the source', async function (assert) {
		await openPdf(await fixture());
		const original = getSourceBytes();
		const opened = store.getSnapshot()!;
		assert.ok(opened.source, 'opened pdf has a source id');
		addObject(opened.pages[0]!.id, rect());
		const edited = store.getSnapshot()!;

		let seen = 0;
		const ok = await replaceDocument(async (bytes) => {
			seen = bytes.length;
			const doc = await PDFDocument.load(bytes);
			doc.addPage([200, 200]);
			return doc.save();
		});
		assert.true(ok);
		assert.true(seen > 0, 'transform got the export bytes');
		const replaced = store.getSnapshot()!;
		assert.notStrictEqual(replaced.source, edited.source);
		assert.strictEqual(replaced.pages.length, 3);
		assert.deepEqual(
			replaced.pages.map((p) => p.sourceIndex),
			[0, 1, 2],
		);
		assert.true(
			replaced.pages.every((p) => p.objects.length === 0),
			'objects baked into the bytes',
		);
		const swapped = getSourceBytes();
		assert.notStrictEqual(swapped, original);
		assert.strictEqual(
			(await PDFDocument.load(swapped!)).getPageCount(),
			3,
		);

		store.undo();
		assert.strictEqual(store.getSnapshot(), edited);
		assert.strictEqual(getSourceBytes(), original, 'undo restores');
		store.redo();
		assert.strictEqual(store.getSnapshot(), replaced);
		assert.strictEqual(getSourceBytes(), swapped, 'redo restores');
	});

	test('replace gives up when the doc changes meanwhile', async function (assert) {
		await openPdf(await fixture());
		const page = store.getSnapshot()!.pages[0]!;
		const ok = await replaceDocument((bytes) => {
			addObject(page.id, rect());
			return bytes;
		});
		assert.false(ok);
		assert.strictEqual(store.getSnapshot()!.pages.length, 2);
		assert.strictEqual(
			store.getSnapshot()!.pages[0]!.objects.length,
			1,
		);
	});
});
