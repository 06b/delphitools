import { module, test } from 'qunit';
import {
	DEFAULTS,
	backgroundFill,
	buildIcns,
	buildIco,
	encodeBmp,
	figureOf,
	isLossy,
	keepsAlpha,
	outputName,
	outputSize,
	targetSize,
	type Settings,
} from 'delphitools-v2/components/tools/image-converter/encode';

const natural = { width: 1400, height: 1000 };
const with_ = (patch: Partial<Settings>): Settings => ({
	...DEFAULTS,
	...patch,
});

module('Unit | Tool | image-converter', function () {
	test('targetSize: original and percentage', function (assert) {
		assert.deepEqual(targetSize(natural, DEFAULTS), natural);
		assert.deepEqual(
			targetSize(
				natural,
				with_({ resize: 'percentage', percentage: 25 }),
			),
			{ width: 350, height: 250 },
		);
		assert.deepEqual(
			targetSize(
				{ width: 3, height: 1 },
				with_({ resize: 'percentage', percentage: 1 }),
			),
			{ width: 1, height: 1 },
			'never below one pixel',
		);
	});

	test('targetSize: custom, locked to the typed side', function (assert) {
		const custom = with_({
			resize: 'custom',
			width: 700,
			height: 300,
		});
		assert.deepEqual(targetSize(natural, custom), {
			width: 700,
			height: 500,
		});
		assert.deepEqual(
			targetSize(natural, { ...custom, drives: 'height' }),
			{ width: 420, height: 300 },
		);
		assert.deepEqual(
			targetSize(natural, { ...custom, lock: false }),
			{ width: 700, height: 300 },
		);
		assert.deepEqual(
			targetSize(natural, with_({ resize: 'custom' })),
			natural,
			'no size yet keeps the source',
		);
	});

	test('outputSize: icons are their largest square', function (assert) {
		assert.deepEqual(
			outputSize(natural, with_({ format: 'ico' })),
			{
				width: 32,
				height: 32,
			},
		);
		assert.deepEqual(
			outputSize(
				natural,
				with_({ format: 'icns', icnsMultiSize: true }),
			),
			{ width: 1024, height: 1024 },
		);
	});

	test('what each format keeps', function (assert) {
		assert.true(keepsAlpha(with_({ format: 'webp' })));
		assert.false(keepsAlpha(with_({ format: 'jpeg' })));
		assert.false(
			keepsAlpha(
				with_({
					format: 'png',
					pngTransparency: false,
				}),
			),
		);
		assert.true(
			keepsAlpha(
				with_({
					format: 'gif',
					gifQuantisation: 'rgba4444',
				}),
			),
		);
		assert.false(
			keepsAlpha(with_({ format: 'bmp', bmpBitDepth: 24 })),
		);
		assert.true(isLossy(with_({ format: 'webp' })));
		assert.false(
			isLossy(with_({ format: 'jxl', jxlLossless: true })),
		);
		assert.false(isLossy(with_({ format: 'gif' })));
		assert.strictEqual(
			backgroundFill(
				with_({
					format: 'jpeg',
					jpegBackground: '#123456',
				}),
			),
			'#123456',
		);
		assert.strictEqual(
			backgroundFill(
				with_({ format: 'bmp', bmpBitDepth: 24 }),
			),
			'#ffffff',
		);
		assert.strictEqual(
			backgroundFill(with_({ format: 'png' })),
			null,
		);
	});

	test('names and figures', function (assert) {
		assert.strictEqual(
			outputName('photo.final.png', 'jpeg'),
			'photo.final.jpg',
		);
		assert.strictEqual(outputName('pasted', 'webp'), 'pasted.webp');
		assert.deepEqual(figureOf('12.3 KB'), ['12.3', 'KB']);
	});

	test('encodeBmp: header, padded rows, BGR order', async function (assert) {
		const data = new ImageData(
			new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 128]),
			2,
			1,
		);
		const bytes = new Uint8Array(
			await encodeBmp(data, 24).arrayBuffer(),
		);
		const view = new DataView(bytes.buffer);
		assert.strictEqual(
			bytes.length,
			54 + 8,
			'six bytes padded to eight',
		);
		assert.strictEqual(view.getInt32(22, true), -1, 'top-down');
		assert.deepEqual(
			[...bytes.slice(54, 60)],
			[0, 0, 255, 255, 0, 0],
		);
		const alpha = new Uint8Array(
			await encodeBmp(data, 32).arrayBuffer(),
		);
		assert.strictEqual(alpha[54 + 7], 128, 'alpha kept at 32 bit');
	});

	test('icon containers', async function (assert) {
		const png = new Uint8Array([1, 2, 3]).buffer;
		const ico = new DataView(
			await buildIco([16, 256], [png, png]).arrayBuffer(),
		);
		assert.strictEqual(ico.getUint16(4, true), 2);
		assert.strictEqual(
			ico.getUint8(6 + 16),
			0,
			'256 is written as 0',
		);
		assert.strictEqual(ico.getUint32(6 + 12, true), 6 + 32);
		const icns = new DataView(
			await buildIcns(['ic07'], [png]).arrayBuffer(),
		);
		assert.strictEqual(icns.getUint32(4, false), 8 + 8 + 3);
		assert.strictEqual(
			String.fromCharCode(
				icns.getUint8(8),
				icns.getUint8(9),
				icns.getUint8(10),
				icns.getUint8(11),
			),
			'ic07',
		);
	});
});
