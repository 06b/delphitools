import { module, test } from 'qunit';
import {
	centred,
	clamp,
	fileName,
	render,
	role,
	sizes,
} from 'delphitools-v2/components/tools/favicon-genny/favicon';

module('Unit | Tool | favicon-genny', function () {
	test('centred takes the largest square, or a given side', function (assert) {
		assert.deepEqual(centred(400, 200), {
			x: 100,
			y: 0,
			side: 200,
		});
		assert.deepEqual(centred(400, 200, 100), {
			x: 150,
			y: 50,
			side: 100,
		});
	});

	test('clamp keeps the square inside, whole and big enough', function (assert) {
		assert.deepEqual(
			clamp({ x: 350, y: -20, side: 90 }, 400, 200),
			{
				x: 310,
				y: 0,
				side: 90,
			},
		);
		assert.deepEqual(clamp({ x: 10, y: 10, side: 3 }, 400, 200), {
			x: 10,
			y: 10,
			side: 20,
		});
		assert.strictEqual(
			clamp({ x: 0, y: 0, side: 3 }, 100, 100).side,
			16,
		);
		assert.strictEqual(
			clamp({ x: 0, y: 0, side: 900 }, 400, 200).side,
			200,
		);
		assert.strictEqual(
			clamp({ x: 0, y: 0, side: 1 }, 10, 8).side,
			8,
		);
	});

	test('roles and names', function (assert) {
		assert.deepEqual(sizes.map(role), [
			'ICO',
			'ICO',
			'ICO',
			'ICO',
			undefined,
			'Apple Touch',
			'Android',
			'PWA',
		]);
		assert.strictEqual(fileName(32), 'favicon-32x32.png');
	});

	test('render writes every size as a PNG', function (assert) {
		const canvas = document.createElement('canvas');
		canvas.width = 40;
		canvas.height = 20;
		const icons = render(canvas, centred(40, 20));
		assert.deepEqual(
			icons.map((icon) => icon.size),
			sizes,
		);
		assert.true(
			icons.every((icon) =>
				icon.dataUrl.startsWith('data:image/png'),
			),
		);
	});
});
