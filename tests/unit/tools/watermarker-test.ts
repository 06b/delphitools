import { module, test } from 'qunit';
import {
	fileName,
	marks,
	paint,
	place,
	unitOf,
	type WatermarkSpec,
} from 'delphitools-v2/components/tools/watermarker/watermark';

const spec = (more: Partial<WatermarkSpec>): WatermarkSpec => ({
	kind: 'image',
	text: 'Watermark',
	fontSize: 48,
	colour: '#ffffff',
	scale: 10,
	opacity: 1,
	padding: 0,
	position: 'tl',
	random: { x: 0, y: 0 },
	tiling: false,
	blend: 'normal',
	...more,
});

function solid(colour: string, width: number, height: number) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d')!;
	context.fillStyle = colour;
	context.fillRect(0, 0, width, height);
	return canvas;
}

function pixel(context: CanvasRenderingContext2D, x: number, y: number) {
	return [...context.getImageData(x, y, 1, 1).data];
}

module('Unit | Tool | watermarker', function () {
	test('place: corners, centre and padding', function (assert) {
		const base = { width: 1000, height: 500 };
		const mark = { width: 200, height: 100 };
		const none = { x: 0, y: 0 };
		assert.deepEqual(place(base, mark, 'tl', 0, none), {
			x: 0,
			y: 0,
			width: 200,
			height: 100,
		});
		assert.deepEqual(place(base, mark, 'br', 10, none), {
			x: 700,
			y: 350,
			width: 200,
			height: 100,
		});
		const centre = place(base, mark, 'mc', 10, none);
		assert.deepEqual([centre.x, centre.y], [400, 200]);
		const random = place(base, mark, 'random', 10, { x: 1, y: 1 });
		assert.deepEqual([random.x, random.y], [700, 350]);
	});

	test('unitOf: the iOS 3072 px cap', function (assert) {
		assert.strictEqual(unitOf({ width: 1600, height: 1200 }), 1);
		assert.strictEqual(unitOf({ width: 6144, height: 4000 }), 2);
	});

	test('marks and the file name', function (assert) {
		assert.false(marks(spec({})));
		assert.true(marks(spec({ stamp: solid('#f00', 4, 4) })));
		assert.false(marks(spec({ kind: 'text', text: '' })));
		assert.true(marks(spec({ kind: 'text' })));
		assert.strictEqual(fileName('photo'), 'photo-watermarked.png');
		assert.strictEqual(fileName(''), 'image-watermarked.png');
	});

	test('paint: the stamp at its place, opacity and tiling', function (assert) {
		const size = { width: 100, height: 100 };
		const base = solid('#000', 100, 100);
		const stamp = solid('#f00', 10, 10);
		const target = solid('#fff', 100, 100).getContext('2d')!;

		paint(target, base, size, size, spec({ stamp }));
		assert.deepEqual(pixel(target, 5, 5), [255, 0, 0, 255]);
		assert.deepEqual(pixel(target, 50, 50), [0, 0, 0, 255]);

		paint(target, base, size, size, spec({ stamp, opacity: 0.5 }));
		const [half] = pixel(target, 5, 5);
		assert.true(Math.abs(half! - 128) < 8, `half red: ${half}`);

		const red = () => {
			const { data } = target.getImageData(0, 0, 100, 100);
			let count = 0;
			for (let i = 0; i < data.length; i += 4)
				if (data[i]! > 128) count++;
			return count;
		};
		paint(target, base, size, size, spec({ stamp }));
		const single = red();
		paint(target, base, size, size, spec({ stamp, tiling: true }));
		assert.true(red() > single, `tiles: ${red()} over ${single}`);
	});

	test('paint: half size output keeps the place', function (assert) {
		const base = solid('#000', 200, 200);
		const stamp = solid('#f00', 10, 10);
		const target = solid('#fff', 100, 100).getContext('2d')!;
		paint(
			target,
			base,
			{ width: 200, height: 200 },
			{ width: 100, height: 100 },
			spec({ stamp, position: 'br' }),
		);
		assert.deepEqual(pixel(target, 95, 95), [255, 0, 0, 255]);
		assert.deepEqual(pixel(target, 85, 85), [0, 0, 0, 255]);
	});
});
