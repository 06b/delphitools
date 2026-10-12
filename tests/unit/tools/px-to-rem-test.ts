import { module, test } from 'qunit';
import {
	convert,
	format,
	lineSpacing,
	nudged,
	parse,
	settleEased,
} from 'delphitools-v2/components/tools/px-to-rem/rem';

module('Unit | Tool | px-to-rem', function () {
	test('format keeps at most four decimals', function (assert) {
		assert.strictEqual(format(0.5), '0.5');
		assert.strictEqual(format(1), '1');
		assert.strictEqual(format(0.6875), '0.6875');
		assert.strictEqual(format(26.25), '26.25');
		assert.strictEqual(format(1 / 3), '0.3333');
		assert.strictEqual(format(1234.5), '1234.5', 'no grouping');
	});

	test('parse takes a decimal comma and the input unit', function (assert) {
		assert.strictEqual(parse('1,5', 'rem'), 1.5);
		assert.strictEqual(parse('16px', 'px'), 16);
		assert.strictEqual(parse(' 2 REM ', 'rem'), 2);
		assert.strictEqual(
			parse('16rem', 'px'),
			undefined,
			'the other unit',
		);
		assert.strictEqual(parse('x', 'px'), undefined);
		assert.strictEqual(parse('', 'px'), undefined);
	});

	test('convert both ways, nothing for a negative value', function (assert) {
		assert.strictEqual(convert(24, 16, false), 1.5);
		assert.strictEqual(convert(1.5, 16, true), 24);
		assert.strictEqual(convert(-1, 16, false), undefined);
		assert.strictEqual(convert(undefined, 16, false), undefined);
		assert.strictEqual(
			convert(20, 10, false),
			2,
			'a base other than 16',
		);
		assert.strictEqual(convert(2, 10, true), 20);
		for (const px of [1, 12, 16, 37.5, 100]) {
			// four rem decimals: 37.5 px comes back as 37.5008
			const rem = Number(format(convert(px, 16, false)!));
			assert.true(
				Math.abs(convert(rem, 16, true)! - px) < 0.001,
				`${px}px round-trips`,
			);
		}
	});

	test('one grid line per rem, at least 4 px apart', function (assert) {
		assert.strictEqual(lineSpacing(16), 16);
		assert.strictEqual(lineSpacing(4), 4);
		assert.strictEqual(lineSpacing(3), 6);
		assert.strictEqual(lineSpacing(1), 4);
	});

	test('steps of 1 px or a quarter rem, never below 0', function (assert) {
		assert.strictEqual(nudged(16, 1, false), '17');
		assert.strictEqual(nudged(1, -1, true), '0.75');
		assert.strictEqual(nudged(0, -1, false), '0');
		assert.strictEqual(nudged(undefined, 1, true), '0.25');
	});

	test('the settle overshoots once and ends at 1', function (assert) {
		assert.strictEqual(settleEased(0), 0);
		assert.strictEqual(settleEased(1), 1);
		assert.true(settleEased(0.3) > 1, 'overshoot');
	});
});
