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
	text,
	toggledSign,
	typed,
	written,
	type AngleMode,
} from 'delphitools-v2/components/tools/sci-calc/entry';

const plain = (raw: string) =>
	pieces(raw)
		.map((p) => p.text)
		.join('');

/** The expression a run of key presses builds. */
const keys = (...pressed: string[]) =>
	pressed.reduce(
		(expression, key) => join(expression, text(key), kind(key)),
		'',
	);

/** What = puts on the display, as SciCalcTool.evaluate does. */
function shown(raw: string, mode: AngleMode = 'deg'): string {
	const value = calculate(math, raw + ')'.repeat(openParens(raw)), mode);
	if (value === undefined) return 'Error';
	if (typeof value === 'string') return value;
	if (Number.isNaN(value)) return 'Error';
	if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
	return formatNumber(value);
}

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

	test('evaluator: precedence and associativity', function (assert) {
		assert.strictEqual(shown('2+3×4'), '14');
		assert.strictEqual(shown('(2+3)×4'), '20');
		assert.strictEqual(shown('8÷2×4'), '16');
		assert.strictEqual(shown('8−2−1'), '5');
		assert.strictEqual(shown('2^3^2'), '512');
		assert.strictEqual(shown('2^−2^2'), '0.0625');
		assert.strictEqual(shown('2×3^2'), '18');
		assert.strictEqual(shown('2^2!'), '4');
		assert.strictEqual(shown('2×7%4'), '2');
		assert.strictEqual(shown('2%3^2'), '2');
	});

	test('evaluator: unary minus', function (assert) {
		assert.strictEqual(shown('−2^2'), '-4');
		assert.strictEqual(shown('(−2)^2'), '4');
		assert.strictEqual(shown('3×−2'), '-6');
		assert.strictEqual(shown('2^−1'), '0.5');
		assert.strictEqual(shown('−(3+1)'), '-4');
		assert.strictEqual(shown('1.5e−3'), '0.0015');
	});

	test('evaluator: implicit multiplication from key presses', function (assert) {
		assert.strictEqual(keys('2', 'π'), '2×π');
		assert.strictEqual(shown(keys('2', 'π'), 'rad'), '6.283185307');
		assert.strictEqual(keys('2', '(', '3', ')', '4'), '2×(3)×4');
		assert.strictEqual(shown(keys('2', '(', '3', ')', '4')), '24');
		assert.strictEqual(keys('3', '!', '2'), '3!×2');
		assert.strictEqual(shown(keys('3', '!', '2')), '12');
		assert.strictEqual(keys('2', 'sin', '30'), '2×sin(30');
		assert.strictEqual(shown(keys('2', 'sin', '30')), '1');
		assert.strictEqual(keys('2', 'EE', '3'), '2e3');
		assert.strictEqual(shown(keys('2', 'EE', '3')), '2000');
		assert.strictEqual(keys('2', 'eˣ', '2'), '2×e^2');
		assert.strictEqual(shown(keys('2', 'eˣ', '2')), '14.7781122');
		assert.strictEqual(shown('2(3)'), '6');
	});

	test('evaluator: powers, roots, logs and constants', function (assert) {
		assert.strictEqual(shown(keys('3', 'x²')), '9');
		assert.strictEqual(shown(keys('10ˣ', '−', '3')), '0.001');
		assert.strictEqual(shown('2^0.5'), '1.414213562');
		assert.strictEqual(shown('sqrt(2)×sqrt(2)'), '2');
		assert.strictEqual(shown('sqrt(2)^2'), '2');
		assert.strictEqual(shown('root(3,27'), '3');
		assert.strictEqual(shown('root(4,16'), '2');
		assert.strictEqual(shown('log(1000'), '3');
		assert.strictEqual(shown('ln(e^3'), '3');
		assert.strictEqual(shown('e^1'), '2.718281828');
		assert.strictEqual(shown('π'), '3.141592654');
		assert.strictEqual(shown('e'), '2.718281828');
		assert.strictEqual(shown('|−3|+|4|'), '7');
		assert.strictEqual(shown('|−2.5|'), '2.5');
	});

	test('evaluator: factorial', function (assert) {
		assert.strictEqual(shown('0!'), '1');
		assert.strictEqual(shown('5!'), '120');
		assert.strictEqual(shown('3!!'), '720');
		assert.strictEqual(shown('170!'), '7.25742e+306');
		assert.strictEqual(shown('171!'), '∞');
		assert.strictEqual(shown('(−1)!'), 'Error');
		// mathjs extends factorial with gamma; iOS gives an error
		assert.strictEqual(shown('0.5!'), '0.8862269255');
	});

	test('evaluator: trig in degrees and radians', function (assert) {
		assert.strictEqual(shown('sin(30'), '0.5');
		assert.strictEqual(shown('sin(45'), '0.7071067812');
		assert.strictEqual(shown('sin(90'), '1');
		assert.strictEqual(shown('sin(270'), '-1');
		assert.strictEqual(shown('cos(60'), '0.5');
		assert.strictEqual(shown('cos(180'), '-1');
		assert.strictEqual(shown('tan(135'), '-1');
		assert.strictEqual(shown('tan(90'), '∞');
		assert.strictEqual(shown('sin(π÷6', 'rad'), '0.5');
		assert.strictEqual(shown('cos(π÷2', 'rad'), '0');
		assert.strictEqual(shown('tan(π÷4', 'rad'), '1');
		assert.strictEqual(shown('sin(30', 'rad'), '-0.9880316241');
	});

	test('evaluator: inverse trig', function (assert) {
		assert.strictEqual(shown('asin(1'), '90');
		assert.strictEqual(shown('acos(0.5'), '60');
		assert.strictEqual(shown('atan(1'), '45');
		assert.strictEqual(shown('asin(1', 'rad'), '1.570796327');
		assert.strictEqual(shown('acos(−1', 'rad'), '3.141592654');
		assert.strictEqual(shown('asin(2'), 'Error');
	});

	test('evaluator: mod', function (assert) {
		assert.strictEqual(shown('7%3'), '1');
		assert.strictEqual(shown('5.5%2'), '1.5');
		// floored, as mathjs mod; iOS truncates to −1
		assert.strictEqual(shown('−7%3'), '2');
		assert.strictEqual(shown('7%'), 'Error');
	});

	test('display: floating point and rounding', function (assert) {
		assert.strictEqual(shown('0.1+0.2'), '0.3');
		assert.strictEqual(shown('1÷3'), '0.3333333333');
		assert.strictEqual(shown('2÷3'), '0.6666666667');
		assert.strictEqual(shown('1÷7'), '0.1428571429');
		assert.strictEqual(shown('9.99999999995'), '10');
		assert.strictEqual(shown('0.12345678905'), '0.1234567891');
		assert.strictEqual(shown('100000×100000'), '1e+10');
		assert.strictEqual(shown('123456789012'), '1.23456789e+11');
		assert.strictEqual(shown('999999999999999'), '1e+15');
		assert.strictEqual(shown('1e15+1'), '1e+15');
		assert.strictEqual(shown('6.02214076e23×2'), '1.20443e+24');
		assert.strictEqual(shown('0.00001234'), '1.234e-05');
		assert.strictEqual(shown('1e−10'), '1e-10');
		assert.strictEqual(shown('−1e−11'), '-1e-11');
		assert.strictEqual(shown('1e−400'), '0');
		assert.strictEqual(shown('1e400'), '∞');
		assert.strictEqual(written(shown('1.5e15')), '1.5 × 10¹⁵');
	});

	test('evaluator: errors', function (assert) {
		assert.strictEqual(shown('1÷0'), '∞');
		assert.strictEqual(shown('−1÷0'), '-∞');
		assert.strictEqual(shown('0÷0'), 'Error');
		assert.strictEqual(shown('log(0'), '-∞');
		assert.strictEqual(shown('log(−1'), 'Error');
		assert.strictEqual(shown('ln(−1'), 'Error');
		assert.strictEqual(shown('sqrt(−4'), '2i');
		assert.strictEqual(shown('1+'), 'Error');
		assert.strictEqual(shown('×2'), 'Error');
	});

	test('evaluator: brackets', function (assert) {
		assert.strictEqual(shown('(1'), '1');
		assert.strictEqual(shown('2×(3+(4'), '14');
		assert.strictEqual(shown('1)'), 'Error');
		assert.strictEqual(shown('(1))'), 'Error');
		assert.strictEqual(shown('()'), 'Error');
	});

	test('answer recall: the formatted answer reads back as the same value', function (assert) {
		for (const answer of [1.5, -3, 1e20, -2e-11, 1 / 3]) {
			const recalled = formatNumber(answer);
			assert.strictEqual(
				shown(join('2', recalled, 'factor')),
				formatNumber(2 * Number(recalled)),
				recalled,
			);
		}
		assert.strictEqual(join('2', '-3', 'factor'), '2×-3');
		assert.strictEqual(
			shown(join('', '1e+20', 'factor') + '+1'),
			'1e+20',
		);
	});
});
