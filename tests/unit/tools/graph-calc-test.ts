import { module, test } from 'qunit';
import { compile } from 'mathjs';
import { Expression, type Key } from 'delphicanon/lib/math/expression';
import { pages } from 'delphicanon/lib/math/keypad';
import { parse } from 'delphicanon/lib/math/node';
import {
	blend,
	createEvaluator,
	curveName,
	decimal,
	format,
	loadMathjs,
	minorDivisions,
	niceCeil,
	niceFloor,
	nextColour,
	number,
	plotted,
	resized,
	rowX,
	runs,
	spread,
	square,
	standard,
	stepStep,
	stepTrace,
	tickLabel,
	ticks,
	typed,
	zoomed,
} from 'delphitools-v2/components/tools/graph-calc/graph';

const samples = [-2.5, -1, -0.5, 0, 0.5, 1.7, 3];

function same(a: number, b: number) {
	return (
		(Number.isNaN(a) && Number.isNaN(b)) ||
		a === b ||
		Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a))
	);
}

function plot(text: string, x: number) {
	const source = plotted(text);
	return source ? (createEvaluator(source)?.(x) ?? NaN) : NaN;
}

function type(keys: Key[]) {
	const expression = new Expression('', 'x');
	for (const key of keys) expression.apply(key);
	return expression.text;
}

const sym = (symbol: string): Key => ({ kind: 'symbol', symbol });
const x = sym('x');
const d = (digit: number) => sym(String(digit));
const right: Key = { kind: 'right' };
const fn = (name: string, arity = 1): Key => ({
	kind: 'function',
	name,
	arity,
});

type Expectation =
	{ plots: Key[]; is: (x: number) => number } | { rejects: Key[] };

const unary: Record<string, (x: number) => number> = {
	sin: Math.sin,
	cos: Math.cos,
	tan: Math.tan,
	asin: Math.asin,
	acos: Math.acos,
	atan: Math.atan,
	log: Math.log,
	log10: Math.log10,
	sec: (v) => 1 / Math.cos(v),
	csc: (v) => 1 / Math.sin(v),
	cot: (v) => Math.cos(v) / Math.sin(v),
	asec: (v) => Math.acos(1 / v),
	acsc: (v) => Math.asin(1 / v),
	acot: (v) => Math.PI / 2 - Math.atan(v),
	sinh: Math.sinh,
	cosh: Math.cosh,
	tanh: Math.tanh,
	asinh: Math.asinh,
	acosh: Math.acosh,
	atanh: Math.atanh,
	round: (v) => Math.sign(v) * Math.round(Math.abs(v)),
};

/** What the graph does with each keypad key (GraphCalcKeypadChecks). */
function expectation(key: Key): Expectation | undefined {
	switch (key.kind) {
		case 'symbol': {
			const s = key.symbol;
			if (/^\d$/.test(s))
				return {
					plots: [key, x],
					is: (v) => Number(s) * v,
				};
			if (s === '.')
				return {
					plots: [d(1), key, d(5), x],
					is: (v) => 1.5 * v,
				};
			if (s === '+')
				return {
					plots: [x, key, d(2)],
					is: (v) => v + 2,
				};
			if (s === '−')
				return {
					plots: [x, key, d(3)],
					is: (v) => v - 3,
				};
			if (s === '×')
				return {
					plots: [x, key, d(3)],
					is: (v) => v * 3,
				};
			if (s === 'x') return { plots: [key], is: (v) => v };
			if (s === 'π')
				return {
					plots: [key, x],
					is: (v) => Math.PI * v,
				};
			if (s === 'e')
				return {
					plots: [d(2), key, x],
					is: (v) => 2 * Math.E * v,
				};
			return {
				rejects:
					s === '!'
						? [x, key]
						: [x, sym('+'), key],
			};
		}
		case 'fraction':
			return {
				plots: [
					key,
					x,
					sym('+'),
					d(1),
					{ kind: 'down' },
					d(2),
				],
				is: (v) => (v + 1) / 2,
			};
		case 'divide':
			return {
				plots: [d(1), sym('+'), x, key, d(2)],
				is: (v) => 1 + v / 2,
			};
		case 'open':
			return {
				plots: [
					d(2),
					key,
					x,
					sym('+'),
					d(1),
					{ kind: 'close' },
				],
				is: (v) => 2 * (v + 1),
			};
		case 'square':
			return { plots: [sym('−'), x, key], is: (v) => -v * v };
		case 'cube':
			return { plots: [x, key], is: (v) => v * v * v };
		case 'inverse':
			return { plots: [x, key], is: (v) => 1 / v };
		case 'power':
			return { plots: [d(2), key, x], is: (v) => 2 ** v };
		case 'root':
			return { plots: [key, x], is: Math.sqrt };
		case 'cubeRoot':
			return { plots: [key, x], is: Math.cbrt };
		case 'nthRoot':
			return {
				plots: [key, d(5), right, x],
				is: (v) => (v < 0 ? -((-v) ** 0.2) : v ** 0.2),
			};
		case 'logBase':
			return { plots: [key, d(2), right, x], is: Math.log2 };
		case 'exponential':
			return {
				plots: [key, x],
				is:
					key.base === 'e'
						? Math.exp
						: (v) => 10 ** v,
			};
		case 'fence':
			if (key.fence === 'abs')
				return {
					plots: [key, x, sym('−'), d(1)],
					is: (v) => Math.abs(v - 1),
				};
			return {
				plots: [key, x],
				is:
					key.fence === 'floor'
						? Math.floor
						: Math.ceil,
			};
		case 'function': {
			const reference = unary[key.name];
			if (reference)
				return { plots: [key, x], is: reference };
			if (key.name === 'mod')
				return {
					plots: [key, x, right, d(3)],
					is: (v) => v % 3,
				};
			if (key.name === 'min')
				return {
					plots: [key, x, right, d(1)],
					is: (v) => Math.min(v, 1),
				};
			if (key.name === 'max')
				return {
					plots: [key, x, right, d(1)],
					is: (v) => Math.max(v, 1),
				};
			if (key.name === 'gcd' || key.name === 'lcm')
				return { rejects: [key] };
			return undefined;
		}
		case 'series':
		case 'integral':
		case 'derivative':
		case 'limit':
		case 'binomial':
		case 'permutation':
			return { rejects: [key] };
		default:
			return undefined;
	}
}

/** Typed from empty, every slot filled with x. */
function filled(keys: Key[]) {
	const expression = new Expression('', 'x');
	for (const key of keys) expression.apply(key);
	for (let i = 0; i < 6; i++) {
		expression.apply(x);
		expression.apply(right);
	}
	return expression.text;
}

module('Unit | Tool | graph-calc', function (hooks) {
	hooks.before(async function () {
		await loadMathjs();
	});

	test('steps, ticks and labels (GraphPlot.selfCheck)', function (assert) {
		assert.strictEqual(niceCeil(0.3), 0.5);
		assert.strictEqual(niceCeil(1), 1);
		assert.strictEqual(niceCeil(7), 10);
		assert.strictEqual(niceCeil(2.0002), 5);
		assert.strictEqual(niceFloor(0.9999), 0.5);
		assert.strictEqual(niceFloor(0.5), 0.5);
		assert.true(Math.abs(niceFloor(0.49) - 0.2) < 1e-12);
		assert.strictEqual(minorDivisions(2), 4);
		assert.strictEqual(minorDivisions(0.5), 5);
		assert.strictEqual(minorDivisions(10), 5);
		assert.deepEqual(ticks(-10, 10, 5), [-2, -1, 0, 1, 2]);
		assert.deepEqual(ticks(0.1, 0.9, 1), []);
		assert.strictEqual(tickLabel(3, 0.1), '0.3');
		assert.strictEqual(tickLabel(-4, 0.05), '−0.2');
		assert.strictEqual(tickLabel(-2, 5), '−10');
	});

	test('values for tags and the table', function (assert) {
		assert.strictEqual(format(2.25), '2.25');
		assert.strictEqual(format(1 / 3), '0.3333');
		assert.strictEqual(format(-0.00001), '−1E−5');
		assert.strictEqual(format(NaN), '—');
		assert.notStrictEqual(format(-0.00004), '−0');
		assert.strictEqual(format(12), '12');
		assert.strictEqual(format(1234567891), '1.235E9');
	});

	test('typed numbers', function (assert) {
		assert.strictEqual(number('1,5'), 1.5);
		assert.strictEqual(number('−2'), -2);
		assert.true(Math.abs(number('pi/2')! - Math.PI / 2) < 1e-12);
		assert.true(Math.abs(number('-2e')! + 2 * Math.E) < 1e-12);
		assert.strictEqual(number('2x'), undefined);
		assert.strictEqual(number(''), undefined);
		assert.strictEqual(number('max(1,2)'), 2);
	});

	test('runs split at asymptotes', function (assert) {
		const tan = runs(
			400,
			0,
			400,
			8,
			(px) => -Math.PI + (px / 400) * 2 * Math.PI,
			(v) => -v,
			[-1e4, 1e4],
			Math.tan,
		);
		assert.strictEqual(tan.length, 3);
		const parabola = runs(
			100,
			0,
			100,
			20,
			(px) => px / 10 - 5,
			(v) => v,
			[-1e4, 1e4],
			(v) => v * v,
		);
		assert.strictEqual(parabola.length, 1);
		assert.strictEqual(parabola[0]!.length, 101);
	});

	test('planes', function (assert) {
		assert.deepEqual(
			resized(
				standard,
				{ width: 400, height: 400 },
				{ width: 400, height: 200 },
			),
			{ xMin: -10, xMax: 10, yMin: -5, yMax: 5 },
		);
		assert.deepEqual(zoomed(standard, 0.5, 10, 0), {
			xMin: 0,
			xMax: 10,
			yMin: -5,
			yMax: 5,
		});
		assert.deepEqual(blend(standard, decimal, 1), decimal);
		assert.deepEqual(blend(standard, decimal, 0), standard);
		assert.deepEqual(square({ width: 200, height: 100 }), {
			xMin: -10,
			xMax: 10,
			yMin: -5,
			yMax: 5,
		});
	});

	test('tags spread apart', function (assert) {
		assert.deepEqual(spread([50, 52, 200], 20, 300), [50, 70, 200]);
		assert.deepEqual(spread([295, 290], 20, 300), [300, 280]);
	});

	test('trace and step', function (assert) {
		assert.deepEqual(stepTrace(1, 1, 1), { x: 2, onGrid: true });
		assert.deepEqual(stepTrace(1.3, 1, 1), { x: 2, onGrid: false });
		assert.deepEqual(stepTrace(1.3, 1, -1), {
			x: 1,
			onGrid: false,
		});
		assert.strictEqual(stepStep(1, 1), 2);
		assert.strictEqual(stepStep(1, -1), 0.5);
		assert.strictEqual(stepStep(1e4, 1), 1e4);
		assert.strictEqual(rowX(0.1, 2, 0.1), 0.30000000000000004);
		assert.strictEqual(format(rowX(0.1, 2, 0.1)), '0.3');
		assert.strictEqual(nextColour([0, 2]), 1);
		assert.strictEqual(nextColour([0, 1, 2, 3, 4, 5, 6, 7, 0]), 1);
		assert.strictEqual(curveName(11), 'y₁₂');
	});

	test('examples round trip (GraphSyntax.selfCheck)', function (assert) {
		const scope = { log: Math.log10, ln: Math.log };
		for (const source of [
			'x^2',
			'2x + 1',
			'sin(x)*3',
			'sqrt(x)',
			'log(x)',
			'ln(x)',
			'abs(x-1)',
			'exp(x)',
			'tan(x)',
			'x^2/4',
			'1/x',
			'2pi x',
			'e^x',
			'asin(x/2)+floor(x)',
		]) {
			const keypad = new Expression(typed(source), 'x').text;
			assert.notStrictEqual(
				plotted(keypad),
				undefined,
				source,
			);
			const reference = compile(source);
			for (const v of [-2.5, 0.5, 1.7, 3]) {
				const want = reference.evaluate({
					x: v,
					...scope,
				}) as unknown;
				assert.true(
					same(
						plot(keypad, v),
						typeof want === 'number'
							? want
							: NaN,
					),
					`${source} at ${v} via ${keypad}`,
				);
			}
		}
		assert.strictEqual(typed('log(x)+ln(x)'), 'log10(x)+log(x)');
		assert.strictEqual(typed('sec(x)+2ln(x)'), 'sec(x)+2*log(x)');
		assert.true(same(plot('nthroot(8,3)', 0), 2));
		assert.strictEqual(plot('-x^2', 2), -4);
		for (const text of [
			'x^',
			'y+1',
			'diff(x^2,x)',
			'',
			'1.2.3x',
			'.',
		])
			assert.strictEqual(plotted(text), undefined, text);
	});

	test('every keypad key plots or is rejected', function (assert) {
		const keys = pages('x').flatMap((page) =>
			page.flatMap((spec) => spec.menu?.keys ?? [spec.key]),
		);
		assert.true(keys.length > 60, `${keys.length} keys`);
		const failures: string[] = [];
		for (const key of keys) {
			const expected = expectation(key);
			if (!expected) {
				failures.push(
					`no expectation for ${JSON.stringify(key)}`,
				);
			} else if ('rejects' in expected) {
				const text = filled(expected.rejects);
				if (!parse(text) || plotted(text) !== undefined)
					failures.push(
						`${text} is not rejected`,
					);
			} else {
				const text = type(expected.plots);
				const reread = new Expression(text, 'x').text;
				for (const shown of [text, reread])
					if (
						!samples.every((v) =>
							same(
								plot(shown, v),
								expected.is(v),
							),
						)
					)
						failures.push(
							`${shown} does not match`,
						);
			}
		}
		assert.deepEqual(failures, []);
	});

	test('domains', function (assert) {
		for (const name of ['sec', 'csc', 'cot', 'tan']) {
			const text = type([fn(name), x]);
			const found = runs(
				400,
				0,
				400,
				8,
				(px) =>
					-Math.PI +
					0.001 +
					(px / 400) * (2 * Math.PI - 0.002),
				(v) => -v,
				[-1e4, 1e4],
				(v) => plot(text, v),
			);
			assert.strictEqual(
				found.length,
				name === 'sec' || name === 'tan' ? 3 : 2,
				name,
			);
		}
		assert.true(
			same(plot(type([fn('log'), x]), 100), Math.log(100)),
		);
		assert.true(same(plot(type([fn('log10'), x]), 100), 2));
		assert.true(
			same(
				plot(
					type([
						{ kind: 'logBase' },
						d(2),
						right,
						x,
					]),
					8,
				),
				3,
			),
		);
		assert.true(
			same(plot(type([{ kind: 'cubeRoot' }, x]), -8), -2),
		);
		assert.true(
			same(
				plot(
					type([
						{ kind: 'nthRoot' },
						d(5),
						right,
						x,
					]),
					-32,
				),
				-2,
			),
		);
		assert.true(
			Number.isNaN(
				plot(
					type([
						{ kind: 'nthRoot' },
						d(4),
						right,
						x,
					]),
					-16,
				),
			),
		);
		assert.true(same(plot(type([d(2), sym('π')]), 0), 2 * Math.PI));
		assert.true(
			same(
				plot(type([d(3), x, fn('sin'), x]), 2),
				6 * Math.sin(2),
			),
		);
		assert.true(
			same(
				plot(
					type([
						x,
						{ kind: 'power' },
						sym('−'),
						d(2),
					]),
					2,
				),
				0.25,
			),
		);
	});
});
