import { module, test } from 'qunit';
import {
	keptRect,
	margins,
	untrimmed,
} from 'delphitools-v2/components/tools/image-clipper/engine';

function pixels(width: number, height: number, opaque: [number, number][]) {
	const data = new Uint8ClampedArray(width * height * 4);
	for (const [x, y] of opaque) data[(y * width + x) * 4 + 3] = 255;
	return data;
}

module('Unit | Tool | image-clipper', function () {
	test('keptRect: top-left origin, pixel exact', function (assert) {
		const opaque: [number, number][] = [];
		for (let x = 4; x < 7; x++)
			for (let y = 5; y < 7; y++) opaque.push([x, y]);
		assert.deepEqual(keptRect(pixels(12, 8, opaque), 12, 8), {
			x: 4,
			y: 5,
			width: 3,
			height: 2,
		});
	});

	test('keptRect: one pixel, faint alpha counts', function (assert) {
		const data = new Uint8ClampedArray(5 * 5 * 4);
		data[(2 * 5 + 3) * 4 + 3] = 1;
		assert.deepEqual(keptRect(data, 5, 5), {
			x: 3,
			y: 2,
			width: 1,
			height: 1,
		});
	});

	test('keptRect: fully transparent is null', function (assert) {
		assert.strictEqual(keptRect(pixels(4, 4, []), 4, 4), null);
	});

	test('margins: as iOS ClipMargins', function (assert) {
		assert.deepEqual(
			margins(
				{ x: 500, y: 250, width: 600, height: 400 },
				{ width: 1400, height: 1000 },
			),
			{
				top: 250,
				right: 300,
				bottom: 350,
				left: 500,
				savedPercent: 83,
			},
		);
		const whole = margins(
			{ x: 0, y: 0, width: 10, height: 10 },
			{ width: 10, height: 10 },
		);
		assert.true(untrimmed(whole));
		assert.strictEqual(whole.savedPercent, 0);
	});
});
