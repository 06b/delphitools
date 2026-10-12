import { module, test } from 'qunit';
import { fromOklch, oklch, parseHex } from 'delphicanon/lib/colour';
import {
	colourIn,
	harmony,
	labels,
	maxRadius,
	modes,
	monochromatic,
	partsOf,
	wheelSpaces,
} from 'delphitools-v2/components/tools/harmony-genny/harmony';

const blue = parseHex('3B82F6')!;
const near = (a: readonly number[], b: readonly number[], by = 0.002) =>
	a.every((v, i) => Math.abs(v - b[i]!) < by);
const triadic = modes.findIndex((m) => m.title === 'Triadic');

module('Unit | Tool | harmony-genny', function () {
	test('parts round-trip and sit inside the gamut', function (assert) {
		for (const space of wheelSpaces) {
			const parts = partsOf(space, blue);
			assert.true(
				near(
					colourIn(
						space,
						parts.l,
						parts.r,
						parts.h,
					),
					blue,
				),
				space,
			);
			assert.true(
				parts.r <=
					maxRadius(space, parts.l, parts.h) +
						0.002,
				`${space} in gamut`,
			);
			const turned = partsOf(
				space,
				harmony(space, parts, triadic)[1]!,
			).h;
			assert.true(
				Math.abs(turned - ((parts.h + 120) % 360)) < 1,
				`${space} triad turns 120°`,
			);
		}
	});

	test('the OKLCH harmony turns the hue alone', function (assert) {
		const [, complement] = harmony(
			'oklch',
			{ l: 0.6, r: 0.1 / 0.33, h: 40 },
			0,
		);
		assert.true(near(complement!, fromOklch(0.6, 0.1, 220), 1e-9));
	});

	test('monochromatic softens chroma past 0.6', function (assert) {
		const teal = fromOklch(0.5, 0.05, 200);
		const mono = harmony(
			'oklch',
			partsOf('oklch', teal),
			monochromatic,
		);
		assert.strictEqual(mono.length, 5);
		assert.true(Math.abs(oklch(mono[0]!)[1] - 0.035) < 0.002);
		assert.true(Math.abs(oklch(mono[3]!)[1] - 0.05) < 0.002);
		assert.true(near(mono[2]!, teal));
	});

	test('LCH reach shrinks towards white', function (assert) {
		assert.true(maxRadius('lch', 0.5, 40) * 134 > 60);
		assert.true(maxRadius('lch', 0.99, 40) * 134 < 10);
	});

	test('labels name the base and the offsets', function (assert) {
		const analogous = modes.findIndex(
			(m) => m.title === 'Analogous',
		);
		const parts = partsOf('oklch', blue);
		assert.deepEqual(
			labels(
				'oklch',
				analogous,
				harmony('oklch', parts, analogous),
			),
			['−30°', 'Base', '+30°'],
		);
		const golden = modes.findIndex(
			(m) => m.title === 'Golden Ratio',
		);
		assert.deepEqual(
			labels(
				'oklch',
				golden,
				harmony('oklch', parts, golden),
			),
			['Base', '+137.5°', '+275°'],
		);
	});
});
