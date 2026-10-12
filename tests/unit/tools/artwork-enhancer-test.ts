import { module, test } from 'qunit';
import {
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
