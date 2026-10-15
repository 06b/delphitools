import { module, test } from 'qunit';
import {
	frameCount,
	maxFrames,
	outputSize,
} from 'delphitools-v2/components/tools/video-to-gif/plan';

module('Unit | Tool | video-to-gif', function () {
	test('frameCount is the span times the rate, at least one', function (assert) {
		assert.strictEqual(frameCount(0, 5, 10), 50);
		assert.strictEqual(frameCount(5, 0, 10), 50);
		assert.strictEqual(frameCount(1, 1, 10), 1);
		assert.true(frameCount(0, 30.1, 10) > maxFrames);
	});

	test('outputSize keeps the aspect and never upscales', function (assert) {
		assert.deepEqual(outputSize(480, 1920, 1080), [480, 270]);
		assert.deepEqual(outputSize(480, 320, 180), [320, 180]);
		assert.deepEqual(outputSize(480, 0, 0), [0, 0]);
	});
});
