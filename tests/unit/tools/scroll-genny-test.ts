import { module, test } from 'qunit';
import {
	drawSlide,
	fileName,
	geometry,
	slices,
} from 'delphitools-v2/components/tools/scroll-genny/scroll';

const solid = (width: number, height: number) => {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d')!;
	context.fillStyle = '#0000ff';
	context.fillRect(0, 0, width, height);
	return canvas;
};

const red = (canvas: HTMLCanvasElement, x: number) =>
	canvas.getContext('2d')!.getImageData(x, 60, 1, 1).data[0];

// the iOS ScrollEngine.selfCheck cases
module('Unit | Tool | scroll-genny', function () {
	test('geometry: count rounds up, fill split evenly', function (assert) {
		const fills = geometry(3000, 1350, 0.8)!;
		assert.deepEqual(
			[
				fills.tileWidth,
				fills.slideCount,
				fills.needsFill,
				fills.imageStart,
			],
			[1080, 3, true, 120],
		);
		assert.deepEqual(slices(fills), [
			{
				sourceX: 0,
				sourceWidth: 960,
				drawX: 120,
				isFillEdge: true,
			},
			{
				sourceX: 960,
				sourceWidth: 1080,
				drawX: 0,
				isFillEdge: false,
			},
			{
				sourceX: 2040,
				sourceWidth: 960,
				drawX: 0,
				isFillEdge: true,
			},
		]);
		assert.false(geometry(3240, 1350, 0.8)!.needsFill, 'exact fit');
		assert.strictEqual(
			geometry(3241, 1350, 0.8)!.slideCount,
			4,
			'one pixel over is a slide more',
		);
		assert.strictEqual(geometry(0, 10, 1), undefined);
	});

	test('geometry: never crops', function (assert) {
		const over = geometry(3600, 1350, 0.8)!;
		assert.deepEqual([over.slideCount, over.imageStart], [4, 360]);
		assert.deepEqual(slices(over)[0], {
			sourceX: 0,
			sourceWidth: 720,
			drawX: 360,
			isFillEdge: true,
		});
		const square = geometry(3000, 2000, 1)!;
		assert.deepEqual(
			[square.slideCount, square.imageStart],
			[2, 500],
		);
		const narrow = geometry(300, 2000, 0.8)!;
		assert.deepEqual(slices(narrow), [
			{
				sourceX: 0,
				sourceWidth: 300,
				drawX: 650,
				isFillEdge: true,
			},
		]);
	});

	test('a slide: fill, then the image', function (assert) {
		const g = geometry(300, 135, 0.8)!;
		const first = drawSlide(solid(300, 135), g, 0, [255, 0, 0]);
		assert.deepEqual([first.width, first.height], [108, 135]);
		assert.strictEqual(red(first, 2), 255, 'fill at the edge');
		assert.strictEqual(red(first, 60), 0, 'image inside');
		const alone = drawSlide(
			solid(30, 135),
			geometry(30, 135, 0.8)!,
			0,
			[255, 0, 0],
		);
		assert.deepEqual(
			[red(alone, 2), red(alone, 50), red(alone, 100)],
			[255, 0, 255],
			'a sliver sits in one slide, fill either side',
		);
	});

	test('a smaller copy draws at its own scale', function (assert) {
		const slide = drawSlide(
			solid(150, 67),
			geometry(300, 135, 0.8)!,
			1,
			'blur',
		);
		assert.deepEqual([slide.width, slide.height], [54, 67]);
	});

	test('file names follow the web tool', function (assert) {
		assert.strictEqual(fileName('pano', 0), 'pano-scroll-1.png');
	});
});
