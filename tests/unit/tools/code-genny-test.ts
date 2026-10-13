import { module, test } from 'qunit';
import {
	BARCODE_TYPES,
	filterContent,
	mod10CheckDigit,
} from 'delphitools-v2/components/tools/code-genny/barcode';
import {
	bars,
	digitBand,
	fullNumber,
	sheetOf,
	svgOf,
} from 'delphitools-v2/components/tools/code-genny/sheet';
import { pixelSize } from 'delphitools-v2/components/tools/qr-genny/code-sheet';

const look = { padding: 2, ink: '#000000', paper: '#ffffff', numbers: true };

module('Unit | Tool | code-genny', function () {
	test('a matrix becomes rows of modules; pdf417 rows are three tall', function (assert) {
		const matrix = sheetOf(
			'datamatrix',
			{ pixs: [1, 0, 0, 1], pixx: 2, pixy: 2 },
			look,
		);
		assert.deepEqual(matrix.modules, [
			[true, false],
			[false, true],
		]);
		const pdf = sheetOf(
			'pdf417',
			{
				pixs: [1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1],
				pixx: 2,
				pixy: 6,
			},
			look,
		);
		assert.deepEqual(pdf.modules, [
			[true, false],
			[false, true],
		]);
		assert.strictEqual(pdf.rowHeight, 3);
		assert.deepEqual(pixelSize(pdf, 2), { width: 12, height: 20 });
	});

	test('bars: widths to modules, taller bars to guards, digits to glyphs', function (assert) {
		const raw = {
			sbs: [1, 1, 2, 1, 1],
			bhs: [1.07, 1, 1.07],
			txt: [
				['1', 3.25, -5, 'OCR-B', 12],
				['2', 10.25, -5, 'OCR-B', 12],
			] as [string, number, number, string, number][],
		};
		const sheet = sheetOf('ean13', raw, look);
		assert.deepEqual(sheet.modules, [
			[true, false, true, true, false, true],
		]);
		assert.deepEqual([...sheet.guards], [0, 5]);
		assert.deepEqual(
			sheet.glyphs.map((g) => [g.text, g.x]),
			[
				['1', 2.5],
				['2', 9.5],
			],
		);
		assert.strictEqual(sheet.footer, digitBand);
		assert.strictEqual(sheet.rowHeight, bars.height);
		assert.strictEqual(
			sheet.margin.right,
			7,
			'room for the last digit',
		);
		const bare = sheetOf('ean13', raw, { ...look, numbers: false });
		assert.strictEqual(bare.glyphs.length, 0);
		assert.strictEqual(bare.guards.size, 0);
		assert.strictEqual(bare.footer, undefined);
	});

	test('svgOf: one rect per run, text as text', function (assert) {
		const sheet = sheetOf(
			'code128',
			{
				sbs: [2, 1, 1],
				bhs: [1, 1],
				txt: [['A&B', 0, null, 'OCR-B', 10]],
			},
			look,
		);
		const svg = svgOf(sheet, 3);
		const doc = new DOMParser().parseFromString(
			svg,
			'image/svg+xml',
		);
		assert.strictEqual(doc.querySelectorAll('g rect').length, 2);
		assert.strictEqual(
			doc.querySelector('text')?.textContent,
			'A&B',
		);
		assert.strictEqual(
			doc.documentElement.getAttribute('width'),
			String(pixelSize(sheet, 3).width),
		);
	});

	test('check digits and content filters', function (assert) {
		assert.strictEqual(mod10CheckDigit('590123412345', 1, 3), 7);
		assert.strictEqual(
			fullNumber('ean13', '590123412345'),
			'5901234123457',
		);
		assert.strictEqual(
			fullNumber('upca', '01234567890'),
			'012345678905',
		);
		assert.strictEqual(fullNumber('code128', 'abc'), 'abc');
		assert.strictEqual(filterContent('ab-1€', 'code39'), 'AB-1');
		assert.strictEqual(
			BARCODE_TYPES.ean13.validate?.('5901234123458'),
			'Check digit should be 7 — or enter just the first 12 digits to auto-fill it',
		);
	});
});
