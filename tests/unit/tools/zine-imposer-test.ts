import { module, test } from 'qunit';
import {
	fillOrder,
	isPdf,
	move,
	placement,
	resize,
} from 'delphitools-v2/components/tools/zine-imposer/images';

module('Unit | Tool | zine-imposer', function () {
	test('fillOrder: empty slots from the start, then wrapped (iOS selfCheck)', function (assert) {
		assert.deepEqual(
			fillOrder([true, false, false, true, false], 3),
			[4, 1, 2],
		);
		assert.deepEqual(fillOrder([true, true], 0), []);
		assert.deepEqual(fillOrder([], 2), []);
		assert.deepEqual(fillOrder([false, false], 9), [1, 0]);
	});

	test('move: takes the item out and puts it in at the new index', function (assert) {
		assert.deepEqual(move(['a', 'b', 'c', 'd'], 0, 2), [
			'b',
			'c',
			'a',
			'd',
		]);
		assert.deepEqual(move(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
	});

	test('resize: keeps slots by index, pads with null', function (assert) {
		assert.deepEqual(resize([null], 3), [null, null, null]);
		assert.strictEqual(
			resize([null, null, null, null], 2).length,
			2,
		);
	});

	test('placement: fit sits inside the cell, fill covers it, centred', function (assert) {
		const cell = { width: 100, height: 200 };
		const wide = { width: 400, height: 200 };
		assert.deepEqual(placement(wide, cell, false), {
			x: 0,
			y: 75,
			width: 100,
			height: 50,
		});
		assert.deepEqual(placement(wide, cell, true), {
			x: -150,
			y: 0,
			width: 400,
			height: 200,
		});
	});

	test('isPdf: by type or by name', function (assert) {
		assert.true(
			isPdf(
				new File([], 'a.bin', {
					type: 'application/pdf',
				}),
			),
		);
		assert.true(isPdf(new File([], 'A.PDF')));
		assert.false(
			isPdf(new File([], 'a.png', { type: 'image/png' })),
		);
	});
});
