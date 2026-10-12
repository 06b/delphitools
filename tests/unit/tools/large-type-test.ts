import { module, test } from 'qunit';
import {
	cell,
	charClass,
	fit,
	frames,
	marqueeSize,
	sizes,
	wrap,
} from 'delphitools-v2/components/tools/large-type/layout';

module('Unit | Tool | large-type', function () {
	test('charClass', function (assert) {
		assert.strictEqual(charClass('7'), 'digit');
		assert.strictEqual(charClass(' '), 'space');
		assert.strictEqual(charClass('é'), 'letter');
		assert.strictEqual(charClass('#'), 'special');
	});

	test('cells and fit, as LargeTypeLayout', function (assert) {
		assert.deepEqual(cell(100, 0.6, false), {
			width: 72,
			height: 132,
		});
		assert.strictEqual(fit([], 0.6, 300, 300, false), sizes.start);
		assert.strictEqual(
			fit(['x'], 0.6, 4000, 4000, false),
			sizes.max,
		);
		assert.strictEqual(
			fit(Array<string>(400).fill('x'), 0.6, 100, 100, true),
			sizes.min,
		);
	});

	test('rows centre and words move whole', function (assert) {
		const one = frames(Array.from('abc'), 100, 0.6, 720, false);
		assert.strictEqual(one.length, 3);
		assert.strictEqual(one[0]?.x, 252);
		assert.true(one.every((f) => f.y === 0));
		assert.deepEqual(wrap(Array.from('ab cde'), 4), [3, 3]);
		assert.deepEqual(wrap(Array.from('abcdefg'), 4), [4, 3]);
		assert.deepEqual(wrap(Array.from('a bcdefg'), 4), [4, 4]);
		assert.deepEqual(wrap(Array.from('abcd ef'), 4), [4, 3]);
	});

	test('the marquee holds three characters at least', function (assert) {
		const band = { width: 300, height: 600 };
		assert.strictEqual(marqueeSize(band, 0.5, undefined), 200);
		assert.strictEqual(marqueeSize(band, 0.5, 80), 80);
		assert.strictEqual(marqueeSize(band, 0.5, 360), 200);
	});
});
