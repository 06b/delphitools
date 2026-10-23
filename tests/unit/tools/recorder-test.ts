import { module, test } from 'qunit';
import {
	overview,
	stripLayout,
} from 'delphitools-v2/components/tools/media/capture';

module('Unit | Tool | media recorder', function () {
	test('overview folds peaks to their maximum, mirrored', function (assert) {
		const folded = overview([0.1, 0.5, 0.2, 0.9, 0.3], 2);
		assert.deepEqual(
			Array.from(folded.max, (v) => +v.toFixed(2)),
			[0.5, 0.9],
		);
		assert.deepEqual(
			Array.from(folded.min, (v) => +v.toFixed(2)),
			[-0.5, -0.9],
		);
		assert.strictEqual(overview([0.4], 800).max.length, 1);
		assert.strictEqual(overview([], 800).max[0], 0);
	});

	test('running strip: the head at three quarters, two units a peak', function (assert) {
		// 1.01 s = peak 50 and half of the next
		const layout = stripLayout(100, 1.01, 400, 1, false);
		assert.strictEqual(layout.head, 300);
		assert.strictEqual(layout.step, 2);
		assert.strictEqual(layout.index, 50);
		assert.strictEqual(layout.slip, 1);
		assert.strictEqual(layout.from, 0);
		assert.strictEqual(layout.to, 100);
		const late = stripLayout(1000, 15.01, 400, 2, false);
		assert.strictEqual(late.step, 4);
		assert.strictEqual(late.index, 750);
		assert.strictEqual(late.from, 750 - Math.ceil(102 * 0.75));
		assert.strictEqual(late.to, 852);
		assert.strictEqual(
			stripLayout(10, 9, 400, 1, false).slip,
			2,
			'past the last peak the slip stops at one column',
		);
	});

	test('fitted strip: the whole take spans the width', function (assert) {
		const layout = stripLayout(100, 1, 400, 1, true);
		assert.strictEqual(layout.step, 4);
		assert.strictEqual(layout.head, 200);
		assert.strictEqual(layout.from, 0);
		assert.strictEqual(layout.to, 100);
	});
});
