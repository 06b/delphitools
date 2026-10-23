import { module, test } from 'qunit';
import {
	clampSpan,
	dragTo,
	minimumSpan,
	nudgeStep,
	roundMs,
	share,
} from 'delphitools-v2/components/tools/media/trim-span';

module('Unit | Tool | media trim', function () {
	test('clampSpan keeps both points inside the file', function (assert) {
		assert.deepEqual(clampSpan(-2, 12, 10), [0, 10]);
		assert.deepEqual(clampSpan(2, 7.5, 10), [2, 7.5]);
	});

	test('clampSpan stops a crossing edge short of the other', function (assert) {
		const [start, end] = clampSpan(8, 5, 10);
		assert.strictEqual(end, 5);
		assert.strictEqual(start, 5 - minimumSpan);
		const [from, to] = clampSpan(10, 10, 10);
		assert.strictEqual(to, 10);
		assert.strictEqual(from, 10 - minimumSpan);
	});

	test('clampSpan with moved end keeps the start', function (assert) {
		assert.deepEqual(clampSpan(4, 1, 10, 'end'), [4, 4.01]);
		assert.deepEqual(clampSpan(9.995, 2, 10, 'end'), [9.99, 10]);
	});

	test('clampSpan on an empty file is 0 to 0', function (assert) {
		assert.deepEqual(clampSpan(3, 4, 0), [0, 0]);
	});

	test('nudgeStep is a hundredth of the file, at least 0.1 s', function (assert) {
		assert.strictEqual(nudgeStep(2), 0.1);
		assert.strictEqual(nudgeStep(120), 1.2);
	});

	test('share and roundMs', function (assert) {
		assert.strictEqual(share(5, 10), 0.5);
		assert.strictEqual(share(15, 10), 1);
		assert.strictEqual(share(1, 0), 0);
		assert.strictEqual(roundMs(1.23456), 1.235);
	});

	test('dragTo maps pixels to seconds, flipped right to left', function (assert) {
		assert.strictEqual(dragTo(2, 50, 200, 8), 4);
		assert.strictEqual(dragTo(2, 50, 200, 8, true), 0);
		assert.strictEqual(dragTo(1, 1, 3, 1), 1.333);
		assert.strictEqual(dragTo(1, 10, 0, 1), 11);
	});
});
