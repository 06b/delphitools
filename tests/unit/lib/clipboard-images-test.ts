import { module, test } from 'qunit';
import { clipboardImages } from 'delphitools-v2/lib/clipboard-images';

function stubClipboard(read: () => Promise<ClipboardItem[]>) {
	const own = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
	Object.defineProperty(navigator, 'clipboard', {
		value: { read },
		configurable: true,
	});
	return () => {
		if (own) Object.defineProperty(navigator, 'clipboard', own);
		else delete (navigator as { clipboard?: unknown }).clipboard;
	};
}

module('Unit | Lib | clipboard-images', function () {
	test('keeps image items as files named pasted', async function (assert) {
		const restore = stubClipboard(() =>
			Promise.resolve([
				new ClipboardItem({
					'text/plain': new Blob(['hi']),
				}),
				new ClipboardItem({
					'image/png': new Blob(['png'], {
						type: 'image/png',
					}),
				}),
			]),
		);
		try {
			const files = await clipboardImages();
			assert.deepEqual(
				files.map((f) => [f.name, f.type]),
				[['pasted', 'image/png']],
			);
		} finally {
			restore();
		}
	});

	test('a denied read gives no files', async function (assert) {
		const restore = stubClipboard(() =>
			Promise.reject(
				new DOMException('denied', 'NotAllowedError'),
			),
		);
		try {
			assert.deepEqual(await clipboardImages(), []);
		} finally {
			restore();
		}
	});
});
