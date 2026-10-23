import { module, test } from 'qunit';
import {
	cropMarks,
	DEFAULT_IMPOSITION_CONFIG,
	getLayoutById,
	type ImpositionConfig,
} from 'delphitools-v2/lib/imposition';
import {
	creases,
	millimetres,
	printSheet,
	signatures,
} from 'delphitools-v2/components/tools/imposer/sheet';

const config: ImpositionConfig = {
	...DEFAULT_IMPOSITION_CONFIG,
	cropMarks: true,
};

module('Unit | Tool | imposer', function () {
	test('a saddle-stitch front has two marks per outer edge, outside the margin', function (assert) {
		const result = getLayoutById('saddle-stitch')!.calculate(
			8,
			config,
		);
		const front = printSheet(result.sheets[0]!.front, {
			layoutId: 'saddle-stitch',
			width: 297,
			height: 210,
			cropMarks: true,
			back: false,
		});
		assert.deepEqual(
			front.cells.map((c) => c.pageNumber),
			[8, 1],
		);
		assert.strictEqual(front.creases.length, 1);
		// iOS selfCheck: 12 marks, each starting outside the 5 mm margin
		assert.strictEqual(front.marks.length, 12);
		assert.true(
			front.marks.every(
				(m) =>
					m.x1 < 5.01 ||
					m.y1 < 5.01 ||
					m.x1 > 297 - 5.01 ||
					m.y1 > 210 - 5.01,
			),
		);
	});

	test('crop marks off leaves no marks', function (assert) {
		const result = getLayoutById('four-up-booklet')!.calculate(
			8,
			config,
		);
		const front = printSheet(result.sheets[0]!.front, {
			layoutId: 'four-up-booklet',
			width: 297,
			height: 210,
			cropMarks: false,
			back: false,
		});
		assert.deepEqual(
			front.cells.map((c) => c.rotation),
			[180, 180, 0, 0],
		);
		assert.strictEqual(front.creases.length, 2);
		assert.strictEqual(front.marks.length, 0);
	});

	test('folds only where the sheet folds', function (assert) {
		assert.strictEqual(
			creases('step-and-repeat', 10, 20).length,
			0,
		);
		assert.deepEqual(creases('saddle-stitch', 10, 20)[0], {
			x1: 5,
			y1: 0,
			x2: 5,
			y2: 20,
		});
		assert.strictEqual(creases('gang-run', 10, 20).length, 0);
		assert.strictEqual(creases('custom-nup', 10, 20).length, 0);
	});

	test('an inner cell has no marks', function (assert) {
		const result = getLayoutById('custom-nup')!.calculate(18, {
			...config,
			customGrid: [3, 3],
		});
		const lines = cropMarks(result.sheets[0]!.front);
		// 9 cells, 12 outer edge segments, 2 marks each
		assert.strictEqual(lines.length, 24);
	});

	test('a saddle stitch is one signature, four pages a sheet', function (assert) {
		const result = getLayoutById('saddle-stitch')!.calculate(
			12,
			config,
		);
		assert.deepEqual(signatures(result.sheets), [
			{ sheets: 3, from: 1, to: 12 },
		]);
	});

	test('perfect-bind signatures group the sheets, iOS selfCheck', function (assert) {
		const result = getLayoutById('perfect-bind')!.calculate(38, {
			...config,
			layoutId: 'perfect-bind',
			signaturePages: 16,
		});
		assert.deepEqual(signatures(result.sheets), [
			{ sheets: 4, from: 1, to: 16 },
			{ sheets: 4, from: 17, to: 32 },
			{ sheets: 4, from: 33, to: 48 },
		]);
	});

	test('sizes read in millimetres, one decimal at most', function (assert) {
		assert.strictEqual(millimetres(297, 210), '297 × 210 mm');
		assert.strictEqual(
			millimetres(142.5, 199.96),
			'142.5 × 200 mm',
		);
	});
});
