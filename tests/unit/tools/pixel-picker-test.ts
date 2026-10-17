import { module, test } from 'qunit';
import {
	clampPixel,
	fitRect,
	launchFlags,
	lensLayout,
	pixelAt,
	place,
} from 'delphitools-v2/components/tools/pixel-picker/geometry';

module('Unit | Tool | pixel-picker', function () {
	test('fits and centres the image', function (assert) {
		assert.deepEqual(
			fitRect(
				{ width: 400, height: 400 },
				{ width: 200, height: 100 },
			),
			{ x: 0, y: 100, width: 400, height: 200 },
		);
	});

	test('pixels and points round-trip', function (assert) {
		const image = { width: 3, height: 2 };
		const fit = fitRect({ width: 300, height: 300 }, image);
		const centre = place({ x: 2, y: 1 }, fit, image);
		assert.deepEqual(centre, { x: 250, y: 200 });
		assert.deepEqual(pixelAt(centre, fit, image), { x: 2, y: 1 });
		assert.deepEqual(pixelAt({ x: -40, y: 900 }, fit, image), {
			x: 0,
			y: 1,
		});
		assert.deepEqual(clampPixel({ x: 9.7, y: -3 }, image), {
			x: 2,
			y: 0,
		});
	});

	test('launch flags', function (assert) {
		const flags = launchFlags(
			'?pickerImage&pickerPixel=4,5&pickerPicks=1,2;x;3,4',
		);
		assert.true(flags.image);
		assert.deepEqual(flags.pixel, { x: 4, y: 5 });
		assert.deepEqual(flags.picks, [
			{ x: 1, y: 2 },
			{ x: 3, y: 4 },
		]);
		assert.false(flags.later);
		assert.strictEqual(launchFlags('').pixel, undefined);
	});

	test('the lens centres on the pixel, Pick under it, the value above', function (assert) {
		const area = { width: 600, height: 400 };
		const mid = lensLayout({ x: 300, y: 200 }, 120, area);
		assert.deepEqual(mid.lens, {
			x: 240,
			y: 140,
			width: 120,
			height: 120,
		});
		assert.deepEqual(mid.pick, {
			x: 268,
			y: 266,
			width: 64,
			height: 36,
		});
		assert.deepEqual(mid.detail, { x: 300, y: 110 });
		const top = lensLayout({ x: 0, y: 0 }, 120, area);
		assert.deepEqual(
			[top.lens.x, top.lens.y, top.detail.y],
			[8, 34, 4],
		);
		const bottom = lensLayout({ x: 600, y: 400 }, 120, area);
		assert.strictEqual(bottom.pick.y + bottom.pick.height, 396);
		assert.strictEqual(bottom.lens.x, 472);
	});
});
