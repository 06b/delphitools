import { module, test } from 'qunit';
import { sealSvgSeams } from 'delphitools-v2/components/tools/qr-genny';
import {
	SheetMotion,
	duration,
	isDark,
	order,
	pixelSize,
	place,
	shareAt,
	sizeOf,
	timing,
	zigzag,
	type CodeSheet,
} from 'delphitools-v2/components/tools/qr-genny/code-sheet';
import {
	dotPath,
	qrLayout,
	qrMatrix,
	qrSheet,
	type QrStyle,
} from 'delphitools-v2/components/tools/qr-genny/qr';

const SVG =
	'<svg xmlns="http://www.w3.org/2000/svg">' +
	'<rect width="4" height="4" fill="#7c3aed"/>' +
	'<path d="M0 0h2v2z" fill="url(#g)"/>' +
	'<rect width="1" height="1" fill="none"/>' +
	'<circle r="1" fill="#000" stroke="#fff"/>' +
	'</svg>';

const sheetOf = (
	modules: boolean[][],
	extra: Partial<CodeSheet> = {},
): CodeSheet => ({
	modules,
	margin: { top: 1, left: 1, bottom: 1, right: 1 },
	ink: 'black',
	paper: 'white',
	sweep: 'columns',
	anchor: 'none',
	...extra,
});

const area = { x: 0, y: 0, width: 100, height: 100 };
const placer = (sheet: CodeSheet) => place(sheet, area, 2);
const square = (n: number, dark: (r: number, c: number) => boolean) =>
	Array.from({ length: n }, (_, r) =>
		Array.from({ length: n }, (_, c) => dark(r, c)),
	);

const style: QrStyle = {
	size: 300,
	margin: 8,
	level: 'M',
	dotType: 'square',
	cornerSquareType: 'square',
	cornerDotType: 'square',
	ink: '#000000',
	paper: '#ffffff',
	logoSize: 0.3,
	logoMargin: 4,
	info: [],
};

module('Unit | Tool | qr-genny', function () {
	test('filled shapes gain a same-colour outline', function (assert) {
		const out = sealSvgSeams(SVG);
		assert.true(
			out.includes(
				'<rect width="4" height="4" fill="#7c3aed" stroke="#7c3aed" stroke-width="0.5"/>',
			),
			out,
		);
	});

	test('gradient fills stroke with the same reference', function (assert) {
		assert.true(sealSvgSeams(SVG).includes('stroke="url(#g)"'));
	});

	test('fill=none and shapes with their own stroke stay untouched', function (assert) {
		const out = sealSvgSeams(SVG);
		assert.true(
			out.includes(
				'<rect width="1" height="1" fill="none"/>',
			),
		);
		assert.true(out.includes('stroke="#fff"'));
		assert.false(out.includes('fill="#000" stroke="#000"'));
	});

	test('the stroke width is adjustable', function (assert) {
		assert.true(sealSvgSeams(SVG, 1).includes('stroke-width="1"'));
	});

	test('quoted url references are unquoted', function (assert) {
		const out = sealSvgSeams(
			`<svg xmlns="http://www.w3.org/2000/svg"><rect clip-path="url('#c')" fill="url('#g')"/></svg>`,
		);
		assert.true(out.includes('clip-path="url(#c)"'), out);
		assert.true(out.includes('stroke="url(#g)"'), out);
	});

	test('unparseable input comes back unchanged', function (assert) {
		assert.strictEqual(sealSvgSeams('not svg'), 'not svg');
	});
});

// the asserts of CodeSheet.selfCheck on iOS
module('Unit | Tool | qr-genny | code sheet', function () {
	test('zigzag: a permutation, bottom-right first', function (assert) {
		const table = zigzag(21);
		assert.strictEqual(new Set(table).size, 441);
		assert.strictEqual(table[20 * 21 + 20], 0);
		assert.strictEqual(table[20 * 21 + 19], 1);
		assert.strictEqual(table[19 * 21 + 20], 2);
		assert.strictEqual(
			table[0 * 21 + 18],
			42,
			'second pair runs down',
		);
		assert.strictEqual(
			table[0 * 21 + 6],
			440 - 20,
			'the timing column goes last',
		);
	});

	test('sizes in modules and pixels', function (assert) {
		const sheet = sheetOf([[true, true, false, true]], {
			rowHeight: 2,
		});
		assert.deepEqual(sizeOf(sheet), { width: 6, height: 4 });
		assert.deepEqual(pixelSize(sheet, 3), {
			width: 18,
			height: 12,
		});
		assert.strictEqual(order(sheet, 0, 0), 0);
		assert.strictEqual(order(sheet, 0, 3), 1);
		assert.strictEqual(order(sheet, 0, 9), 1, 'clamps');
	});

	test('rings run from the middle out; zigzag needs a square', function (assert) {
		const rings = sheetOf(
			square(5, () => true),
			{ sweep: 'rings' },
		);
		assert.strictEqual(order(rings, 2, 2), 0);
		assert.strictEqual(order(rings, 0, 4), 1);
		const wide = sheetOf([[true, true]], { sweep: 'zigzag' });
		assert.strictEqual(order(wide, 0, 1), 0);
	});

	test('whole device pixels per module, the code corner on a pixel', function (assert) {
		const sheet = sheetOf([[true, true, false, true]], {
			rowHeight: 2,
		});
		const placed = place(sheet, area, 3)!;
		assert.strictEqual(
			Math.round(placed.pitch * 3),
			placed.pitch * 3,
			String(placed.pitch),
		);
		assert.strictEqual(
			Math.round(placed.origin.x * 3),
			placed.origin.x * 3,
		);
		assert.strictEqual(
			place(sheet, { ...area, width: 0 }, 3),
			undefined,
		);
	});

	test('a quiet zone wider than the margin fits in the area', function (assert) {
		const sheet = sheetOf(
			square(21, () => true),
			{ quietZone: 4 },
		);
		const placed = place(sheet, area, 1)!;
		const zone = 4 * placed.pitch;
		assert.true(placed.origin.x - zone >= 0, `${placed.origin.x}`);
		assert.true(
			placed.origin.x + 21 * placed.pitch + zone <= 100,
			`${placed.pitch}`,
		);
	});
});

module('Unit | Tool | qr-genny | sheet motion', function () {
	const a = sheetOf(square(5, (r, c) => (r + c) % 2 === 0));
	const b = sheetOf(square(5, (r, c) => (r + c) % 3 === 0));

	const sharesAt = (motion: SheetMotion, time: number) =>
		motion.layers.flatMap((layer) =>
			Array.from(
				{ length: layer.rows * layer.columns },
				(_, i) => shareAt(layer, i, time),
			),
		);

	test('a sweep turns every module to the new sheet and settles', function (assert) {
		const motion = new SheetMotion();
		motion.reset(a);
		assert.true(motion.settled(0));
		motion.sweep(b, placer, 10);
		assert.false(motion.settled(10.1));
		const target = motion.target!;
		const end = 10 + duration + 0.001;
		for (let i = 0; i < 25; i++) {
			const want = isDark(b, Math.floor(i / 5), i % 5)
				? 1
				: 0;
			assert.strictEqual(shareAt(target, i, end), want);
		}
		assert.true(motion.settled(end));
	});

	test('the first module turns first, the last one spread later', function (assert) {
		const motion = new SheetMotion();
		motion.reset(a);
		motion.sweep(b, placer, 0);
		const target = motion.target!;
		// columns: column 0 starts at 0, column 4 at spread
		const first = 2 * 5 + 0;
		const last = 0 * 5 + 4;
		assert.notStrictEqual(isDark(b, 2, 0), isDark(a, 2, 0));
		assert.notStrictEqual(isDark(b, 0, 4), isDark(a, 0, 4));
		assert.notEqual(
			shareAt(target, first, timing.flip / 2),
			shareAt(target, first, 0),
		);
		assert.strictEqual(
			shareAt(target, last, timing.spread - 0.01),
			isDark(a, 0, 4) ? 1 : 0,
			'not begun',
		);
	});

	test('a change mid-sweep starts from what is on screen', function (assert) {
		const motion = new SheetMotion();
		motion.reset(a);
		motion.sweep(b, placer, 0);
		const mid = 0.27;
		const before = sharesAt(motion, mid);
		motion.sweep(a, placer, mid);
		const after = sharesAt(motion, mid);
		assert.deepEqual(
			after.map((s) => s.toFixed(4)),
			before.map((s) => s.toFixed(4)),
			'no jump',
		);
		assert.true(motion.settled(mid + duration));
	});

	test('a code of another size: the old modules fade, the new ones grow', function (assert) {
		const motion = new SheetMotion();
		const big = sheetOf(square(7, () => true));
		motion.reset(a);
		motion.sweep(big, placer, 0);
		assert.strictEqual(motion.layers.length, 2);
		assert.true(motion.layers[0]!.fading);
		assert.strictEqual(shareAt(motion.layers[1]!, 0, 0), 0);
		assert.strictEqual(shareAt(motion.layers[1]!, 0, duration), 1);
		assert.strictEqual(shareAt(motion.layers[0]!, 0, duration), 0);
		motion.compact();
		assert.strictEqual(motion.layers.length, 1);
	});

	test('fast changes keep at most a few fading layers', function (assert) {
		const motion = new SheetMotion();
		motion.reset(a);
		for (let n = 6; n < 14; n++)
			motion.sweep(
				sheetOf(square(n, () => true)),
				placer,
				n * 0.01,
			);
		assert.true(motion.layers.length <= SheetMotion.keep + 1);
	});

	test('marks fade only when their key changes', function (assert) {
		const motion = new SheetMotion();
		motion.reset({ ...a, marksKey: 'one' });
		motion.sweep({ ...b, marksKey: 'one' }, placer, 0);
		assert.strictEqual(motion.marks.length, 1);
		motion.sweep({ ...a, marksKey: 'two' }, placer, 0.1);
		assert.strictEqual(motion.marks.length, 2);
		assert.strictEqual(motion.marksAlpha(motion.marks[1]!, 0.1), 0);
		assert.strictEqual(
			motion.marksAlpha(motion.marks[1]!, 0.1 + duration),
			1,
		);
	});

	test('a restyle keeps the sweep in flight', function (assert) {
		const motion = new SheetMotion();
		motion.reset(a);
		motion.sweep(b, placer, 0);
		const began = motion.target!.began;
		motion.restyle({ ...b, ink: 'red' });
		assert.strictEqual(motion.target!.began, began);
		assert.strictEqual(motion.sheet!.ink, 'red');
	});
});

module('Unit | Tool | qr-genny | qr', function () {
	test('the matrix is the one qr-code-styling writes', async function (assert) {
		const { default: Styling } = await import('qr-code-styling');
		for (const [data, level] of [
			['https://delphi.tools', 'M'],
			['0123456789', 'L'],
			['HELLO WORLD', 'Q'],
			['grüße, 東京 ✓', 'H'],
		] as const) {
			const qr = new Styling({
				data,
				type: 'svg',
				width: 300,
				height: 300,
				qrOptions: { errorCorrectionLevel: level },
			})._qr!;
			const matrix = qrMatrix(data, level)!;
			const n = qr.getModuleCount();
			assert.strictEqual(matrix.length, n, data);
			assert.true(
				matrix.every((row, r) =>
					row.every(
						(dark, c) =>
							dark ===
							qr.isDark(r, c),
					),
				),
				`same modules for ${data}`,
			);
		}
		assert.strictEqual(
			qrMatrix('x'.repeat(3000), 'H'),
			undefined,
			'too long',
		);
	});

	test('module size and offset as qr-code-styling draws them', function (assert) {
		assert.deepEqual(qrLayout(25, 300, 8), {
			count: 25,
			dot: 11,
			offset: 12,
		});
		assert.strictEqual(
			qrLayout(25, 100, 40),
			undefined,
			'under a pixel',
		);
		assert.strictEqual(
			qrLayout(177, 100, 0),
			undefined,
			'too small',
		);
	});

	test('the sheet leaves the finders to the marks', function (assert) {
		const matrix = qrMatrix('https://delphi.tools', 'M')!;
		const picture = qrSheet(matrix, style)!;
		assert.deepEqual(picture.pixels, { width: 300, height: 300 });
		assert.false(picture.sheet.modules[0]![0]);
		assert.true(matrix[0]![0]);
		assert.strictEqual(picture.sheet.margin.left, 12 / 11);
		assert.strictEqual(picture.sheet.sweep, 'zigzag');
	});

	test('the picture shows the PNG export module for module', async function (assert) {
		const data = 'https://delphi.tools';
		const { default: Styling } = await import('qr-code-styling');
		const qr = new Styling({
			data,
			type: 'svg',
			width: 300,
			height: 300,
			margin: 8,
			qrOptions: { errorCorrectionLevel: 'M' },
			dotsOptions: { type: 'square', color: '#000000' },
			backgroundOptions: { color: '#ffffff' },
		});
		const blob = (await qr.getRawData('png')) as Blob;
		const bitmap = await createImageBitmap(blob);
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const context = canvas.getContext('2d')!;
		context.drawImage(bitmap, 0, 0);
		const matrix = qrMatrix(data, 'M')!;
		const { dot, offset } = qrLayout(matrix.length, 300, 8)!;
		let same = 0;
		matrix.forEach((row, r) =>
			row.forEach((dark, c) => {
				const x = Math.floor(offset + (c + 0.5) * dot);
				const y = Math.floor(offset + (r + 0.5) * dot);
				const pixel = context.getImageData(x, y, 1, 1)
					.data[0]!;
				if (pixel < 128 === dark) same++;
			}),
		);
		assert.strictEqual(same, matrix.length ** 2);
	});

	test('rounded dots follow their neighbours', function (assert) {
		const context = document
			.createElement('canvas')
			.getContext('2d')!;
		const inside = (path: Path2D, x: number, y: number) =>
			context.isPointInPath(path, x, y);
		const alone = dotPath('rounded', false, false, false, false);
		assert.false(inside(alone, 0.05, 0.05), 'alone: a dot');
		const row = dotPath('rounded', true, true, false, false);
		assert.true(inside(row, 0.05, 0.05), 'between two: a square');
		// left and top dark: the free corner is the bottom right
		const corner = dotPath('rounded', true, false, true, false);
		assert.true(inside(corner, 0.05, 0.05));
		assert.false(inside(corner, 0.97, 0.97));
	});
});
