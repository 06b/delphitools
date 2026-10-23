import { module, test } from 'qunit';
import {
	bars,
	columnsFor,
	waveformSvg,
} from 'delphitools-v2/components/tools/waveform-genny/bars';

const peaks = (max: number[], min: number[]) => ({
	max: Float32Array.from(max),
	min: Float32Array.from(min),
});

module('Unit | Tool | waveform-genny', function () {
	test('columnsFor divides the width by the detail, at least 10', function (assert) {
		assert.strictEqual(columnsFor(1500, 2), 750);
		assert.strictEqual(columnsFor(1200, 8), 150);
		assert.strictEqual(columnsFor(100, 8), 13);
		assert.strictEqual(columnsFor(50, 8), 10);
	});

	test('bars span the column and the peak range', function (assert) {
		const [first, second] = bars(
			peaks([0.5, 0], [-0.5, 0]),
			200,
			100,
		);
		assert.deepEqual(first, {
			x: 0,
			y: 25,
			width: 100,
			height: 50,
		});
		assert.deepEqual(
			second,
			{ x: 100, y: 50, width: 100, height: 1 },
			'silence keeps a 1 px line',
		);
	});

	test('samples past ±1 and non-finite values stay inside the box', function (assert) {
		const [loud, broken] = bars(
			peaks([1.8, NaN], [-2.5, NaN]),
			20,
			100,
		);
		assert.deepEqual(loud, { x: 0, y: 0, width: 10, height: 100 });
		assert.strictEqual(broken!.y, 50);
	});

	test('no columns or no size draws nothing', function (assert) {
		assert.deepEqual(bars(peaks([], []), 100, 100), []);
		assert.deepEqual(bars(peaks([1], [-1]), 0, 100), []);
	});

	test('waveformSvg writes the background and one rect per column', function (assert) {
		const svg = waveformSvg(
			peaks([0.5, 0.25], [-0.5, -0.25]),
			40,
			20,
			'#2e7d32',
			'#faf5e6',
		);
		assert.true(
			svg.startsWith(
				'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20"><rect width="40" height="20" fill="#faf5e6"/><g fill="#2e7d32">',
			),
		);
		assert.true(
			svg.includes(
				'<rect x="0.00" y="5.00" width="20.00" height="10.00"/><rect x="20.00" y="7.50" width="20.00" height="5.00"/></g></svg>',
			),
		);
	});
});
