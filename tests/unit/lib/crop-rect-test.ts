import { module, test } from 'qunit';
import {
	dragEdges,
	edgesAt,
	fit,
	integral,
	isWhole,
	moved,
	nudged,
	whole,
} from 'delphitools-v2/lib/crop-rect';

const pixels = { width: 1000, height: 500 };
const key = (name: string, shiftKey = false, altKey = false) => ({
	key: name,
	shiftKey,
	altKey,
});

module('Unit | Lib | crop-rect', function () {
	test('fit centres the image in the area', function (assert) {
		assert.deepEqual(
			fit(pixels, { x: 0, y: 0, width: 400, height: 400 }),
			{
				x: 0,
				y: 100,
				width: 400,
				height: 200,
			},
		);
	});

	test('integral covers the rect in whole pixels', function (assert) {
		assert.deepEqual(
			integral({ x: 1.6, y: 2.2, width: 10, height: 3.1 }),
			{
				x: 1,
				y: 2,
				width: 11,
				height: 4,
			},
		);
	});

	test('edgesAt: corners, edges, inside and outside', function (assert) {
		const shown = { x: 100, y: 100, width: 200, height: 100 };
		assert.deepEqual(edgesAt({ x: 102, y: 98 }, shown), {
			left: true,
			top: true,
			right: false,
			bottom: false,
		});
		assert.deepEqual(edgesAt({ x: 200, y: 205 }, shown), {
			left: false,
			top: false,
			right: false,
			bottom: true,
		});
		assert.strictEqual(
			edgesAt({ x: 200, y: 150 }, shown),
			undefined,
		);
		assert.strictEqual(edgesAt({ x: 10, y: 10 }, shown), undefined);
	});

	test('dragEdges moves the grabbed edges, keeping 8 px', function (assert) {
		const crop = whole(pixels);
		const edges = {
			left: true,
			top: false,
			right: false,
			bottom: true,
		};
		assert.deepEqual(dragEdges(crop, edges, { x: 200, y: 300 }), {
			x: 200,
			y: 0,
			width: 800,
			height: 300,
		});
		assert.deepEqual(dragEdges(crop, edges, { x: 999, y: 0 }), {
			x: 992,
			y: 0,
			width: 8,
			height: 8,
		});
	});

	test('moved stays inside the image', function (assert) {
		const crop = { x: 0, y: 0, width: 400, height: 200 };
		assert.deepEqual(moved(crop, { x: 900, y: -50 }, pixels), {
			x: 600,
			y: 0,
			width: 400,
			height: 200,
		});
	});

	test('nudged: arrows move, Shift by a tenth, Alt resizes', function (assert) {
		const crop = { x: 100, y: 100, width: 400, height: 200 };
		assert.deepEqual(nudged(crop, pixels, key('ArrowRight')), {
			...crop,
			x: 110,
		});
		assert.deepEqual(nudged(crop, pixels, key('ArrowUp', true)), {
			...crop,
			y: 50,
		});
		assert.deepEqual(
			nudged(crop, pixels, key('ArrowLeft', false, true)),
			{
				...crop,
				width: 390,
			},
		);
		assert.deepEqual(
			nudged(crop, pixels, key('ArrowDown', true, true)),
			{
				...crop,
				height: 250,
			},
		);
		assert.strictEqual(nudged(crop, pixels, key('a')), undefined);
	});

	test('isWhole', function (assert) {
		assert.true(isWhole(whole(pixels), pixels));
		assert.false(
			isWhole({ ...whole(pixels), x: 1, width: 999 }, pixels),
		);
	});
});
