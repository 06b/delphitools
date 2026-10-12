import { module, test } from 'qunit';
import {
	blocksOf,
	lamps,
	landPath,
	locationLabel,
	mapPoint,
} from 'delphitools-v2/components/tools/metadata-stripper/blocks';

module('Unit | Tool | metadata-stripper', function () {
	test('blocksOf maps report entries and C2PA to blocks', function (assert) {
		const blocks = blocksOf({
			format: 'jpeg',
			gps: null,
			c2pa: true,
			entries: [
				{ label: 'GPS coordinates', detail: '' },
				{ label: 'Camera', detail: '' },
				{ label: 'Taken', detail: '' },
				{ label: 'Colour profile', detail: '' },
				{ label: 'Text: Title', detail: '' },
			],
		});
		assert.deepEqual([...blocks].sort(), [
			'C2PA',
			'EXIF',
			'GPS',
			'ICC',
			'TIFF',
		]);
		assert.strictEqual(blocksOf(null).size, 0);
	});

	test('lamps light what was found and strike what went (iOS selfCheck)', function (assert) {
		const found = new Set(['EXIF', 'GPS', 'TIFF'] as const);
		const after = lamps(found, new Set());
		assert.strictEqual(after[1], 'struck');
		assert.strictEqual(after[7], 'off');
		assert.strictEqual(lamps(found, null)[1], 'on');
	});

	test('mapPoint and locationLabel (iOS selfCheck)', function (assert) {
		assert.deepEqual(mapPoint(0, 0), { x: 180, y: 80 });
		assert.deepEqual(mapPoint(-89, 180), { x: 360, y: 140 });
		assert.strictEqual(
			locationLabel({ lat: 51.5, lon: -0.12667 }),
			'51.5000° N, 0.1267° W',
		);
	});

	test('landPath draws closed rings and skips slivers', function (assert) {
		assert.strictEqual(
			landPath([
				[
					[0, 0],
					[10, 0],
					[10, 10],
				],
				[[1, 1]],
			]),
			'M180.0 80.0L190.0 80.0L190.0 70.0Z',
		);
	});
});
