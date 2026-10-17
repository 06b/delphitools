import { module, test } from 'qunit';
import {
	blocksOf,
	lamps,
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
});
