import { module, test } from 'qunit';
import * as math from 'mathjs';
import {
	arrangement,
	calculate,
	formatNumber,
	groupBreaks,
	join,
	kind,
	openParens,
	parts,
	pieces,
	printfG,
	sideBySide,
	toggledSign,
	typed,
	written,
} from 'delphitools-v2/components/tools/sci-calc/entry';

const plain = (raw: string) =>
	pieces(raw)
		.map((p) => p.text)
		.join('');

module('Unit | Tool | sci-calc', function () {
	test('join puts a times sign where two values meet', function (assert) {
		assert.strictEqual(join('2', 'π', 'factor'), '2×π');
		assert.strictEqual(join('2', 'sin(', 'factor'), '2×sin(');
		assert.strictEqual(join('(3)', '4', 'digit'), '(3)×4');
		assert.strictEqual(join('π', '2', 'digit'), 'π×2');
		assert.strictEqual(join('2e', '3', 'digit'), '2e3');
		assert.strictEqual(join('e', '2', 'digit'), 'e×2');
		assert.strictEqual(join('2+', 'π', 'factor'), '2+π');
		assert.strictEqual(join('12', '+', 'other'), '12+');
		assert.strictEqual(join('', 'π', 'factor'), 'π');
	});

	test('toggledSign changes the sign of the number being typed', function (assert) {
		assert.strictEqual(toggledSign('3+4'), '3-4');
		assert.strictEqual(toggledSign('3-4'), '3+4');
		assert.strictEqual(toggledSign('3×4'), '3×-4');
		assert.strictEqual(toggledSign('3×-4'), '3×4');
		assert.strictEqual(toggledSign('12'), '-12');
		assert.strictEqual(toggledSign('-12'), '12');
		assert.strictEqual(toggledSign('1.5e3'), '1.5e-3');
		assert.strictEqual(toggledSign('1.5e-3'), '1.5e3');
		assert.strictEqual(toggledSign('sin('), undefined);
	});

	test('brackets, kinds and typed keys', function (assert) {
		assert.strictEqual(openParens('sin(cos(4'), 2);
		assert.strictEqual(openParens('(1))'), 0);
		assert.strictEqual(kind('7'), 'digit');
		assert.strictEqual(kind('sin'), 'factor');
		assert.strictEqual(kind('+'), 'other');
		assert.strictEqual(typed('*'), '×');
		assert.strictEqual(typed('%'), 'mod');
		assert.strictEqual(typed('Enter'), '=');
		assert.strictEqual(typed('Escape'), 'C');
		assert.strictEqual(typed('q'), undefined);
	});

	test('numbers print as %g', function (assert) {
		assert.strictEqual(
			printfG(6.62607015e-34, 10),
			'6.62607015e-34',
		);
		assert.strictEqual(printfG(0.5, 10), '0.5');
		assert.strictEqual(printfG(1e12, 10), '1e+12');
		assert.strictEqual(formatNumber(0.49999999999999994), '0.5');
		assert.strictEqual(
			formatNumber(1234567891234567),
			'1.23457e+15',
		);
		assert.strictEqual(formatNumber(-2e-11), '-2e-11');
		assert.strictEqual(formatNumber(0), '0');
	});

	test('the display splits the exponent and groups thousands', function (assert) {
		assert.deepEqual(parts('1.234567891e+15'), {
			mantissa: '1.234567891',
			exponent: '15',
		});
		assert.deepEqual(parts('-2e-05'), {
			mantissa: '−2',
			exponent: '−5',
		});
		assert.deepEqual(parts('Error'), { mantissa: 'Error' });
		assert.deepEqual(groupBreaks('1234567.5'), [0, 3]);
		assert.deepEqual(groupBreaks('−12345'), [2]);
		assert.deepEqual(groupBreaks('1234'), []);
		assert.strictEqual(
			written('6.62607015e-34'),
			'6.62607015 × 10⁻³⁴',
		);
		assert.strictEqual(written('-9.80665'), '−9.80665');
	});

	test('the expression prints as a calculator shows it', function (assert) {
		assert.strictEqual(plain('sqrt(2)*3-1'), '√(2)×3−1');
		assert.strictEqual(plain('5%3'), '5 mod 3');
		assert.strictEqual(plain('root(3,8)'), 'ʸ√(3,8)');
		assert.strictEqual(plain('1.5e-3'), '1.5E−3');
		assert.deepEqual(pieces('2^10').at(-1), {
			text: '10',
			kind: 'number',
			raised: true,
		});
		assert.deepEqual(
			pieces('sin(π').map((p) => p.kind),
			['function', 'bracket', 'number'],
		);
	});

	test('the keypad: 5 by 9 when tall, 9 by 5 when wide, = spans two rows', function (assert) {
		assert.false(sideBySide(390, 500));
		assert.true(sideBySide(1000, 400));
		const equals = arrangement(false).find((k) => k.key === '=');
		assert.deepEqual(equals, {
			key: '=',
			row: 7,
			column: 4,
			rows: 2,
			columns: 1,
		});
		assert.strictEqual(arrangement(true).length, 44);
	});

	test('calculate reads the keypad text in degrees or radians', function (assert) {
		const at = (text: string, mode: 'deg' | 'rad' = 'deg') =>
			calculate(math, text, mode);
		assert.strictEqual(
			formatNumber(at('sin(30)') as number),
			'0.5',
		);
		assert.strictEqual(at('2×3−1'), 5);
		assert.strictEqual(at('log(100)'), 2);
		assert.strictEqual(formatNumber(at('ln(e)') as number), '1');
		assert.strictEqual(at('root(3,8)'), 2);
		assert.strictEqual(at('|−3|'), 3);
		assert.strictEqual(at('5!'), 120);
		assert.strictEqual(at('7%3'), 1);
		assert.strictEqual(
			formatNumber(at('2×π', 'rad') as number),
			'6.283185307',
		);
		assert.strictEqual(at('sqrt(−1)'), 'i');
		assert.strictEqual(at('2+'), undefined);
	});

	test('trig at whole angles, mod and odd roots of negatives', function (assert) {
		const at = (text: string, mode: 'deg' | 'rad' = 'deg') =>
			calculate(math, text, mode);
		assert.strictEqual(at('sin(180)'), 0);
		assert.strictEqual(at('cos(90)'), 0);
		assert.strictEqual(at('tan(45)'), 1);
		assert.strictEqual(at('tan(90)'), Infinity);
		assert.strictEqual(at('sin(π)', 'rad'), 0);
		assert.strictEqual(at('tan(π÷2)', 'rad'), Infinity);
		assert.strictEqual(at('7%'), undefined);
		assert.strictEqual(at('50%×2'), undefined);
		assert.strictEqual(at('50%+1'), 0);
		assert.strictEqual(at('root(3,−8)'), -2);
		assert.true(Number.isNaN(at('root(2,−4)')));
	});
});
