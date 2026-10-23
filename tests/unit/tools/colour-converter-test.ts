import { module, test } from 'qunit';
import { hex, parseHex } from 'delphicanon/lib/colour';
import { solidSpaces, type SolidSpace } from 'delphicanon/lib/colour-space';
import {
	colourOf,
	decimalRgb,
	fixed,
	format,
	pointOf,
	read,
	valuesAt,
	valuesOf,
} from 'delphitools-v2/components/tools/colour-converter/notation';

const blue = parseHex('3B82F6')!;

const hexOf = (text: string, space: SolidSpace) => {
	const values = read(text, space);
	return values && hex(colourOf(values, space));
};

module('Unit | Tool | colour-converter', function () {
	test('formats with the web decimals', function (assert) {
		assert.strictEqual(
			format(valuesOf(blue, 'rgb'), 'rgb'),
			'rgb(59, 130, 246)',
		);
		assert.strictEqual(
			format(valuesOf(blue, 'hsl'), 'hsl'),
			'hsl(217.2, 91.2%, 59.8%)',
		);
		assert.strictEqual(
			format(valuesOf(blue, 'cmyk'), 'cmyk'),
			'cmyk(76%, 47%, 0%, 4%)',
		);
		assert.strictEqual(
			decimalRgb([1, 0, 0]),
			'rgb(1.0000, 0.0000, 0.0000)',
		);
		assert.strictEqual(fixed(-0.00001, 2), '0.00');
	});

	test('reads hex, names, functions and bare numbers', function (assert) {
		assert.strictEqual(hexOf('59 130 246', 'rgb'), '#3B82F6');
		assert.strictEqual(hexOf('59, 130, 246', 'rgb'), '#3B82F6');
		assert.strictEqual(
			hexOf('rgb(59 130 246 / 50%)', 'oklch'),
			'#3B82F6',
		);
		assert.strictEqual(
			hexOf('0.2314, 0.5098, 0.9647', 'rgb'),
			'#3B82F6',
		);
		assert.strictEqual(hexOf('#3b82f6', 'lab'), '#3B82F6');
		assert.strictEqual(hexOf('3b82f6', 'hsl'), '#3B82F6');
		assert.strictEqual(hexOf('tomato', 'rgb'), '#FF6347');
		assert.strictEqual(
			hexOf('oklch(62.31% 0.188 259.8)', 'rgb'),
			hexOf('0,6231 0,188 259,8', 'oklch'),
		);
		assert.strictEqual(
			hexOf('cmyk(76%, 47%, 0%, 4%)', 'rgb'),
			hexOf('76 47 0 4', 'cmyk'),
		);
		assert.strictEqual(
			hexOf('hsv(30 80% 90%)', 'rgb'),
			hexOf('30 80 90', 'hsb'),
		);
	});

	test('wraps hues', function (assert) {
		assert.strictEqual(
			hexOf('hsl(390 100% 50%)', 'rgb'),
			hexOf('hsl(30 100% 50%)', 'rgb'),
		);
		assert.strictEqual(
			hexOf('-330 100 50', 'hsl'),
			hexOf('30 100 50', 'hsl'),
		);
		assert.strictEqual(read('hsl(390 100% 50%)', 'hsl')?.[0], 30);
	});

	test('rejects what it cannot read', function (assert) {
		for (const junk of [
			'12 34',
			'nan 1 1',
			'banana',
			'',
			'rgb()',
			'% 1 2',
		])
			assert.strictEqual(read(junk, 'rgb'), undefined, junk);
	});

	test('round-trips every space', function (assert) {
		// cmyk rounds to percents
		for (const space of solidSpaces.filter((s) => s !== 'cmyk')) {
			const values = valuesOf(blue, space);
			assert.strictEqual(
				hexOf(format(values, space), space),
				'#3B82F6',
				space,
			);
		}
		for (const space of solidSpaces) {
			const values = valuesOf(blue, space);
			const back = valuesAt(pointOf(values, space), space);
			assert.true(
				back.every(
					(v, i) =>
						Math.abs(v - values[i]!) < 1e-6,
				),
				`${space} point`,
			);
		}
	});
});
