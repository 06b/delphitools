import { module, test } from 'qunit';
import { cssUsage } from 'delphitools-v2/components/tools/font-explorer';
import {
	fit,
	standIn,
} from 'delphitools-v2/components/tools/font-explorer/picture';
import {
	chartRange,
	readFont,
	signed,
	specimen,
} from 'delphitools-v2/components/tools/font-explorer/sfnt';

module('Unit | Tool | font-explorer', function () {
	test('the specimen, as FontExplorerViewController.specimen', function (assert) {
		assert.strictEqual(
			specimen(() => true),
			'Hxdp',
		);
		const shavian = specimen((c) => c >= 0x10450 && c <= 0x1047f);
		assert.deepEqual(
			[...shavian].map((c) => c.codePointAt(0)),
			[0x10450, 0x10451, 0x10452, 0x10453],
			'first four letters',
		);
		assert.strictEqual(
			specimen(() => false),
			'Hxdp',
		);
	});

	test('the chart range follows the specimen', function (assert) {
		assert.deepEqual(
			chartRange(() => true),
			[0x20, 0x17f],
		);
		assert.deepEqual(
			chartRange((c) => c >= 0x10450 && c <= 0x1047f),
			[0x10450, 0x104cf],
		);
	});

	test('signed values and the CSS', function (assert) {
		assert.strictEqual(signed(-250), '−250');
		assert.strictEqual(signed(0), '0');
		assert.true(
			cssUsage('Inter.woff2', 'Inter').includes(
				"format('woff2')",
			),
		);
		assert.true(
			cssUsage('Inter.TTF').includes("font-family: 'Inter'"),
		);
	});

	test('a file that is not an sfnt reads as nothing', function (assert) {
		assert.strictEqual(readFont(new ArrayBuffer(4)), undefined);
		assert.strictEqual(
			readFont(
				new TextEncoder().encode('{"a": 1, "b": 2}')
					.buffer,
			),
			undefined,
		);
	});

	test('the specimen fits its depth to the height', function (assert) {
		const { em, baseline } = fit(standIn, 0, {
			y: 0,
			width: 1000,
			height: 135.2,
		});
		assert.strictEqual(Math.round(em), 100);
		assert.strictEqual(Math.round(baseline), 16 + 95);
	});
});
