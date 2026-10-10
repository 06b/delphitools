import { module, test } from 'qunit';
import { pinSvgSize } from 'delphitools-v2/lib/svg-size';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

function size(svg: string | null) {
	const root = new DOMParser().parseFromString(
		svg!,
		'image/svg+xml',
	).documentElement;
	return [
		root.getAttribute('width'),
		root.getAttribute('height'),
		root.getAttribute('viewBox'),
	];
}

module('Unit | Lib | svg-size', function () {
	test('viewBox-only svg is sized from the viewBox', function (assert) {
		assert.deepEqual(
			size(pinSvgSize(`<svg ${NS} viewBox="0 0 64 32"/>`)),
			['512', '256', '0 0 64 32'],
		);
	});

	test('relative width and height are replaced', function (assert) {
		assert.deepEqual(
			size(
				pinSvgSize(
					`<svg ${NS} width="1em" height="100%" viewBox="0 0 24 24"/>`,
					48,
				),
			),
			['48', '48', '0 0 24 24'],
		);
	});

	test('pixel size without a viewBox gains one', function (assert) {
		assert.deepEqual(
			size(
				pinSvgSize(
					`<svg ${NS} width="20px" height="40"/>`,
				),
			),
			['256', '512', '0 0 20 40'],
		);
	});

	test('no usable size falls back to a square edge', function (assert) {
		assert.deepEqual(size(pinSvgSize(`<svg ${NS}/>`, 100)), [
			'100',
			'100',
			null,
		]);
	});

	test('unparseable input returns null', function (assert) {
		assert.strictEqual(pinSvgSize('<svg'), null);
	});
});
