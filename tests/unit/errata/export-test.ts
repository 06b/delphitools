import { module, test } from 'qunit';
import {
	PDFArray,
	PDFDocument,
	PDFName,
	decodePDFRawStream,
	type PDFRawStream,
} from 'pdf-lib';
import {
	blankPage,
	flipPage,
	rotatePage,
	withCrop,
	withResize,
} from 'delphitools-v2/lib/errata/doc-model';
import { exportPdf } from 'delphitools-v2/lib/errata/export';

module('Unit | errata | export', function () {
	test('writes pages in order with rotation and objects', async function (assert) {
		const source = await PDFDocument.create();
		source.addPage([300, 400]);
		source.addPage([500, 200]);
		const bytes = await source.save();

		const first = {
			...blankPage(300, 400),
			sourceIndex: 0,
			objects: [
				{
					id: 't',
					kind: 'text' as const,
					cx: 150,
					cy: 40,
					w: 100,
					h: 20,
					scaleX: 1,
					scaleY: 1,
					angle: 0,
					text: 'hello',
					fontSize: 14,
					colour: '#ff0000',
				},
				{
					id: 'i',
					kind: 'ink' as const,
					cx: 50,
					cy: 50,
					w: 40,
					h: 40,
					scaleX: 1,
					scaleY: 1,
					angle: 15,
					d: 'M 0 0 L 40 40',
					colour: '#0000ff',
					strokeWidth: 2,
				},
				{
					id: 's',
					kind: 'shape' as const,
					shape: 'highlight' as const,
					cx: 150,
					cy: 200,
					w: 200,
					h: 30,
					scaleX: 1,
					scaleY: 1,
					angle: 0,
					colour: '#ffff00',
					strokeWidth: 0,
				},
			],
		};
		const second = rotatePage(
			{ ...blankPage(500, 200), sourceIndex: 1 },
			1,
		);
		const blank = blankPage(100, 100);

		const out = await exportPdf(
			{ name: 'x', pages: [blank, second, first] },
			bytes,
		);
		const result = await PDFDocument.load(out);
		assert.strictEqual(result.getPageCount(), 3);
		const [p0, p1, p2] = result.getPages();
		assert.deepEqual([p0!.getWidth(), p0!.getHeight()], [100, 100]);
		assert.strictEqual(p1!.getRotation().angle, 90);
		assert.deepEqual([p1!.getWidth(), p1!.getHeight()], [500, 200]);
		assert.strictEqual(p2!.getRotation().angle, 0);
		const content = p2!.node.Contents();
		assert.ok(content, 'annotated page has a content stream');
	});

	test('resize embeds the source page, crop sets the crop box', async function (assert) {
		const source = await PDFDocument.create();
		source.addPage([300, 400]).drawText('a', { x: 10, y: 10 });
		source.addPage([300, 400]);
		const bytes = await source.save();

		const resized = withResize(
			{ ...blankPage(300, 400), sourceIndex: 0 },
			{
				width: 500,
				height: 500,
				mode: 'fit',
				anchor: 'top-left',
			},
		);
		const cropped = withCrop(
			{ ...blankPage(300, 400), sourceIndex: 1 },
			{ x: 50, y: 100, width: 100, height: 200 },
		);
		const image = withResize(
			{
				...blankPage(20, 10),
				image: {
					dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
					naturalWidth: 1,
					naturalHeight: 1,
				},
			},
			{
				width: 100,
				height: 100,
				mode: 'anchor',
				anchor: 'middle-center',
			},
		);
		const out = await exportPdf(
			{ name: 'x', pages: [resized, cropped, image] },
			bytes,
		);
		const result = await PDFDocument.load(out);
		const [p0, p1, p2] = result.getPages();
		assert.deepEqual([p0!.getWidth(), p0!.getHeight()], [500, 500]);
		assert.ok(
			p0!.node.Resources()?.lookup(PDFName.of('XObject')),
			'embedded page xobject',
		);
		const box = p1!.getCropBox();
		assert.deepEqual(
			[box.x, box.y, box.width, box.height],
			[50, 100, 100, 200],
		);
		assert.deepEqual([p2!.getWidth(), p2!.getHeight()], [100, 100]);
	});

	test('a flipped page draws its source through a mirror matrix', async function (assert) {
		const source = await PDFDocument.create();
		source.addPage([300, 400]).drawText('a', { x: 10, y: 10 });
		const bytes = await source.save();
		const page = flipPage(
			{ ...blankPage(300, 400), sourceIndex: 0 },
			'horizontal',
		);
		const result = await PDFDocument.load(
			await exportPdf({ name: 'x', pages: [page] }, bytes),
		);
		const p0 = result.getPage(0);
		assert.deepEqual([p0.getWidth(), p0.getHeight()], [300, 400]);
		const contents = p0.node.Contents();
		const streams =
			contents instanceof PDFArray
				? contents
						.asArray()
						.map((r) =>
							result.context.lookup(
								r,
							),
						)
				: [contents];
		const text = streams
			.map((s) =>
				new TextDecoder('latin1').decode(
					decodePDFRawStream(
						s as PDFRawStream,
					).decode(),
				),
			)
			.join('\n');
		assert.ok(/-1 0 0 1 300 0 cm/.test(text), text);
		assert.ok(
			p0.node.Resources()?.lookup(PDFName.of('XObject')),
			'embedded page xobject',
		);
	});
});
