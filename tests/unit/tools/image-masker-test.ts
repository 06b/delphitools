import { module, test } from 'qunit';
import { MASK_SHAPES, VARIANTS } from 'delphitools-v2/lib/mask-shapes';
import {
	clipRect,
	covers,
	families,
	familyIndex,
	fileName,
	imageFrame,
	inFamily,
	paint,
	side,
	trimmed,
} from 'delphitools-v2/components/tools/image-masker/mask';

const view = { zoom: 1, x: 0, y: 0 };

module('Unit | Tool | image-masker', function () {
	test('side: the short side over the zoom, scaled, clamped', function (assert) {
		const pixels = { width: 3000, height: 2000 };
		assert.strictEqual(side(undefined, 1, 1), 1024);
		assert.strictEqual(side(pixels, 1, 1), 2000);
		assert.strictEqual(side(pixels, 2, 3), 3000);
		assert.strictEqual(side(pixels, 8, 0.5), 125);
		assert.strictEqual(side(pixels, 0.1, 3), 8192, 'web cap');
		assert.strictEqual(
			side({ width: 10, height: 10 }, 8, 0.5),
			16,
			'floor',
		);
	});

	test('imageFrame: cover, zoom and offset in sides', function (assert) {
		assert.deepEqual(
			imageFrame({ width: 2, height: 1 }, 100, {
				zoom: 1,
				x: 0.25,
				y: 0,
			}),
			{ x: -25, y: 0, width: 200, height: 100 },
		);
		const out = imageFrame({ width: 1, height: 1 }, 100, {
			zoom: 0.5,
			x: 0,
			y: 0,
		});
		assert.deepEqual(out, { x: 25, y: 25, width: 50, height: 50 });
		assert.false(covers(out, 100));
		assert.true(
			covers(
				imageFrame({ width: 1, height: 1 }, 100, view),
				100,
			),
		);
	});

	test('families: every shape once, variants in order', function (assert) {
		assert.strictEqual(
			families.length * VARIANTS,
			MASK_SHAPES.length,
		);
		assert.true(
			families.every(
				({ shapes }) => shapes.length === VARIANTS,
			),
		);
		const heart = families.find(({ name }) => name === 'heart')!;
		assert.strictEqual(heart.title, 'Heart');
		assert.deepEqual(
			heart.shapes.slice(0, 3).map(({ label }) => label),
			['Heart 1', 'Heart 2', 'Heart 3'],
		);
	});

	test('inFamily keeps the variant number', function (assert) {
		const gear = families.findIndex(({ name }) => name === 'gear');
		const heart5 = MASK_SHAPES.find(({ id }) => id === 'heart-5')!;
		const moved = inFamily(heart5, gear);
		assert.strictEqual(moved.id, 'gear-5');
		assert.strictEqual(familyIndex(moved), gear);
	});

	test('fileName: image stem and cut', function (assert) {
		assert.strictEqual(
			fileName('photo', 'heart-1'),
			'photo-heart-1.png',
		);
		assert.strictEqual(
			fileName(undefined, 'notch'),
			'mask-notch.png',
		);
	});

	test('paint: grey inside the cut past the image, clear outside', function (assert) {
		const canvas = document.createElement('canvas');
		canvas.width = 100;
		canvas.height = 100;
		const context = canvas.getContext('2d', {
			willReadFrequently: true,
		})!;
		const red = document.createElement('canvas');
		red.width = 10;
		red.height = 10;
		const redContext = red.getContext('2d')!;
		redContext.fillStyle = '#f00';
		redContext.fillRect(0, 0, 10, 10);
		const circle = {
			id: 'c',
			label: 'C',
			d: 'M0 50A50 50 0 1 0 100 50A50 50 0 1 0 0 50Z',
		};
		paint(context, 100, circle, red, { zoom: 0.5, x: 0, y: 0 });
		const at = (x: number, y: number) => [
			...context.getImageData(x, y, 1, 1).data,
		];
		assert.strictEqual(at(1, 1)[3], 0, 'corner outside the circle');
		assert.deepEqual(
			at(50, 50),
			[255, 0, 0, 255],
			'centre is the image',
		);
		assert.deepEqual(
			at(50, 10),
			[154, 154, 154, 255],
			'grey past the image',
		);
	});

	test('clipRect: the square is whole, a half-width cut is clipped', function (assert) {
		assert.deepEqual(clipRect('square', 400), {
			x: 0,
			y: 0,
			width: 400,
			height: 400,
		});
		const half = {
			...MASK_SHAPES[0]!,
			d: 'M25 0H75V100H25Z',
		};
		assert.deepEqual(clipRect(half, 400), {
			x: 100,
			y: 0,
			width: 200,
			height: 400,
		});
		assert.deepEqual(
			clipRect(half, 2048),
			{ x: 512, y: 0, width: 1024, height: 2048 },
			'probed at 1024, scaled',
		);
	});

	test('trimmed: drops the clear margin', function (assert) {
		const canvas = document.createElement('canvas');
		canvas.width = 50;
		canvas.height = 40;
		canvas.getContext('2d')!.fillRect(10, 5, 20, 15);
		const out = trimmed(canvas);
		assert.deepEqual([out.width, out.height], [20, 15]);
		const full = document.createElement('canvas');
		full.width = 8;
		full.height = 8;
		full.getContext('2d')!.fillRect(0, 0, 8, 8);
		assert.strictEqual(trimmed(full), full, 'nothing to trim');
	});
});
