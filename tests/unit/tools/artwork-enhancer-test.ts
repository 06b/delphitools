import { module, test } from 'qunit';
import {
	busyness,
	detailRect,
	enhance,
	fillNoise,
	magnified,
	noiseCanvas,
	noiseDimensions,
} from 'delphitools-v2/components/tools/artwork-enhancer/noise';

module('Unit | Tool | artwork-enhancer', function () {
	test('fillNoise writes opaque colours from the random source', function (assert) {
		const data = new Uint8ClampedArray(8);
		fillNoise(data, () => 0.5);
		assert.deepEqual(
			[...data],
			[128, 128, 128, 255, 128, 128, 128, 255],
		);
	});

	test('noiseDimensions rounds blocks up', function (assert) {
		assert.deepEqual(noiseDimensions(10, 7, 3), {
			width: 4,
			height: 3,
		});
		assert.deepEqual(noiseDimensions(10, 7, 1), {
			width: 10,
			height: 7,
		});
	});

	test('detailRect: a centred square, never larger than the image', function (assert) {
		assert.deepEqual(detailRect(200, 100, 64), {
			x: 68,
			y: 18,
			side: 64,
		});
		assert.deepEqual(detailRect(40, 30, 64), {
			x: 5,
			y: 0,
			side: 30,
		});
	});

	test('detailRect: around a centre, kept inside the image', function (assert) {
		assert.deepEqual(detailRect(200, 100, 64, { x: 50, y: 40 }), {
			x: 18,
			y: 8,
			side: 64,
		});
		assert.deepEqual(detailRect(200, 100, 64, { x: -10, y: 500 }), {
			x: 0,
			y: 36,
			side: 64,
		});
	});

	test('busyness: flat is 0, an edge is busiest, far from it is quieter', function (assert) {
		const width = 32;
		const height = 8;
		const flat = new Uint8ClampedArray(width * height * 4).fill(
			128,
		);
		assert.ok(
			busyness(flat, width, height, 2).every((v) => v === 0),
			'a flat image has no detail',
		);
		const edge = new Uint8ClampedArray(width * height * 4);
		for (let i = 0; i < width * height; i++)
			edge.fill(
				i % width < width / 2 ? 0 : 255,
				i * 4,
				i * 4 + 4,
			);
		const busy = busyness(edge, width, height, 2);
		const row = (x: number) => busy[4 * width + x]!;
		assert.strictEqual(Math.max(...busy), 1, 'normalised to 1');
		assert.ok(row(15) > 0.999, 'busiest at the edge');
		assert.ok(row(16) > 0.999, 'on both sides');
		assert.strictEqual(row(0), 0, 'nothing far from it');
		assert.ok(row(13) < row(15), 'falls off with distance');
	});

	test('enhance keeps the size; magnified is the detail at 8x', function (assert) {
		const source = document.createElement('canvas');
		source.width = 100;
		source.height = 80;
		const noise = noiseCanvas(100, 80, 2)!;
		assert.deepEqual([noise.width, noise.height], [50, 40]);
		const result = enhance(source, noise, 2)!;
		assert.deepEqual([result.width, result.height], [100, 80]);
		const detail = magnified(result)!;
		assert.deepEqual([detail.width, detail.height], [512, 512]);
	});
});
