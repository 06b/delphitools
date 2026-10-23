import { module, test } from 'qunit';
import {
	launchFlags,
	simulatePixels,
	visionTypes,
} from 'delphitools-v2/components/tools/colorblind-sim/vision';
import { simulateHex } from 'delphitools-v2/lib/colour-vision';

module('Unit | Tool | colorblind-sim', function () {
	test('pixels match the hex simulation and keep alpha', function (assert) {
		const pixels = new Uint8ClampedArray([
			255, 0, 0, 128, 0, 0, 255, 255,
		]);
		for (const { type } of visionTypes) {
			const out = simulatePixels(pixels, type);
			const code = simulateHex('#ff0000', type)!;
			assert.strictEqual(
				`#${[...out.slice(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
				code,
				type,
			);
			assert.strictEqual(out[3], 128);
		}
	});

	test('nine types, normal first', function (assert) {
		assert.strictEqual(visionTypes.length, 9);
		assert.strictEqual(visionTypes[0]!.type, 'normal');
		assert.strictEqual(visionTypes[0]!.severity, undefined);
	});

	test('launch flags', function (assert) {
		const flags = launchFlags(
			'?cbsColour=rgb(0,0,255)&cbsType=7&cbsImage',
		);
		assert.deepEqual(flags.colour, [0, 0, 1]);
		assert.strictEqual(flags.type, 'achromatopsia');
		assert.true(flags.image);
		assert.false(flags.typeLater);
		assert.deepEqual(
			launchFlags('?color=ff0000').colour,
			[1, 0, 0],
		);
		assert.strictEqual(launchFlags('?cbsType=12').type, undefined);
		assert.strictEqual(launchFlags('').type, undefined);
	});
});
