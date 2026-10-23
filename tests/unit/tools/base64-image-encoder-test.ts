import { module, test } from 'qunit';
import {
	cover,
	figure,
	idleText,
	rawBase64,
} from 'delphitools-v2/components/tools/base64-image-encoder/mosaic';

module('Unit | Tool | base64-image-encoder', function () {
	test('cover keeps the picture aspect, centred', function (assert) {
		const cell = { width: 5, height: 10 };
		assert.deepEqual(
			cover(40, 10, cell, { width: 100, height: 100 }),
			{ x: 10, y: 0, columns: 20, rows: 10 },
		);
		assert.deepEqual(
			cover(40, 10, cell, { width: 400, height: 50 }),
			{ x: 0, y: 3, columns: 40, rows: 3 },
		);
		assert.deepEqual(
			cover(40, 10, cell, { width: 0, height: 50 }),
			{ x: 0, y: 0, columns: 0, rows: 0 },
		);
	});

	test('figure splits the size the web tool writes', function (assert) {
		assert.deepEqual(figure(512), { value: '512', unit: 'B' });
		assert.deepEqual(figure(2048), { value: '2.0', unit: 'KB' });
		assert.deepEqual(figure(3 * 1048576), {
			value: '3.0',
			unit: 'MB',
		});
	});

	test('rawBase64 drops the data URI header', function (assert) {
		assert.strictEqual(
			rawBase64('data:image/png;base64,iVBOR'),
			'iVBOR',
		);
		assert.strictEqual(
			atob(idleText).slice(0, 19),
			'delphitools base64 ',
		);
	});
});
