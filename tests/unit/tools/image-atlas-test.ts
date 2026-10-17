import { module, test } from 'qunit';
import {
	atlasSections,
	bannerHeight,
	caption,
	gpsFromExif,
	locationRows,
	peak,
	prettyLabel,
	prettyValue,
	scanPixels,
	summary,
	tileSplit,
} from 'delphitools-v2/components/tools/image-atlas/report';

module('Unit | Tool | image-atlas', function () {
	test('labels and values read as the web tool did', function (assert) {
		assert.strictEqual(
			prettyLabel('DateTimeOriginal'),
			'Date Taken',
		);
		assert.strictEqual(prettyLabel('ISO'), 'ISO');
		assert.strictEqual(prettyValue('FNumber', 2.8), 'f/2.8');
		assert.strictEqual(
			prettyValue('ExposureTime', 0.004),
			'0.004 (1/250s)',
		);
		assert.strictEqual(
			prettyValue('MeteringMode', 5),
			'Multi-segment',
		);
	});

	test('gpsFromExif: numbers only, altitude ref below sea level', function (assert) {
		assert.deepEqual(
			gpsFromExif({
				latitude: 51.5,
				longitude: 0.1,
				GPSAltitude: 20,
				GPSAltitudeRef: 1,
			}),
			{ lat: 51.5, lon: 0.1, alt: -20, altRef: 1 },
		);
		assert.strictEqual(
			gpsFromExif({ latitude: 'ENaNNaN', longitude: null }),
			null,
		);
	});

	test('atlasSections: file first, hero camera rows with Software, no Location in File', function (assert) {
		const sections = atlasSections({
			name: 'a.jpg',
			size: 2048,
			type: 'image/jpeg',
			dims: { w: 4, h: 3 },
			exif: {
				Make: 'Cam',
				Model: 'X',
				Software: 'Edit 1',
				LensModel: 'L 50',
				GPSAltitude: 10,
				latitude: 1,
				longitude: 2,
			},
		});
		assert.deepEqual(
			sections.map((s) => s.title),
			['File', 'Camera', 'Location'],
		);
		assert.deepEqual(
			sections[1]!.rows.map((r) => r.label),
			['Make', 'Model', 'Lens Model', 'Software'],
		);
		assert.deepEqual(
			locationRows(sections, { lat: 1, lon: 2 }).map(
				(r) => r.label,
			),
			['GPS Altitude'],
		);
	});

	test('tileSplit: values over 22 characters get a line', function (assert) {
		const split = tileSplit([
			{ label: 'a', value: 'short' },
			{ label: 'b', value: 'x'.repeat(23) },
		]);
		assert.deepEqual(
			split.short.map((r) => r.label),
			['a'],
		);
		assert.deepEqual(
			split.long.map((r) => r.label),
			['b'],
		);
	});

	test('summary and caption', function (assert) {
		assert.strictEqual(
			summary('image/svg+xml', 1024, 1),
			'SVG · 1.0 KB · 1 field',
		);
		assert.strictEqual(
			summary('image/png', 0, 0),
			'PNG · 0 B · no metadata',
		);
		assert.strictEqual(caption(1920, 1080), '16:9  2.1 MP');
		assert.strictEqual(caption(6000, 4000), '3:2  24 MP');
	});

	test('bannerHeight: the image capped at 420 px, at least 96', function (assert) {
		const square = { width: 1, height: 1 };
		assert.strictEqual(bannerHeight(2000, square), 420 + 94);
		assert.strictEqual(
			bannerHeight(390, { width: 10, height: 1 }),
			96 + 94,
		);
	});

	test('scanPixels and peak', function (assert) {
		const scan = scanPixels([
			255, 0, 0, 255, 0, 0, 0, 0, 10, 20, 30, 128, 10, 20, 30,
			255,
		]);
		assert.strictEqual(scan.transparent, 0.5);
		assert.strictEqual(scan.histogram[0][255], 1);
		assert.strictEqual(scan.histogram[0][10], 2);
		assert.strictEqual(
			scan.histogram[0][0],
			0,
			'clear pixels skip',
		);
		assert.strictEqual(peak(scan.histogram), 2);
		assert.strictEqual(
			peak([[5, 0, 0, 7]]),
			7,
			'end bins when nothing inside',
		);
	});
});
