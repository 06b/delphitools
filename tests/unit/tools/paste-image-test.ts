import { module, test } from 'qunit';
import {
	downloadName,
	extensionFor,
} from 'delphitools-v2/components/tools/paste-image/file-name';

module('Unit | Tool | paste-image', function () {
	test('file name and extension', function (assert) {
		assert.strictEqual(extensionFor('image/jpeg'), 'jpg');
		assert.strictEqual(extensionFor('image/svg+xml'), 'svg');
		assert.strictEqual(
			downloadName(new Date(2026, 9, 16), 'image/png'),
			'delphitools-paste-image-2026-10-16.png',
		);
	});
});
