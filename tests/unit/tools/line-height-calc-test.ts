import { module, test } from 'qunit';
import {
	activeMultiplier,
	customIndex,
	pangramRepeats,
	parseSize,
	pictureScale,
	presetFor,
	resultLines,
	settleEased,
	steppedSize,
} from 'delphitools-v2/components/tools/line-height-calc/line-height';

module('Unit | Tool | line-height-calc', function () {
	test('the result lines follow LineHeightCalcViewController', function (assert) {
		assert.deepEqual(
			resultLines(16, 1.5).map((line) => line.value),
			['24px', '8px', 'line-height: 1.5;', '.lineSpacing(8)'],
		);
		assert.deepEqual(
			resultLines(15, 1.618).map((line) => line.value),
			[
				'24.27px',
				'9.27px',
				'line-height: 1.618;',
				'.lineSpacing(9.27)',
			],
			'four decimals at most, trailing zeros dropped',
		);
	});

	test('Custom keeps its own multiplier, a preset its fixed one', function (assert) {
		assert.strictEqual(activeMultiplier(0, 1.9), 1.2);
		assert.strictEqual(activeMultiplier(2, 1.9), 1.75);
		assert.strictEqual(activeMultiplier(customIndex, 1.9), 1.9);
	});

	test('a ratio lights the preset it matches, and Custom otherwise', function (assert) {
		assert.strictEqual(presetFor(2), 3);
		assert.strictEqual(
			presetFor(1.2004),
			0,
			'within half a thousandth',
		);
		assert.strictEqual(presetFor(1.618), customIndex);
	});

	test('a typed size is a positive number, clamped to 1 to 200', function (assert) {
		assert.strictEqual(parseSize('18'), 18);
		assert.strictEqual(parseSize('12,5'), 12.5, 'decimal comma');
		assert.strictEqual(parseSize('900'), 200);
		assert.strictEqual(parseSize('0.5'), 1);
		assert.strictEqual(parseSize('0'), undefined);
		assert.strictEqual(parseSize('-4'), undefined);
		assert.strictEqual(parseSize('px'), undefined);
	});

	test('a step moves to the next whole pixel, within the range', function (assert) {
		assert.strictEqual(steppedSize(16, 1), 17);
		assert.strictEqual(steppedSize(12.4, 1), 13);
		assert.strictEqual(steppedSize(1, -1), 1);
		assert.strictEqual(steppedSize(200, 1), 200);
	});

	test('the picture shrinks only when two boxes do not fit', function (assert) {
		assert.strictEqual(pictureScale(24, 184), 1);
		assert.strictEqual(pictureScale(184, 184), 0.5);
	});

	test('the settle curve starts at 0 and lands on 1', function (assert) {
		assert.strictEqual(settleEased(0), 0);
		assert.strictEqual(settleEased(1), 1);
		assert.true(settleEased(0.3) > 1, 'one overshoot');
	});

	test('the pangram repeats more for smaller type', function (assert) {
		assert.true(pangramRepeats(10, 122) > pangramRepeats(40, 122));
		assert.strictEqual(pangramRepeats(200, 122), 2);
		assert.strictEqual(pangramRepeats(1, 122), 400);
	});
});
