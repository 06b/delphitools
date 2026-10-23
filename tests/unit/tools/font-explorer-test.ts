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

import {
	blockName,
	coveredCodes,
	inView,
	tableLayout,
} from 'delphitools-v2/components/tools/font-explorer/table';

module('Unit | Tool | font-explorer', function () {
	test('the full table: covered codes, sections, rows', function (assert) {
		const codes = coveredCodes([
			[0x41, 0x43],
			[0x0, 0x1f],
			[0x42, 0x44],
			[0x3b1, 0x3b2],
			[0x10450, 0x10451],
		]);
		assert.deepEqual(
			codes,
			[
				0x41, 0x42, 0x43, 0x44, 0x3b1, 0x3b2, 0x10450,
				0x10451,
			],
			'controls out, overlaps once, sorted',
		);
		assert.strictEqual(blockName(0x41), 'Latin Basic');
		assert.strictEqual(blockName(0x10450), 'U+10400–104FF');
		const { items, height } = tableLayout(codes, 3, 48, 36);
		assert.deepEqual(
			items.map((item) => item.name ?? item.codes.length),
			['Latin Basic', 3, 1, 'Greek', 2, 'U+10450–10451', 2],
		);
		assert.strictEqual(height, 3 * 36 + 4 * 48);
		assert.deepEqual(
			inView(items, 84, 140).map((item) => item.key),
			[items[2]!.key, items[3]!.key],
			'the second row and the next heading',
		);
	});

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
