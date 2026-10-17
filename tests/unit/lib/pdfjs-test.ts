import { module, test } from 'qunit';
import { PDFDocument, degrees } from 'pdf-lib';
import {
	open,
	pageUrl,
	renderPage,
	sizes,
	thumbEdge,
	thumbnails,
} from 'delphitools-v2/lib/pdfjs';

async function sample() {
	const doc = await PDFDocument.create();
	doc.addPage([200, 400]);
	doc.addPage([300, 100]).setRotation(degrees(90));
	return open(await doc.save());
}

module('Unit | lib | pdfjs', function () {
	test('sizes apply the page rotation', async function (assert) {
		const pdf = await sample();
		assert.deepEqual(await sizes(pdf), [
			{ width: 200, height: 400 },
			{ width: 100, height: 300 },
		]);
		await pdf.destroy();
	});

	test('renderPage fits the long edge', async function (assert) {
		const pdf = await sample();
		const canvas = await renderPage(pdf, 0, 100);
		assert.deepEqual([canvas.width, canvas.height], [50, 100]);
		await pdf.destroy();
	});

	test('renderPage takes a total rotation', async function (assert) {
		const pdf = await sample();
		const own = await renderPage(pdf, 1, 60);
		assert.deepEqual([own.width, own.height], [20, 60]);
		const flat = await renderPage(pdf, 1, 60, { rotation: 0 });
		assert.deepEqual([flat.width, flat.height], [60, 20]);
		await pdf.destroy();
	});

	test('renderPage caps the scale', async function (assert) {
		const pdf = await sample();
		const canvas = await renderPage(pdf, 0, 4000, { maxScale: 2 });
		assert.deepEqual([canvas.width, canvas.height], [400, 800]);
		await pdf.destroy();
	});

	test('pageUrl is empty for a page that does not exist', async function (assert) {
		const pdf = await sample();
		assert.strictEqual(await pageUrl(pdf, 5, 100), '');
		const url = await pageUrl(pdf, 0, 100);
		assert.true(url.startsWith('blob:'));
		URL.revokeObjectURL(url);
		await pdf.destroy();
	});

	test('thumbnails stop once live turns false', async function (assert) {
		const pdf = await sample();
		const seen: number[] = [];
		await thumbnails(
			pdf,
			() => seen.length < 1,
			(index, url) => {
				seen.push(index);
				URL.revokeObjectURL(url);
			},
		);
		assert.deepEqual(seen, [0]);
		assert.strictEqual(thumbEdge, 160);
		await pdf.destroy();
	});
});
