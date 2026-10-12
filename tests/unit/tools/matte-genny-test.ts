import { module, test } from 'qunit';
import {
	average,
	bytes,
	cover,
	diagonalAngle,
	drawMatte,
	fileName,
	fit,
	heightOf,
	shifted,
	solid,
	widthLimit,
	type MatteSpec,
} from 'delphitools-v2/components/tools/matte-genny/matte';

const spec = (more: Partial<MatteSpec>): MatteSpec => ({
	style: solid,
	colour: [255, 255, 255],
	dominant: [136, 136, 136],
	ratioW: 1,
	ratioH: 1,
	width: 100,
	padding: 10,
	...more,
});

module('Unit | Tool | matte-genny', function () {
	test('output size and the 8192 long side', function (assert) {
		assert.strictEqual(heightOf(1080, 4, 5), 1350);
		assert.strictEqual(heightOf(1080, 9, 16), 1920);
		assert.strictEqual(heightOf(1080, 16, 9), 608);
		assert.strictEqual(widthLimit(9, 16), 4608);
		assert.strictEqual(widthLimit(16, 9), 8192);
	});

	test('fit, cover and the gradient stop', function (assert) {
		const box = { width: 100, height: 100 };
		assert.deepEqual(fit({ width: 200, height: 100 }, box, 10), {
			x: 10,
			y: 30,
			width: 80,
			height: 40,
		});
		assert.strictEqual(
			fit({ width: 200, height: 100 }, box, 60).width,
			0,
		);
		assert.deepEqual(cover({ width: 200, height: 100 }, box, 1), {
			x: -50,
			y: 0,
			width: 200,
			height: 100,
		});
		assert.deepEqual(shifted([20, 136, 250], -30), [0, 106, 220]);
		assert.deepEqual(bytes([30 / 255, 0.4, 1.2]), [30, 102, 255]);
	});

	test('the CSS gradient runs corner to corner as the canvas one', function (assert) {
		assert.strictEqual(diagonalAngle({ width: 1, height: 1 }), 135);
		const angle =
			(diagonalAngle({ width: 1920, height: 1080 }) *
				Math.PI) /
			180;
		// the direction of (w, h) in CSS angle terms: (sin, -cos)
		assert.true(
			Math.abs(
				Math.sin(angle) / -Math.cos(angle) -
					1920 / 1080,
			) < 1e-9,
		);
	});

	test('draws the solid matte and the photo at the padding', function (assert) {
		const red = new OffscreenCanvas(2, 1);
		const paint = red.getContext('2d')!;
		paint.fillStyle = 'rgb(255, 0, 0)';
		paint.fillRect(0, 0, 2, 1);
		const out = new OffscreenCanvas(100, 100);
		const context = out.getContext('2d')!;
		drawMatte(context, red, spec({ colour: [30, 102, 38] }));
		const at = (x: number, y: number) => [
			...context.getImageData(x, y, 1, 1).data.slice(0, 3),
		];
		assert.deepEqual(at(2, 2), [30, 102, 38], 'matte corner');
		assert.deepEqual(at(50, 50), [255, 0, 0], 'photo centre');
		assert.deepEqual(
			at(50, 20),
			[30, 102, 38],
			'padding band above the photo',
		);
		assert.deepEqual(average(red), [255, 0, 0]);
	});

	test('file name', function (assert) {
		assert.strictEqual(
			fileName('photo', 1080, 1350),
			'photo-matte-1080x1350.png',
		);
	});
});
