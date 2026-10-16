import { module, test } from 'qunit';
import {
	cellRect,
	cells,
	frames,
	seamFor,
	tileSize,
	trimmed,
} from 'delphitools-v2/components/tools/image-splitter/split';

module('Unit | Tool | image-splitter', function () {
	test('whole pixels a tile, the remainder trimmed', function (assert) {
		const pixels = { width: 1000, height: 601 };
		assert.deepEqual(tileSize(pixels, 3, 3), {
			width: 333,
			height: 200,
		});
		assert.deepEqual(trimmed(pixels, 3, 3), {
			width: 1,
			height: 1,
		});
		assert.deepEqual(trimmed({ width: 900, height: 600 }, 3, 3), {
			width: 0,
			height: 0,
		});
		assert.deepEqual(tileSize({ width: 10, height: 10 }, 20, 20), {
			width: 0,
			height: 0,
		});
	});

	test('cells row by row, labelled from 1', function (assert) {
		const grid = cells(2, 3);
		assert.strictEqual(grid.length, 6);
		assert.deepEqual(grid[4], { row: 1, col: 1, label: '2-2' });
		assert.strictEqual(cells(1, 10)[9]!.label, '1-10');
	});

	test('a cell crops its tile', function (assert) {
		assert.deepEqual(
			cellRect(
				{ row: 1, col: 2, label: '2-3' },
				{ width: 1000, height: 600 },
				3,
				3,
			),
			{ x: 666, y: 200, width: 333, height: 200 },
		);
	});

	test('frames fit the grid with seams, centred', function (assert) {
		assert.deepEqual(
			frames(1, 2, { width: 100, height: 100 }, 10, {
				width: 210,
				height: 300,
			}),
			[
				{ x: 0, y: 100, width: 100, height: 100 },
				{ x: 110, y: 100, width: 100, height: 100 },
			],
		);
		assert.deepEqual(
			frames(1, 1, { width: 0, height: 1 }, 0, {
				width: 10,
				height: 10,
			}),
			[],
		);
	});

	test('seams thin out with more tiles', function (assert) {
		const area = { width: 600, height: 480 };
		assert.strictEqual(seamFor(area, 3, 3), 8);
		assert.strictEqual(seamFor(area, 20, 20), 4);
	});
});
