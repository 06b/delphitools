import { module, test } from 'qunit';
import JSZip from 'jszip';
import { uniqueName, zipFiles } from 'delphitools-v2/lib/zip-files';

module('Unit | Lib | zip-files', function () {
	test('a repeated name gets a number before its extension', function (assert) {
		const taken = new Set<string>();
		assert.strictEqual(uniqueName('a.png', taken), 'a.png');
		assert.strictEqual(uniqueName('a.png', taken), 'a (2).png');
		assert.strictEqual(uniqueName('a.png', taken), 'a (3).png');
		assert.strictEqual(uniqueName('notes', taken), 'notes');
		assert.strictEqual(uniqueName('notes', taken), 'notes (2)');
	});

	test('the archive holds every file', async function (assert) {
		const zip = await zipFiles([
			{ name: 'a.txt', blob: new Blob(['one']) },
			{ name: 'a.txt', blob: new Blob(['two']) },
		]);
		const archive = await JSZip.loadAsync(await zip.arrayBuffer());
		assert.deepEqual(Object.keys(archive.files).sort(), [
			'a (2).txt',
			'a.txt',
		]);
		assert.strictEqual(
			await archive.file('a (2).txt')!.async('string'),
			'two',
		);
	});
});
