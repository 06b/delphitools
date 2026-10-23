import { module, test } from 'qunit';
import type { Quad } from 'delphitools-v2/lib/deskew';
import {
	capped,
	grabAt,
	hintSpot,
	isConvex,
	moveGrab,
	project,
	toRatio,
} from 'delphitools-v2/components/tools/image-deskewer/geometry';

const square: Quad = [
	{ x: 0, y: 0 },
	{ x: 100, y: 0 },
	{ x: 100, y: 100 },
	{ x: 0, y: 100 },
];

const rounded = ({ x, y }: { x: number; y: number }) => ({
	x: Math.round(x * 1e6) / 1e6,
	y: Math.round(y * 1e6) / 1e6,
});

module('Unit | Tool | image-deskewer', function () {
	test('grabAt: corner, edge, inside, outside (iOS DeskewGrab.selfCheck)', function (assert) {
		assert.deepEqual(grabAt({ x: 10, y: 12 }, square), {
			kind: 'corner',
			index: 0,
		});
		assert.deepEqual(grabAt({ x: 95, y: 104 }, square), {
			kind: 'corner',
			index: 2,
		});
		assert.deepEqual(grabAt({ x: 50, y: -8 }, square), {
			kind: 'edge',
			index: 0,
		});
		assert.deepEqual(grabAt({ x: 108, y: 50 }, square), {
			kind: 'edge',
			index: 1,
		});
		assert.deepEqual(grabAt({ x: 50, y: 50 }, square), {
			kind: 'whole',
		});
		assert.strictEqual(
			grabAt({ x: 200, y: 200 }, square),
			undefined,
		);
	});

	test('moveGrab clamps the move to the image', function (assert) {
		const size = { width: 120, height: 120 };
		assert.deepEqual(
			moveGrab(
				square,
				{ kind: 'corner', index: 2 },
				{ x: 50, y: 5 },
				size,
			)[2],
			{ x: 120, y: 105 },
		);
		const edge = moveGrab(
			square,
			{ kind: 'edge', index: 3 },
			{ x: -5, y: 10 },
			size,
		);
		assert.deepEqual(edge[3], { x: 0, y: 110 });
		assert.deepEqual(edge[0], { x: 0, y: 10 });
		assert.deepEqual(edge[1], square[1]);
		assert.deepEqual(
			moveGrab(
				square,
				{ kind: 'whole' },
				{ x: 30, y: -3 },
				size,
			),
			square.map(({ x, y }) => ({ x: x + 20, y })),
		);
	});

	test('isConvex: clockwise convex only', function (assert) {
		assert.true(isConvex(square));
		assert.false(
			isConvex([square[1], square[0], square[2], square[3]]),
		);
		assert.false(isConvex([...square].reverse()));
	});

	test('project maps the unit square onto the quad', function (assert) {
		const skewed: Quad = [
			{ x: 20, y: 10 },
			{ x: 190, y: 5 },
			{ x: 180, y: 95 },
			{ x: 10, y: 80 },
		];
		const units = [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1],
		] as const;
		units.forEach(([u, v], i) => {
			const p = project(u, v, skewed);
			assert.deepEqual(rounded(p), skewed[i]);
		});
		assert.deepEqual(rounded(project(0.5, 0.5, square)), {
			x: 50,
			y: 50,
		});
	});

	test('capped keeps the long edge at most 8192', function (assert) {
		assert.deepEqual(capped({ width: 16384, height: 4096 }), {
			width: 8192,
			height: 2048,
		});
		assert.deepEqual(capped({ width: 300, height: 200 }), {
			width: 300,
			height: 200,
		});
	});

	test('hintSpot picks the largest strip that holds the hint', function (assert) {
		const frame = { x: 0, y: 0, width: 200, height: 100 };
		const quad = [
			{ x: 10, y: 10 },
			{ x: 60, y: 10 },
			{ x: 60, y: 90 },
			{ x: 10, y: 90 },
		];
		assert.deepEqual(
			hintSpot(frame, quad, { width: 40, height: 20 }),
			{ x: 110, y: 40 },
		);
		assert.strictEqual(
			hintSpot(frame, quad, { width: 400, height: 20 }),
			undefined,
		);
	});

	test('toRatio: the long edge kept, the ratio as given', function (assert) {
		const size = { width: 300, height: 200 };
		assert.deepEqual(toRatio(size, 4, 5), {
			width: 240,
			height: 300,
		});
		assert.deepEqual(toRatio(size, 16, 9), {
			width: 300,
			height: 169,
		});
		assert.deepEqual(toRatio(size, 1, 1), {
			width: 300,
			height: 300,
		});
	});
});
