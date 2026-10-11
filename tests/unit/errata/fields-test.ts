import { module, test } from 'qunit';
import {
	PDFDocument,
	PDFRadioGroup,
	PDFSignature,
	PDFTextField,
} from 'pdf-lib';
import {
	blankPage,
	type ErrataPage,
	type FieldObject,
} from 'delphitools-v2/lib/errata/doc-model';
import {
	addFormFields,
	carryAcroForm,
	fieldRectToUser,
	fieldRotation,
	newField,
	parseOptions,
	radioLayout,
	sourceRectToDisplayed,
	uniqueName,
	widgetBox,
} from 'delphitools-v2/lib/errata/fields';

const field = (patch: Partial<FieldObject> = {}): FieldObject => ({
	...newField(
		{
			field: 'text',
			name: 'a',
			options: [],
			required: false,
			value: '',
		},
		{ x: 40, y: 50, width: 100, height: 20 },
		new Set(),
	)!,
	...patch,
});

const rotated = (rotation: 0 | 90): ErrataPage => ({
	...blankPage(400, 500),
	rotation,
});

module('Unit | errata | fields', function () {
	test('parseOptions trims, drops blanks and repeats', function (assert) {
		assert.deepEqual(parseOptions(' Red, ,Green,Red '), [
			'Red',
			'Green',
		]);
	});

	test('uniqueName suffixes and drops dots', function (assert) {
		assert.strictEqual(uniqueName('a.b', new Set()), 'a-b');
		assert.strictEqual(uniqueName('', new Set()), 'field');
		assert.strictEqual(
			uniqueName('text', new Set(['text', 'text-2'])),
			'text-3',
		);
	});

	test('newField centres on the rect and names itself', function (assert) {
		const f = newField(
			{
				field: 'checkbox',
				name: '',
				options: [],
				required: true,
				value: '',
			},
			{ x: 10, y: 20, width: 30, height: 40 },
			new Set(['checkbox']),
		)!;
		assert.deepEqual(
			[f.cx, f.cy, f.w, f.h, f.name, f.required],
			[25, 40, 30, 40, 'checkbox-2', true],
		);
		assert.strictEqual(
			newField(
				f,
				{ x: 0, y: 0, width: 3, height: 40 },
				new Set(),
			),
			null,
		);
	});

	test('fieldRectToUser flips y on an upright page', function (assert) {
		assert.deepEqual(fieldRectToUser(rotated(0), field()), {
			x: 40,
			y: 430,
			width: 100,
			height: 20,
		});
	});

	test('fieldRectToUser and rotation on a turned page', function (assert) {
		// displayed 500 x 400; the field sits near the displayed top-left
		const page = rotated(90);
		const r = fieldRectToUser(page, field());
		assert.deepEqual(
			[r.x, r.y, r.width, r.height].map((n) => Math.round(n)),
			[50, 40, 20, 100],
		);
		assert.strictEqual(fieldRotation(page, field()), 90);
		// carried by rotatePage: angle follows the page
		assert.strictEqual(
			fieldRotation(page, field({ angle: 90 })),
			0,
		);
	});

	test('widgetBox undoes pdf-lib border growth and pivot', function (assert) {
		const rect = { x: 10, y: 20, width: 100, height: 30 };
		assert.deepEqual(widgetBox(rect, 0, 1), {
			x: 10.5,
			y: 20.5,
			width: 99,
			height: 29,
		});
		assert.deepEqual(widgetBox(rect, 90, 1), {
			x: 109.5,
			y: 20.5,
			width: 29,
			height: 99,
		});
	});

	test('radioLayout stacks rows inside the box', function (assert) {
		const lay = radioLayout(100, 60, 3);
		assert.strictEqual(lay.size, 16);
		assert.deepEqual(lay.rows, [2, 22, 42]);
	});

	test('sourceRectToDisplayed follows user rotation and crop', function (assert) {
		const page = rotated(0);
		assert.deepEqual(
			sourceRectToDisplayed(page, [40, 50, 140, 70]),
			{
				x: 40,
				y: 50,
				width: 100,
				height: 20,
			},
		);
		const cropped = {
			...page,
			crop: { x: 20, y: 30, width: 200, height: 200 },
		};
		assert.deepEqual(
			sourceRectToDisplayed(cropped, [40, 50, 140, 70]),
			{
				x: 20,
				y: 20,
				width: 100,
				height: 20,
			},
		);
		assert.deepEqual(
			sourceRectToDisplayed(rotated(90), [40, 50, 140, 70]),
			{ x: 430, y: 40, width: 20, height: 100 },
		);
		assert.strictEqual(
			sourceRectToDisplayed(
				{
					...page,
					resize: {
						width: 100,
						height: 100,
						mode: 'fit',
						anchor: 'top-left',
					},
				},
				[0, 0, 1, 1],
			),
			null,
		);
	});

	test('addFormFields writes typed fields at their rects', async function (assert) {
		const out = await PDFDocument.create();
		out.addPage([400, 500]);
		const font = await out.embedFont('Helvetica');
		const page = rotated(0);
		page.objects = [
			field({
				name: 'email',
				value: 'a@b.c',
				required: true,
			}),
			field({
				id: 'r',
				field: 'radio',
				name: 'yes',
				options: ['Yes', 'No'],
				value: 'No',
				cy: 200,
				h: 40,
			}),
			field({
				id: 's',
				field: 'signature',
				name: 'sig',
				cy: 300,
			}),
		];
		addFormFields(out, { name: 't', pages: [page] }, font);
		const saved = await PDFDocument.load(await out.save());
		const fields = saved.getForm().getFields();
		assert.deepEqual(
			fields.map((f) => f.getName()),
			['email', 'yes', 'sig'],
		);
		assert.true(fields[0] instanceof PDFTextField);
		assert.true(fields[1] instanceof PDFRadioGroup);
		assert.true(fields[2] instanceof PDFSignature);
		const rect = fields[0]!.acroField
			.getWidgets()[0]!
			.getRectangle();
		assert.deepEqual(rect, {
			x: 40,
			y: 430,
			width: 100,
			height: 20,
		});
		assert.true(fields[0]!.isRequired());
		assert.strictEqual(
			saved.getForm().getTextField('email').getText(),
			'a@b.c',
		);
		assert.strictEqual(
			saved.getForm().getRadioGroup('yes').getSelected(),
			'No',
		);
	});

	test('carryAcroForm keeps source fields on copied pages', async function (assert) {
		const src = await PDFDocument.create();
		src.addPage([400, 500]);
		src.addPage([400, 500]);
		const form = src.getForm();
		form.createTextField('one').addToPage(src.getPage(0));
		form.createCheckBox('two').addToPage(src.getPage(1));
		const source = await PDFDocument.load(await src.save());
		const out = await PDFDocument.create();
		const [copied] = await out.copyPages(source, [1]);
		carryAcroForm(source, out, [copied!]);
		out.addPage(copied);
		const saved = await PDFDocument.load(await out.save());
		assert.deepEqual(
			saved
				.getForm()
				.getFields()
				.map((f) => f.getName()),
			['two'],
		);
		const widget = saved
			.getForm()
			.getCheckBox('two')
			.acroField.getWidgets()[0]!;
		assert.strictEqual(widget.P(), saved.getPage(0).ref);
	});
});
