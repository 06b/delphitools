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
	reportText,
	scanPixels,
	summary,
	tileSplit,
} from 'delphitools-v2/components/tools/image-atlas/report';
import {
	gamutOverSRGB,
	profileName,
	sourceSpace,
	splitIcc,
} from 'delphitools-v2/components/tools/image-atlas/icc';
import { pixelFormat } from 'delphitools-v2/components/tools/image-atlas/header';

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

	test('icc: split, name and gamut', function (assert) {
		// s15Fixed16 XYZType, as exifr leaves it
		const xyz = (...v: number[]) => {
			const bytes = new Uint8Array(20);
			const view = new DataView(bytes.buffer);
			v.forEach((n, i) =>
				view.setInt32(8 + i * 4, Math.round(n * 65536)),
			);
			return bytes;
		};
		// sRGB's D50-adapted matrix columns
		const srgb = {
			RedMatrixColumn: xyz(0.4361, 0.2225, 0.0139),
			GreenMatrixColumn: xyz(0.3851, 0.7169, 0.0971),
			BlueMatrixColumn: xyz(0.1431, 0.0606, 0.7141),
		};
		const { exif, icc } = splitIcc({
			Make: 'Cam',
			ProfileDescription: 'sRGB IEC61966-2.1',
			ProfileClass: 'Monitor',
			...srgb,
		});
		assert.deepEqual(Object.keys(exif), ['Make']);
		assert.strictEqual(profileName(icc), 'sRGB IEC61966-2.1');
		assert.strictEqual(gamutOverSRGB(icc)?.toFixed(2), '1.00');
		assert.strictEqual(
			profileName({
				ProfileDescription: [
					{ lang: 'de', text: 'Graustufen' },
					{ lang: 'en', text: 'Gray' },
				],
			}),
			'Gray',
		);
		assert.strictEqual(
			profileName({ ProfileName: 'ICC Profile' }),
			'ICC Profile',
		);
		assert.strictEqual(profileName({}), null);
		assert.strictEqual(
			gamutOverSRGB({ GrayTRC: new Uint8Array(14) }),
			null,
		);
	});

	test('pixelFormat: PNG IHDR, JPEG SOF, WebP header', function (assert) {
		const asc = (s: string) => [...s].map((c) => c.charCodeAt(0));
		const be32 = (n: number) => [
			n >>> 24,
			(n >>> 16) & 255,
			(n >>> 8) & 255,
			n & 255,
		];
		const chunk = (type: string, data: number[]) => [
			...be32(data.length),
			...asc(type),
			...data,
			0,
			0,
			0,
			0,
		];
		const png = (
			depth: number,
			type: number,
			extra: number[] = [],
		) =>
			new Uint8Array([
				137,
				...asc('PNG'),
				13,
				10,
				26,
				10,
				...chunk('IHDR', [
					...be32(4),
					...be32(4),
					depth,
					type,
					0,
					0,
					0,
				]),
				...extra,
				...chunk('IDAT', [0]),
			]);
		assert.deepEqual(pixelFormat(png(16, 2)), {
			model: 'RGB',
			depth: 16,
			alpha: false,
		});
		assert.deepEqual(pixelFormat(png(8, 3, chunk('tRNS', [0]))), {
			model: 'RGB',
			depth: 8,
			alpha: true,
		});
		assert.deepEqual(pixelFormat(png(8, 4)), {
			model: 'Gray',
			depth: 8,
			alpha: true,
		});
		const jpeg = new Uint8Array([
			0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11,
			12, 0, 4, 0, 4, 1, 1, 0x11, 0,
		]);
		assert.deepEqual(pixelFormat(jpeg), {
			model: 'Gray',
			depth: 12,
			alpha: false,
		});
		const webp = (type: string, data: number[]) =>
			new Uint8Array([
				...asc('RIFF'),
				0,
				0,
				0,
				0,
				...asc('WEBP'),
				...asc(type),
				10,
				0,
				0,
				0,
				...data,
				...new Array<number>(10).fill(0),
			]);
		assert.true(
			pixelFormat(webp('VP8L', [0x2f, 0, 0, 0, 0x10]))?.alpha,
		);
		assert.false(pixelFormat(webp('VP8X', [0]))?.alpha);
		assert.strictEqual(
			pixelFormat(new Uint8Array(asc('GIF89a'))),
			null,
		);
	});

	test('sourceSpace and scanPixels: share outside sRGB', function (assert) {
		const asc = (s: string) => [...s].map((c) => c.charCodeAt(0));
		const xyz = (...v: number[]) => {
			const bytes = new Uint8Array(20);
			const view = new DataView(bytes.buffer);
			v.forEach((n, i) =>
				view.setInt32(8 + i * 4, Math.round(n * 65536)),
			);
			return bytes;
		};
		// curveType with no entries: identity
		const linear = new Uint8Array([
			...asc('curv'),
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
		]);
		// parametricCurveType 3 with the sRGB constants
		const para = new Uint8Array(32);
		const view = new DataView(para.buffer);
		para.set(asc('para'));
		view.setUint16(8, 3);
		[2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045].forEach(
			(n, i) =>
				view.setInt32(
					12 + i * 4,
					Math.round(n * 65536),
				),
		);
		const srgb = sourceSpace({
			RedMatrixColumn: xyz(0.4361, 0.2225, 0.0139),
			GreenMatrixColumn: xyz(0.3851, 0.7169, 0.0971),
			BlueMatrixColumn: xyz(0.1431, 0.0606, 0.7141),
			RedTRC: para,
			GreenTRC: para,
			BlueTRC: para,
		});
		assert.deepEqual(
			srgb?.matrix.map((n) => Math.round(n * 100) / 100 || 0),
			[1, 0, 0, 0, 1, 0, 0, 0, 1],
			'sRGB columns: identity',
		);
		assert.strictEqual(srgb?.curves[0][128]?.toFixed(3), '0.216');
		// Display P3 D50 columns
		const p3 = sourceSpace({
			RedMatrixColumn: xyz(0.5151, 0.2412, -0.0011),
			GreenMatrixColumn: xyz(0.2919, 0.6922, 0.0419),
			BlueMatrixColumn: xyz(0.1571, 0.0666, 0.7841),
			RedTRC: linear,
			GreenTRC: linear,
			BlueTRC: linear,
		})!;
		// green, white, black, clear
		const own = [
			0, 255, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0,
			255, 0, 0,
		];
		const scan = scanPixels(own, { pixels: own, space: p3 });
		assert.strictEqual(
			scan.outside,
			0.5,
			'black and clear pixels skip',
		);
		assert.strictEqual(
			scanPixels(own).outside,
			0,
			'untagged: none',
		);
		assert.strictEqual(sourceSpace({ GrayTRC: linear }), null);
	});

	test('reportText: the colour lines, dashes left out', function (assert) {
		const text = reportText({}, null, 'a.png', 10, null, [
			{ label: 'Colour Model', value: 'RGB' },
			{ label: 'Colour Profile', value: '—' },
			{ label: 'Outside sRGB', value: '12.5 %' },
		]);
		assert.true(
			text.includes(
				'\nCOLOUR\nColour Model: RGB\nOutside sRGB: 12.5 %\n\n',
			),
			text,
		);
		assert.false(
			reportText({}, null, 'a.png', 10, null, []).includes(
				'COLOUR',
			),
		);
	});
});
