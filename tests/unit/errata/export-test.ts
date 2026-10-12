import { module, test } from 'qunit';
import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFRawStream,
	decodePDFRawStream,
	type PDFNumber,
} from 'pdf-lib';
import {
	blankPage,
	flipPage,
	rotatePage,
	withCrop,
	withResize,
} from 'delphitools-v2/lib/errata/doc-model';
import { newComment } from 'delphitools-v2/lib/errata/comments';
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

	test('bold text is written in helvetica bold', async function (assert) {
		const text = (id: string, bold: boolean) => ({
			id,
			kind: 'text' as const,
			cx: 50,
			cy: 50,
			w: 40,
			h: 12,
			scaleX: 1,
			scaleY: 1,
			angle: 0,
			text: id,
			fontSize: 10,
			colour: '#000000',
			bold,
		});
		const fonts = async (bold: boolean) => {
			const out = await PDFDocument.load(
				await exportPdf(
					{
						name: 'x',
						pages: [
							{
								...blankPage(
									100,
									100,
								),
								objects: [
									text(
										'a',
										false,
									),
									text(
										'b',
										bold,
									),
								],
							},
						],
					},
					null,
				),
			);
			const dict = out
				.getPage(0)
				.node.Resources()!
				.lookup(PDFName.of('Font')) as PDFDict;
			const names = dict
				.values()
				.map((v) =>
					String(
						(
							out.context.lookup(
								v,
							) as PDFDict
						).get(PDFName.of('BaseFont')),
					),
				);
			// one resource per drawText
			return [...new Set(names)].sort();
		};
		assert.deepEqual(await fonts(true), [
			'/Helvetica',
			'/Helvetica-Bold',
		]);
		assert.deepEqual(await fonts(false), ['/Helvetica']);
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
	test('a flipped page mirrors its content and annotations', async function (assert) {
		const source = await PDFDocument.create();
		const sp = source.addPage([300, 400]);
		sp.drawText('a', { x: 10, y: 10 });
		const field = source.getForm().createTextField('name');
		field.setText('VAL');
		field.addToPage(sp, { x: 10, y: 20, width: 100, height: 30 });
		const r = field.acroField.getWidgets()[0]!.getRectangle();
		sp.node.addAnnot(
			source.context.register(
				source.context.obj({
					Type: 'Annot',
					Subtype: 'Highlight',
					Rect: [10, 300, 60, 320],
					QuadPoints: [
						10, 320, 60, 320, 10, 300, 60,
						300,
					],
				}),
			),
		);
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
		assert.strictEqual(
			result.getForm().getTextField('name').getText(),
			'VAL',
		);
		const [widget, highlight] = p0.node
			.Annots()!
			.asArray()
			.map((r) => result.context.lookup(r, PDFDict));
		const nums = (d: PDFDict | undefined, key: string) =>
			d!
				.lookup(PDFName.of(key), PDFArray)
				.asArray()
				.map((n) => (n as PDFNumber).asNumber());
		assert.deepEqual(nums(widget, 'Rect'), [
			300 - r.x - r.width,
			r.y,
			300 - r.x,
			r.y + r.height,
		]);
		assert.deepEqual(nums(highlight, 'Rect'), [240, 300, 290, 320]);
		assert.deepEqual(
			nums(highlight, 'QuadPoints'),
			[290, 320, 240, 320, 290, 300, 240, 300],
		);
	});

	test('a duplicated page gets its own annotations', async function (assert) {
		const source = await PDFDocument.create();
		const sp = source.addPage([300, 400]);
		sp.node.addAnnot(
			source.context.register(
				source.context.obj({
					Type: 'Annot',
					Subtype: 'Square',
					Rect: [10, 10, 50, 50],
					P: sp.ref,
				}),
			),
		);
		const bytes = await source.save();
		const copy = (text: string) => ({
			...blankPage(300, 400),
			sourceIndex: 0,
			objects: [{ ...newComment(100, 100, 'Ruby'), text }],
		});
		const result = await PDFDocument.load(
			await exportPdf(
				{
					name: 'x',
					pages: [copy('one'), copy('two')],
				},
				bytes,
			),
		);
		const annots = result.getPages().map((p) =>
			p.node
				.Annots()!
				.asArray()
				.map((r) => ({
					ref: r,
					dict: result.context.lookup(r, PDFDict),
				})),
		);
		const notes = annots.map((list) =>
			list
				.filter(
					(a) =>
						a.dict.get(
							PDFName.of('Subtype'),
						) === PDFName.of('Text'),
				)
				.map((a) =>
					a.dict
						.lookup(
							PDFName.of('Contents'),
							PDFHexString,
						)
						.decodeText(),
				),
		);
		assert.deepEqual(notes, [['one'], ['two']]);
		const squares = annots.map((list) =>
			list.find(
				(a) =>
					a.dict.get(PDFName.of('Subtype')) ===
					PDFName.of('Square'),
			)!,
		);
		assert.notStrictEqual(squares[0]!.ref, squares[1]!.ref);
		assert.deepEqual(
			squares.map((s) => s.dict.get(PDFName.of('P'))),
			result.getPages().map((p) => p.ref),
		);
	});

	test('pages a kept page links to are not exported', async function (assert) {
		const source = await PDFDocument.create();
		const first = source.addPage([300, 400]);
		const second = source.addPage([300, 400]);
		first.drawText('KEEP', { x: 10, y: 10 });
		second.drawText('GONE', { x: 10, y: 10 });
		first.node.addAnnot(
			source.context.register(
				source.context.obj({
					Type: 'Annot',
					Subtype: 'Link',
					Rect: [10, 10, 50, 50],
					Dest: [second.ref, 'Fit'],
				}),
			),
		);
		const bytes = await source.save();
		const result = await PDFDocument.load(
			await exportPdf(
				{
					name: 'x',
					pages: [
						{
							...blankPage(300, 400),
							sourceIndex: 0,
						},
					],
				},
				bytes,
			),
		);
		const objects = result.context.enumerateIndirectObjects();
		const pages = objects.filter(
			([, o]) =>
				o instanceof PDFDict &&
				o.get(PDFName.of('Type')) ===
					PDFName.of('Page'),
		);
		assert.strictEqual(
			pages.filter(([, o]) =>
				(o as PDFDict).has(PDFName.of('Contents')),
			).length,
			1,
		);
		const streams = objects
			.map(([, o]) => o)
			.filter(
				(o): o is PDFRawStream =>
					o instanceof PDFRawStream,
			)
			.map((s) =>
				new TextDecoder('latin1').decode(
					decodePDFRawStream(s).decode(),
				),
			);
		assert.false(
			streams.some((s) => s.includes('474F4E45')),
			'deleted page content dropped',
		);
	});
});
