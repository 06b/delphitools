import { module, test } from 'qunit';
import {
	UNITS,
	formatValue,
	niceStep,
	nudged,
	span,
	subdivisions,
} from 'delphitools-v2/components/tools/typo-calc/units';

module('Unit | Tool | typo-calc', function () {
	test('conversions at CSS 96 ppi', function (assert) {
		assert.strictEqual(UNITS.pt.fromPx(16, 16), 12);
		assert.strictEqual(UNITS.pc.fromPx(16, 16), 1);
		assert.strictEqual(UNITS.in.toPx(1, 16), 96);
		assert.strictEqual(UNITS.rem.fromPx(24, 16), 1.5);
		assert.strictEqual(
			formatValue(UNITS.mm.fromPx(96, 16)),
			'25.4',
		);
	});

	test('a resolution changes the physical units only', function (assert) {
		assert.strictEqual(UNITS.in.toPx(1, 16, 300), 300);
		assert.strictEqual(UNITS.pt.fromPx(300, 16, 300), 72);
		assert.strictEqual(UNITS.em.fromPx(32, 16), 2);
	});

	test('formatValue keeps more places for small values', function (assert) {
		assert.strictEqual(formatValue(16), '16');
		assert.strictEqual(formatValue(1 / 6), '0.166667');
		assert.strictEqual(formatValue(16.888333), '16.8883');
		assert.strictEqual(formatValue(1234.567), '1234.57');
		assert.strictEqual(formatValue(0.0001), '0');
	});

	test('nudged lands on the unit step grid', function (assert) {
		assert.strictEqual(nudged(16, 'px', 1), 17);
		assert.strictEqual(nudged(1.3, 'in', 1), 1.375);
		assert.strictEqual(nudged(0.3, 'cm', 1), 0.4);
		assert.strictEqual(nudged(0, 'pt', -1), 0, 'never below 0');
		assert.strictEqual(nudged(undefined, 'pc', 1), 0.5);
	});

	test('the gauge zooms in 1-2-5 steps', function (assert) {
		assert.strictEqual(niceStep(0.3), 0.5);
		assert.strictEqual(niceStep(1), 1);
		assert.strictEqual(niceStep(1.1), 2);
		assert.strictEqual(niceStep(60), 100);
		assert.strictEqual(subdivisions(0.2), 4);
		assert.strictEqual(subdivisions(50), 5);
		assert.strictEqual(span(16), 20);
		assert.strictEqual(span(96), 200);
		assert.strictEqual(span(0), 2);
	});
});
