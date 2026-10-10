import { module, test } from 'qunit';
import {
	STRATEGY_INFO,
	generatePalette,
	type PaletteStrategy,
} from 'delphitools-v2/lib/palette-strategies';
import { hexToRgb, rgbToOklch } from 'delphitools-v2/lib/colour-maths';

const HEX = /^#[0-9a-f]{6}$/;
const STRATEGIES = Object.keys(STRATEGY_INFO) as PaletteStrategy[];

function hue(hex: string) {
	return rgbToOklch(...hexToRgb(hex)!)[2];
}

module('Unit | Lib | palette-strategies', function () {
	test('every strategy returns valid hex at any count', function (assert) {
		for (const strategy of STRATEGIES)
			for (const count of [1, 2, 5])
				for (const seeds of [undefined, ['#3366cc']]) {
					const palette = generatePalette(
						count,
						strategy,
						seeds,
					);
					assert.strictEqual(
						palette.length,
						count,
					);
					assert.true(
						palette.every((hex) =>
							HEX.test(hex),
						),
						`${strategy} ×${count}: ${palette.join(' ')}`,
					);
				}
	});

	test('a seeded single colour sits near the seed', function (assert) {
		const seedHue = hue('#3366cc');
		for (let i = 0; i < 20; i++) {
			const [hex] = generatePalette(1, 'analogous', [
				'#3366cc',
			]);
			assert.true(Math.abs(hue(hex!) - seedHue) < 25, hex);
		}
	});

	test('unparseable seeds fall back to a random base', function (assert) {
		const palette = generatePalette(3, 'triadic', ['nope', '']);
		assert.true(palette.every((hex) => HEX.test(hex)));
	});
});
