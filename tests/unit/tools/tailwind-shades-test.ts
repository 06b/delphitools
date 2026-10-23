import { module, test } from 'qunit';
import {
	cleanName,
	cssBlock,
	generateShades,
	GENERATION_MODES,
	place,
	tailwindBlock,
	targetLightness,
} from 'delphitools-v2/components/tools/tailwind-shades/shades';
import { colourFromQuery } from 'delphitools-v2/lib/colour-query';
import { maxOklchChroma } from 'delphitools-v2/lib/colour-maths';

const BASE = '#3b82f6';
const LEVELS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

module('Unit | Tool | tailwind-shades', function () {
	test('produces the Tailwind ramp in order', function (assert) {
		const shades = generateShades(BASE, 'classic');
		assert.deepEqual(
			shades?.map((s) => s.level),
			LEVELS,
		);
	});

	test('every shade is a six-digit hex', function (assert) {
		for (const mode of GENERATION_MODES) {
			const shades = generateShades(BASE, mode.value);
			assert.true(
				shades!.every((s) =>
					/^#[\da-f]{6}$/.test(s.hex),
				),
				`${mode.value}: ${shades!.map((s) => s.hex).join(' ')}`,
			);
		}
	});

	// lightness comes from scale
	test('lightness falls monotonically from 50 to 950', function (assert) {
		for (const mode of GENERATION_MODES) {
			const shades = generateShades(BASE, mode.value)!;
			const lightness = shades.map((s) => s.oklch[0]);
			const falling = lightness.every(
				(l, i) => i === 0 || l < lightness[i - 1]!,
			);
			assert.true(
				falling,
				`${mode.value}: ${lightness.map((l) => l.toFixed(2)).join(' ')}`,
			);
		}
	});

	test('hue-shift moves the hue across the ramp and classic does not', function (assert) {
		const hue = (mode: 'classic' | 'hue-shift') =>
			generateShades(BASE, mode)!.map((s) => s.oklch[2]);
		const classic = hue('classic');
		const shifted = hue('hue-shift');
		assert.true(
			classic.every((h) => Math.abs(h - classic[0]!) < 0.001),
			`classic holds one hue: ${classic[0]?.toFixed(1)}`,
		);
		assert.true(
			Math.max(...shifted) - Math.min(...shifted) > 1,
			`hue-shift spreads: ${(Math.max(...shifted) - Math.min(...shifted)).toFixed(1)} degrees`,
		);
	});

	test('vivid is more saturated than muted at every level', function (assert) {
		const vivid = generateShades(BASE, 'vivid')!;
		const muted = generateShades(BASE, 'muted')!;
		assert.true(
			vivid.every((s, i) => s.oklch[1] >= muted[i]!.oklch[1]),
			`vivid ${vivid[5]?.oklch[1].toFixed(3)} vs muted ${muted[5]?.oklch[1].toFixed(3)}`,
		);
	});

	// chroma not perceptually flat
	test('saturation rises to the middle of the ramp and falls away again', function (assert) {
		for (const mode of GENERATION_MODES) {
			for (const base of [
				'#3b82f6',
				'#4c798c',
				'#0ea5e9',
				'#e11d48',
			]) {
				const sat = generateShades(
					base,
					mode.value,
				)!.map(
					(s) =>
						s.oklch[1] /
						maxOklchChroma(
							s.oklch[0],
							s.oklch[2],
						),
				);
				const peak = sat.indexOf(Math.max(...sat));
				const steps = sat.map((s, i) =>
					i === 0 ? 0 : s - sat[i - 1]!,
				);
				const where = `${mode.value} ${base}: ${sat.map((s) => s.toFixed(2)).join(' ')}`;
				assert.true(
					steps.every((d, i) =>
						i <= peak
							? d >= -1e-6
							: d <= 1e-6,
					),
					where,
				);
				// old ramp worst step 0.53
				assert.true(
					Math.max(...steps.map(Math.abs)) < 0.25,
					where,
				);
			}
		}
	});

	test('every shade lands inside sRGB', function (assert) {
		for (const mode of GENERATION_MODES) {
			const shades = generateShades('#0ea5e9', mode.value)!;
			assert.true(
				shades.every(
					(s) =>
						s.oklch[1] <=
						maxOklchChroma(
							s.oklch[0],
							s.oklch[2],
						) +
							1e-6,
				),
				// feeds oklch css block
				`${mode.value}: ${shades.map((s) => s.oklch[1].toFixed(3)).join(' ')}`,
			);
		}
	});

	test('a grey base stays grey', function (assert) {
		const shades = generateShades('#808080', 'classic')!;
		assert.true(shades.every((s) => s.oklch[1] < 0.02));
	});

	test('rejects a base colour that does not parse', function (assert) {
		for (const junk of ['', 'zzz', '#fff', '#3b82f6ff']) {
			assert.strictEqual(
				generateShades(junk, 'classic'),
				null,
				JSON.stringify(junk),
			);
		}
	});

	module('share link', function () {
		test('accepts bare and hashed hex', function (assert) {
			assert.strictEqual(
				colourFromQuery('?color=3b82f6'),
				'#3b82f6',
			);
			assert.strictEqual(
				colourFromQuery('?color=%233b82f6'),
				'#3b82f6',
			);
		});

		test('rejects anything that is not six-digit hex', function (assert) {
			for (const junk of [
				'?color=fff',
				'?color=zzz',
				'?color=',
			]) {
				assert.strictEqual(
					colourFromQuery(junk),
					null,
					junk,
				);
			}
		});

		test('returns null without the param', function (assert) {
			assert.strictEqual(colourFromQuery(''), null);
			assert.strictEqual(colourFromQuery('?other=1'), null);
		});
	});

	test('places a lightness on the scale', function (assert) {
		assert.deepEqual(place(0.55, targetLightness), {
			index: 5,
			level: 500,
			nearest: 5,
		});
		assert.strictEqual(place(0.99, targetLightness).level, 50);
		assert.strictEqual(place(0.05, targetLightness).level, 950);
		const between = place(0.605, targetLightness);
		assert.true(Math.abs(between.index - 4.5) < 1e-9);
		assert.strictEqual(between.level, 450);
		assert.strictEqual(between.nearest, 5);
		assert.strictEqual(place(0.95, targetLightness).level, 80);
	});

	test('writes the blocks with the name and notation', function (assert) {
		const shades = generateShades(BASE, 'classic')!;
		const upper = (hex: string) => hex.toUpperCase();
		assert.true(
			cssBlock(shades, 'brand', upper).includes(
				`  --brand-500: ${upper(shades[5]!.hex)};`,
			),
		);
		assert.true(
			tailwindBlock(shades, 'brand', upper).startsWith(
				"brand: {\n      50: '#",
			),
		);
		assert.strictEqual(cleanName('Brand Ink-2!'), 'brandink-2');
	});
});
