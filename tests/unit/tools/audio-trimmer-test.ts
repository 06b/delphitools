import { module, test } from 'qunit';
import { applyFades } from 'delphitools-v2/lib/audio';
import {
	centredOn,
	envelope,
	fadeLimit,
	gainAt,
} from 'delphitools-v2/components/tools/audio-trimmer/fades';

module('Unit | Tool | audio-trimmer', function () {
	test('fadeLimit is the cut length, at most 10 s, at least 0.01', function (assert) {
		assert.strictEqual(fadeLimit(1, 4), 3);
		assert.strictEqual(fadeLimit(0, 60), 10);
		assert.strictEqual(fadeLimit(2, 2), 0.01);
	});

	test('gainAt ramps in and out, flat without fades', function (assert) {
		assert.strictEqual(gainAt(5, 2, 10, 0, 0), 1);
		assert.strictEqual(gainAt(2, 2, 10, 2, 0), 0);
		assert.strictEqual(gainAt(3, 2, 10, 2, 0), 0.5);
		assert.strictEqual(gainAt(6, 2, 10, 2, 4), 1);
		assert.strictEqual(gainAt(9, 2, 10, 2, 4), 0.25);
		assert.strictEqual(gainAt(10, 2, 10, 2, 4), 0);
	});

	test('gainAt matches the samples applyFades writes', function (assert) {
		const rate = 100;
		const channel = new Float32Array(400).fill(1);
		applyFades([channel], rate, 1, 1.5);
		for (const i of [0, 50, 100, 200, 300, 399]) {
			const expected = gainAt(i / rate, 0, 4, 1, 1.5);
			assert.true(
				Math.abs(channel[i]! - expected) < 0.02,
				`sample ${i}: ${channel[i]} vs ${expected}`,
			);
		}
	});

	test('overlapping fades multiply', function (assert) {
		assert.strictEqual(gainAt(1, 0, 2, 2, 2), 0.25);
	});

	test('envelope runs in to out, floor to ceiling to floor', function (assert) {
		const points = envelope(2, 10, 1, 2);
		assert.deepEqual(points[0], [2, 0]);
		assert.deepEqual(points.at(-1), [10, 0]);
		assert.true(points.some(([t, g]) => t === 3 && g === 1));
		assert.true(points.some(([t, g]) => t === 8 && g === 1));
		const times = points.map(([t]) => t);
		assert.deepEqual(
			times,
			[...times].sort((a, b) => a - b),
		);
	});

	test('envelope without fades is the two ends at full gain', function (assert) {
		assert.deepEqual(envelope(1, 3, 0, 0), [
			[1, 1],
			[3, 1],
		]);
	});

	test('centredOn keeps the view inside the file', function (assert) {
		assert.deepEqual(centredOn(5, 2, 10), [4, 6]);
		assert.deepEqual(centredOn(0.5, 2, 10), [0, 2]);
		assert.deepEqual(centredOn(9.8, 2, 10), [8, 10]);
	});
});
