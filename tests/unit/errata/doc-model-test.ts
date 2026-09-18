import { module, test } from 'qunit';
import {
	applyMatrix,
	blankPage,
	contentPlacement,
	displayedToUnrotated,
	displayedToUser,
	pageSize,
	rotateAnchor,
	rotatePage,
	tileTransform,
	totalRotation,
	unrotatedToDisplayed,
	withCrop,
	withResize,
	type Rotation,
} from 'delphitools-v2/lib/errata/doc-model';
import { ANCHORS } from 'delphitools-v2/lib/pdf-stamp';

module('Unit | errata | doc-model', function () {
	test('displayedToUser maps the four page corners', function (assert) {
		const w = 600;
		const h = 800;
		// top-left of the displayed page for each rotation
		const cases: Record<Rotation, [number, number]> = {
			0: [0, h],
			90: [0, 0],
			180: [w, 0],
			270: [w, h],
		};
		for (const r of [0, 90, 180, 270] as const) {
			const p = displayedToUser(0, 0, r, w, h);
			assert.deepEqual([p.x, p.y], cases[r], `rotation ${r}`);
		}
		// centre stays the centre
		const c0 = displayedToUser(w / 2, h / 2, 0, w, h);
		const c90 = displayedToUser(h / 2, w / 2, 90, w, h);
		assert.deepEqual([c0.x, c0.y], [w / 2, h / 2]);
		assert.deepEqual([c90.x, c90.y], [w / 2, h / 2]);
	});

	test('rotatePage swaps size and carries objects', function (assert) {
		const page = {
			...blankPage(600, 800),
			objects: [
				{
					id: 'a',
					kind: 'text' as const,
					cx: 100,
					cy: 50,
					w: 10,
					h: 10,
					scaleX: 1,
					scaleY: 1,
					angle: 0,
					text: 'x',
					fontSize: 12,
					colour: '#000',
				},
			],
		};
		const cw = rotatePage(page, 1);
		assert.strictEqual(totalRotation(cw), 90);
		assert.deepEqual(pageSize(cw), { width: 800, height: 600 });
		assert.deepEqual(
			[
				cw.objects[0]!.cx,
				cw.objects[0]!.cy,
				cw.objects[0]!.angle,
			],
			[750, 100, 90],
		);
		const back = rotatePage(cw, -1);
		assert.strictEqual(totalRotation(back), 0);
		assert.deepEqual(
			[
				back.objects[0]!.cx,
				back.objects[0]!.cy,
				back.objects[0]!.angle,
			],
			[100, 50, 0],
		);
		const full = rotatePage(rotatePage(rotatePage(cw, 1), 1), 1);
		assert.strictEqual(totalRotation(full), 0);
		assert.deepEqual(
			[full.objects[0]!.cx, full.objects[0]!.cy],
			[100, 50],
		);
	});
});

module('Unit | errata | doc-model | resize and crop', function () {
	const base = () => blankPage(400, 600);

	test('contentPlacement per mode', function (assert) {
		const page = base();
		const anchor = {
			...page,
			resize: {
				width: 800,
				height: 800,
				mode: 'anchor' as const,
				anchor: 'bottom-right' as const,
			},
		};
		assert.deepEqual(contentPlacement(anchor), {
			x: 400,
			y: 200,
			scale: 1,
		});
		const fit = {
			...anchor,
			resize: { ...anchor.resize, mode: 'fit' as const },
		};
		const pf = contentPlacement(fit);
		assert.strictEqual(pf.scale, 800 / 600);
		assert.strictEqual(
			Math.round(pf.x),
			Math.round((800 - 400 * pf.scale) / 2),
		);
		assert.strictEqual(pf.y, 0);
		const fill = {
			...anchor,
			resize: { ...anchor.resize, mode: 'fill' as const },
		};
		const pl = contentPlacement(fill);
		assert.strictEqual(pl.scale, 2);
		assert.strictEqual(pl.x, 0);
		assert.strictEqual(pl.y, (800 - 1200) / 2);
		assert.deepEqual(pageSize(fit), { width: 800, height: 800 });
		assert.deepEqual(pageSize(rotatePage(fit, 1)), {
			width: 800,
			height: 800,
		});
	});

	test('bleed keeps the content on the trim box', function (assert) {
		const page = {
			...base(),
			resize: {
				width: 400 + 20,
				height: 600 + 20,
				mode: 'anchor' as const,
				anchor: 'top-left' as const,
				bleed: 10,
			},
		};
		assert.deepEqual(contentPlacement(page), {
			x: 10,
			y: 10,
			scale: 1,
		});
		const fit = {
			...page,
			resize: {
				...page.resize,
				width: 820,
				height: 620,
				mode: 'fit' as const,
			},
		};
		const p = contentPlacement(fit);
		assert.strictEqual(p.scale, 1);
		assert.deepEqual([p.x, p.y], [10 + 200, 10]);
	});

	test('rotateAnchor', function (assert) {
		assert.strictEqual(rotateAnchor('top-left', 1), 'top-right');
		assert.strictEqual(rotateAnchor('top-left', 2), 'bottom-right');
		assert.strictEqual(rotateAnchor('top-left', -1), 'bottom-left');
		assert.strictEqual(
			rotateAnchor('middle-center', 3),
			'middle-center',
		);
		for (const a of ANCHORS)
			assert.strictEqual(
				rotateAnchor(rotateAnchor(a, 1), -1),
				a,
			);
	});

	test('displayed and unrotated round trip', function (assert) {
		for (const r of [0, 90, 180, 270] as const) {
			const disp = unrotatedToDisplayed(30, 70, r, 400, 600);
			const back = displayedToUnrotated(
				disp.x,
				disp.y,
				r,
				400,
				600,
			);
			assert.deepEqual(
				[back.x, back.y],
				[30, 70],
				`rotation ${r}`,
			);
		}
		// 90 cw: the unrotated top-left corner lands at the displayed top-right
		assert.deepEqual(unrotatedToDisplayed(0, 0, 90, 400, 600), {
			x: 600,
			y: 0,
		});
	});

	test('objects follow the content through resize and crop', function (assert) {
		const obj = {
			id: 'o',
			kind: 'text' as const,
			cx: 200,
			cy: 300,
			w: 10,
			h: 10,
			scaleX: 1,
			scaleY: 1,
			angle: 0,
			text: 'x',
			fontSize: 12,
			colour: '#000',
		};
		const page = { ...base(), objects: [obj] };
		// fit onto a square: content scales by 800/600, centred
		const fit = withResize(page, {
			width: 800,
			height: 800,
			mode: 'fit',
			anchor: 'top-left',
		});
		const o = fit.objects[0]!;
		assert.strictEqual(Math.round(o.cx), 400);
		assert.strictEqual(Math.round(o.cy), 400);
		assert.strictEqual(o.scaleX, 800 / 600);
		// back to no resize restores the original position
		const back = withResize(fit, null);
		assert.strictEqual(Math.round(back.objects[0]!.cx), 200);
		assert.strictEqual(Math.round(back.objects[0]!.cy), 300);
		assert.strictEqual(
			Math.round(back.objects[0]!.scaleX * 1000),
			1000,
		);
		// crop: the object keeps its place relative to the content
		const cropped = withCrop(page, {
			x: 100,
			y: 100,
			width: 200,
			height: 400,
		});
		assert.deepEqual(pageSize(cropped), {
			width: 200,
			height: 400,
		});
		assert.deepEqual(
			[cropped.objects[0]!.cx, cropped.objects[0]!.cy],
			[100, 200],
		);
		// crop on a rotated page: same content point
		const rotated = rotatePage(page, 1);
		const rc = withCrop(rotated, {
			x: 100,
			y: 100,
			width: 200,
			height: 400,
		});
		const expect = unrotatedToDisplayed(100, 200, 90, 200, 400);
		assert.deepEqual(
			[
				Math.round(rc.objects[0]!.cx),
				Math.round(rc.objects[0]!.cy),
			],
			[Math.round(expect.x), Math.round(expect.y)],
		);
	});
});

module('Unit | errata | doc-model | tiles', function () {
	test('tileTransform maps source points into tile pixels', function (assert) {
		const page = blankPage(400, 600);
		const full = { x: 0, y: 0, width: 400, height: 600 };
		const m0 = tileTransform(page, full, 2);
		assert.deepEqual(applyMatrix(m0, 10, 20), { x: 20, y: 40 });
		// rotated 90: the source top-left lands at the displayed top-right
		const r = rotatePage(page, 1);
		const m90 = tileTransform(
			r,
			{ x: 0, y: 0, width: 600, height: 400 },
			1,
		);
		assert.deepEqual(applyMatrix(m90, 0, 0), { x: 600, y: 0 });
		assert.deepEqual(applyMatrix(m90, 400, 0), { x: 600, y: 400 });
		// a region offset shifts the origin
		const mr = tileTransform(
			page,
			{ x: 100, y: 50, width: 10, height: 10 },
			3,
		);
		assert.deepEqual(applyMatrix(mr, 100, 50), { x: 0, y: 0 });
		// resize fit onto a square doubles nothing but scales by 800/600 and centres
		const fit = withResize(page, {
			width: 800,
			height: 800,
			mode: 'fit',
			anchor: 'top-left',
		});
		const mf = tileTransform(
			fit,
			{ x: 0, y: 0, width: 800, height: 800 },
			1,
		);
		const s = 800 / 600;
		const p = applyMatrix(mf, 0, 0);
		assert.strictEqual(
			Math.round(p.x),
			Math.round((800 - 400 * s) / 2),
		);
		assert.strictEqual(p.y, 0);
	});
});
