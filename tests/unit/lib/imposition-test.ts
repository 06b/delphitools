import { module, test } from 'qunit';
import { placeInCell } from 'delphitools-v2/lib/imposition';

const round = (box: Record<string, number>) =>
	Object.fromEntries(
		Object.entries(box).map(([k, v]) => [
			k,
			Math.round(v * 1000) / 1000,
		]),
	);

module('Unit | Lib | imposition', function () {
	test('placeInCell fits, fills and keeps the actual size', function (assert) {
		const tall = { x: 0, y: 0, width: 100, height: 200 };
		const square = { width: 50, height: 50 };
		assert.deepEqual(round(placeInCell(tall, square, 0, 'fit')), {
			x: 0,
			y: 50,
			width: 100,
			height: 100,
		});
		assert.deepEqual(round(placeInCell(tall, square, 0, 'fill')), {
			x: -50,
			y: 0,
			width: 200,
			height: 200,
		});
	});

	test('placeInCell centres a turned page', function (assert) {
		const wide = { x: 0, y: 0, width: 200, height: 100 };
		assert.deepEqual(
			round(
				placeInCell(
					wide,
					{ width: 50, height: 100 },
					90,
					'fit',
				),
			),
			{ x: 200, y: 0, width: 100, height: 200 },
		);
		const square = { x: 0, y: 0, width: 100, height: 100 };
		assert.deepEqual(
			round(
				placeInCell(
					square,
					{ width: 40, height: 60 },
					180,
					'actual',
				),
			),
			{ x: 70, y: 80, width: 40, height: 60 },
		);
	});
});
