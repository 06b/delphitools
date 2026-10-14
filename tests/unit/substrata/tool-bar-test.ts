import { module, test } from 'qunit';
import {
	arrangedTransforms,
	canArrange,
	isLit,
} from 'delphitools-v2/lib/substrata/arrange-ops';
import {
	draggedCrop,
	fittedCrop,
	localAspect,
} from 'delphitools-v2/lib/substrata/crop-ratio';
import {
	DEFAULT_ARTBOARD,
	createEmptyDoc,
	createRasterLayer,
	identityTransform,
} from 'delphitools-v2/lib/substrata/doc-model';
import {
	combineMask,
	featherMask,
	invertMask,
	rectMask,
	type PixelMask,
} from 'delphitools-v2/lib/substrata/select-mask';

const area = (m: PixelMask) => m.data.filter((v) => v >= 128).length;

module('Unit | Substrata | tool bar', function () {
	test('crop: fitted is the largest centred crop', function (assert) {
		assert.deepEqual(fittedCrop(1, { width: 800, height: 1000 }), {
			x: 0,
			y: 100,
			w: 800,
			h: 800,
		});
		assert.deepEqual(
			fittedCrop(16 / 9, { width: 800, height: 1000 }),
			{ x: 0, y: 275, w: 800, h: 450 },
		);
	});

	test('crop: the ratio follows the layer scale', function (assert) {
		const t = { ...identityTransform(), scaleX: 2, scaleY: 1 };
		assert.strictEqual(localAspect(1, t), 0.5);
	});

	test('crop: a free drag matches the web', function (assert) {
		const start = { x: 0, y: 0, w: 800, h: 1000 };
		const dims = { width: 800, height: 1000 };
		assert.deepEqual(draggedCrop(start, 1, 0, 500, 0, dims), {
			x: 0,
			y: 0,
			w: 500,
			h: 1000,
		});
		// clamped to the minimum side
		assert.deepEqual(draggedCrop(start, -1, 0, 900, 0, dims).w, 8);
	});

	test('crop: a ratio drag keeps the aspect', function (assert) {
		const start = { x: 0, y: 0, w: 800, h: 800 };
		const dims = { width: 800, height: 1000 };
		const corner = draggedCrop(start, 1, 1, 400, 900, dims, 1);
		assert.strictEqual(corner.w, corner.h, 'corner keeps 1:1');
		assert.deepEqual(corner, { x: 0, y: 0, w: 400, h: 400 });
		const side = draggedCrop(start, 1, 0, 400, 0, dims, 1);
		assert.deepEqual(side, { x: 0, y: 200, w: 400, h: 400 });
	});

	test('mask: Add takes the union, Remove the difference', function (assert) {
		const a = rectMask(10, 10, 0, 0, 5, 10);
		const b = rectMask(10, 10, 3, 0, 8, 10);
		assert.strictEqual(area(combineMask(a, b, false)), 80);
		assert.strictEqual(area(combineMask(a, b, true)), 30);
	});

	test('mask: feather softens the edge and keeps the middle', function (assert) {
		const m = rectMask(40, 40, 10, 10, 30, 30);
		const f = featherMask(m, 6);
		const at = (x: number, y: number) => f.data[y * 40 + x]!;
		assert.strictEqual(at(20, 20), 255, 'middle stays');
		const edge = at(10, 20);
		assert.true(edge > 40, 'edge is soft outside');
		assert.true(edge < 215, 'edge is soft inside');
		assert.strictEqual(at(0, 0), 0, 'far outside stays');
		assert.true(
			Math.abs(area(f) - area(m)) < 60,
			'half line holds',
		);
	});

	test('mask: invert keeps soft values', function (assert) {
		const m = {
			data: Uint8Array.from([0, 100, 255]),
			width: 3,
			height: 1,
		};
		assert.deepEqual([...invertMask(m).data], [255, 155, 0]);
	});

	test('arrange: align, distribute and flips', function (assert) {
		const doc = createEmptyDoc('t', {
			...DEFAULT_ARTBOARD,
			width: 1000,
			height: 500,
		});
		const layer = (x: number) =>
			createRasterLayer({
				name: 'r',
				blobHash: 'h',
				naturalWidth: 100,
				naturalHeight: 50,
				transform: {
					...identityTransform(),
					x,
					y: 100,
				},
			});
		const [a, b, c] = [layer(100), layer(300), layer(800)];
		doc.layers = [a, b, c];
		const ids = [a.id];
		assert.deepEqual(
			arrangedTransforms('alignRight', doc, ids).map(
				(e) => e.transform.x,
			),
			[950],
		);
		assert.false(
			canArrange('distributeHorizontally', doc, [a.id, b.id]),
		);
		assert.deepEqual(
			arrangedTransforms('distributeHorizontally', doc, [
				a.id,
				b.id,
				c.id,
			]).map((e) => e.transform.x),
			[100, 450, 800],
		);
		assert.false(isLit('flipHorizontal', doc, ids));
		a.transform = { ...a.transform, flipX: true };
		assert.true(isLit('flipHorizontal', doc, ids));
		assert.deepEqual(
			arrangedTransforms('rotateLeft', doc, ids).map(
				(e) => e.transform.angle,
			),
			[270],
		);
	});
});
