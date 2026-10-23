import { module, test } from 'qunit';
import {
	angleOf,
	band,
	clampLevels,
	countLuminance,
	duotoneExponent,
	fillSpan,
	formatValue,
	gammaAt,
	gammaOutput,
	gammaPosition,
	glowOpacity,
	grain,
	histogramPath,
	hueAt,
	normalised,
	padRange,
	rotateHue,
	rotation,
	sampleColour,
	signed,
	trackStops,
	vignetteMidpoint,
	vignettePixels,
	type Levels,
} from 'delphitools-v2/components/substrata/panels/fx/fx-maths';

const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;

module('Unit | Substrata | fx-maths', function () {
	test('formatValue follows the web readout', function (assert) {
		assert.strictEqual(
			formatValue(2.5, { step: 0.5, unit: 'px' }),
			'2.5 px',
		);
		assert.strictEqual(formatValue(1, { step: 0.01 }), '1.00');
		assert.strictEqual(
			formatValue(40, { step: 1, unit: '%' }),
			'40%',
		);
		assert.strictEqual(signed('60', 60), '+60');
		assert.strictEqual(signed('-60', -60), '-60');
	});

	test('levels keep the ends apart', function (assert) {
		const v: Levels = {
			inBlack: 0,
			inWhite: 255,
			gamma: 1,
			outBlack: 0,
			outWhite: 255,
		};
		assert.strictEqual(
			clampLevels({ ...v, inBlack: 400 }, 'inBlack').inBlack,
			253,
		);
		assert.strictEqual(
			clampLevels(
				{ ...v, inBlack: 50, inWhite: 10 },
				'inWhite',
			).inWhite,
			52,
		);
		assert.strictEqual(
			clampLevels({ ...v, gamma: 20 }, 'gamma').gamma,
			10,
		);
		assert.strictEqual(
			clampLevels({ ...v, outWhite: 0 }, 'outWhite').outWhite,
			1,
		);
	});

	test('the gamma handle round-trips', function (assert) {
		for (const g of [0.1, 0.5, 1, 2.2, 10]) {
			const at = gammaPosition(g, 10, 240);
			assert.true(
				near(gammaAt(at, 10, 240), g, 0.005),
				`gamma ${g}`,
			);
		}
		assert.strictEqual(gammaPosition(1, 0, 255), 127.5);
		assert.strictEqual(gammaAt(300, 0, 255), 0.1);
		assert.strictEqual(gammaAt(0, 0, 255), 10);
	});

	test('the histogram counts luma, weighted by alpha', function (assert) {
		const bins = countLuminance([
			255, 255, 255, 255, 0, 0, 0, 128, 9, 9, 9, 0,
		]);
		assert.strictEqual(bins[255], 1);
		assert.true(near(bins[0]!, 128 / 255));
		assert.strictEqual(bins[9], 0);
		const n = normalised([5, 1, 2, 9]);
		assert.deepEqual(n, [1, 0.5, 1, 1]);
		assert.strictEqual(histogramPath([0, 0], 10, 10), null);
		assert.true(
			histogramPath([0, 1, 0.5], 30, 10)!.startsWith('M0 10'),
		);
	});

	test('posterise bands halve the ends', function (assert) {
		assert.deepEqual(band(0, 2), { from: 0, to: 0.5, grey: 0 });
		assert.deepEqual(band(1, 2), { from: 0.5, to: 1, grey: 1 });
		const middle = band(2, 6);
		assert.true(near(middle.to - middle.from, 0.2));
		assert.true(near(band(0, 6).to, 0.1));
	});

	test('colour samples move the right way', function (assert) {
		const warm = sampleColour('temperature', 'amount', 100)!;
		const cool = sampleColour('temperature', 'amount', -100)!;
		assert.true(warm[0] > warm[2]);
		assert.true(cool[2] > cool[0]);
		const grey = sampleColour('saturation', 'amount', -100)!;
		assert.strictEqual(grey[0], grey[1]);
		assert.strictEqual(grey[1], grey[2]);
		assert.true(
			sampleColour('colour-balance', 'yellowBlue', 100)![2] >
				0.5,
		);
		assert.strictEqual(
			sampleColour('contrast', 'amount', 100),
			null,
		);
		assert.strictEqual(
			trackStops('brightness', 'amount')!.length,
			9,
		);
		assert.deepEqual(fillSpan(0.5, 0.25), [0.25, 0.5]);
	});

	test('hue and gamma maths', function (assert) {
		const green = rotateHue([1, 0, 0], 120);
		assert.true(near(green[0], 0));
		assert.true(near(green[1], 1));
		assert.true(near(green[2], 0));
		assert.deepEqual(hueAt(0), [1, 0, 0]);
		assert.strictEqual(rotation(0, 50, 200), -90);
		assert.strictEqual(gammaOutput(0.25, 2), 0.5);
	});

	test('effects and stylise maths', function (assert) {
		assert.strictEqual(padRange(8, 8, 24, 0), 32);
		assert.strictEqual(padRange(-300, 0, 0, 0), 512);
		assert.strictEqual(padRange(5000, 0, 0, 0), 768);
		assert.strictEqual(angleOf(8, 8), 315);
		assert.strictEqual(angleOf(0, -5), 90);
		assert.strictEqual(angleOf(0, 0), 0);
		assert.strictEqual(glowOpacity(50), 0.75);
		assert.true(near(Math.pow(0.3, duotoneExponent(30)), 0.5));
		assert.strictEqual(vignetteMidpoint(0.355, 0, 1), 50);
		const bare = vignettePixels(6, 4, {
			amount: 0,
			midpoint: 0,
			roundness: 1,
			feather: 0,
			colour: [1, 0, 0],
		});
		assert.true(
			bare.every((v, i) =>
				i % 4 === 3 ? v === 255 : v === 153,
			),
		);
		const full = vignettePixels(30, 20, {
			amount: 1,
			midpoint: 0.5,
			roundness: 0,
			feather: 0.5,
			colour: [0, 0, 0],
		});
		assert.strictEqual(full[0], 0);
		assert.strictEqual(full[(10 * 30 + 15) * 4], 153);
		const spread = (amount: number) => {
			const g = grain(8, amount, false);
			let most = 0;
			for (let i = 0; i < 64; i++)
				most = Math.max(
					most,
					Math.abs(g[i * 4]! - 128),
				);
			return most;
		};
		assert.true(spread(0) <= 1);
		assert.true(spread(1) > 100);
	});
});
