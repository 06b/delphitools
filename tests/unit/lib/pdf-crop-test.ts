import { module, test } from 'qunit';
import {
	boxFromPoints,
	cropFromInsets,
	cropToPaper,
	displaySize,
	insetsOf,
	intersectBox,
	toDisplay,
	toPage,
} from 'delphitools-v2/lib/pdf-crop';

const size = { width: 200, height: 300 };

module('Unit | Lib | pdf-crop', function () {
	module('boxFromPoints', function () {
		test('is corner-order independent', function (assert) {
			const expected = {
				x: 10,
				y: 20,
				width: 100,
				height: 200,
			};
			assert.deepEqual(
				boxFromPoints(10, 20, 110, 220),
				expected,
			);
			assert.deepEqual(
				boxFromPoints(110, 220, 10, 20),
				expected,
			);
			assert.deepEqual(
				boxFromPoints(10, 220, 110, 20),
				expected,
			);
		});
	});

	module('intersectBox', function () {
		test('returns the overlap of two crossing boxes', function (assert) {
			assert.deepEqual(
				intersectBox(
					{ x: 0, y: 0, width: 100, height: 100 },
					{
						x: 50,
						y: 50,
						width: 100,
						height: 100,
					},
				),
				{ x: 50, y: 50, width: 50, height: 50 },
			);
		});

		test('edge-touching boxes have no overlap', function (assert) {
			assert.strictEqual(
				intersectBox(
					{ x: 0, y: 0, width: 50, height: 50 },
					{ x: 50, y: 0, width: 50, height: 50 },
				),
				null,
			);
		});
	});

	module('cropFromInsets', function () {
		test('builds a display box from edge insets, origin top-left', function (assert) {
			const insets = {
				left: 10,
				top: 20,
				right: 30,
				bottom: 40,
			};
			const box = cropFromInsets(size, insets);
			assert.deepEqual(box, {
				x: 10,
				y: 20,
				width: 160,
				height: 240,
			});
			assert.deepEqual(insetsOf(box!, size), insets);
		});

		test('rejects a collapsed or negative box', function (assert) {
			assert.strictEqual(
				cropFromInsets(size, {
					left: 100,
					top: 0,
					right: 100,
					bottom: 0,
				}),
				null,
			);
			assert.strictEqual(
				cropFromInsets(size, {
					left: -1,
					top: 0,
					right: 0,
					bottom: 0,
				}),
				null,
			);
		});
	});

	test('cropToPaper centres the paper, overflow kept', function (assert) {
		assert.deepEqual(
			cropToPaper(size, { width: 100, height: 200 }),
			{
				x: 50,
				y: 50,
				width: 100,
				height: 200,
			},
		);
		assert.deepEqual(
			cropToPaper(
				{ width: 100, height: 100 },
				{ width: 200, height: 200 },
			),
			{ x: -50, y: -50, width: 200, height: 200 },
		);
	});

	module('display and page space', function () {
		const box = { x: 10, y: 20, width: 200, height: 300 };

		test('a quarter turn swaps the display size', function (assert) {
			assert.deepEqual(displaySize(box, 90), {
				width: 300,
				height: 200,
			});
			assert.deepEqual(displaySize(box, 180), {
				width: 200,
				height: 300,
			});
		});

		test('the display top-left is the right page corner', function (assert) {
			const corner = { x: 0, y: 0, width: 1, height: 1 };
			const at = (rotation: number) => {
				const r = toPage(corner, box, rotation);
				return [r.x, r.y];
			};
			// clockwise turns: top-left, bottom-left, bottom-right, top-right
			assert.deepEqual(at(0), [10, 319]);
			assert.deepEqual(at(90), [10, 20]);
			assert.deepEqual(at(180), [209, 20]);
			assert.deepEqual(at(270), [209, 319]);
		});

		test('round-trips at every rotation (iOS selfCheck)', function (assert) {
			for (const rotation of [0, 90, 180, 270]) {
				const shown = displaySize(box, rotation);
				const rect = {
					x: 5,
					y: 15,
					width: shown.width / 2,
					height: shown.height / 4,
				};
				const page = toPage(rect, box, rotation);
				assert.deepEqual(
					intersectBox(page, box),
					page,
					`${rotation}: inside the box`,
				);
				assert.deepEqual(
					toDisplay(page, box, rotation),
					rect,
					`${rotation}: back to display`,
				);
			}
		});
	});
});
