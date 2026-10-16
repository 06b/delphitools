import { module, test } from 'qunit';
import {
	crop,
	fileName,
	instagram,
	middle,
	platforms,
	sameRatio,
} from 'delphitools-v2/components/tools/social-cropper/crop';

const size = { width: 3000, height: 2000 };

module('Unit | Tool | social-cropper', function () {
	test('presets: positive, unique, one label per ratio, no x', function (assert) {
		const ratios = platforms.flatMap(({ ratios }) => ratios);
		assert.true(
			ratios.every(
				({ width, height }) => width > 0 && height > 0,
			),
		);
		assert.strictEqual(
			new Set(platforms.map(({ id }) => id)).size,
			platforms.length,
		);
		assert.true(
			platforms.every(
				({ ratios }) =>
					ratios.length > 0 &&
					new Set(
						ratios.map(
							({ label }) => label,
						),
					).size === ratios.length,
			),
		);
		assert.false(
			platforms.some(({ id }) =>
				['x', 'twitter'].includes(id),
			),
		);
		assert.deepEqual(
			instagram.ratios.map(({ label }) => label),
			['1:1', '3:4', '4:5', '1.91:1', '9:16'],
		);
	});

	test('the web presets survive', function (assert) {
		const labels = (id: string) =>
			platforms
				.find((p) => p.id === id)!
				.ratios.map(({ label }) => label);
		for (const label of ['1:1', '4:5', '1.91:1', '9:16'])
			assert.true(labels('instagram').includes(label), label);
		assert.deepEqual(labels('bluesky'), [
			'1:1',
			'16:9',
			'3:4',
			'2:1',
		]);
		assert.deepEqual(labels('threads'), [
			'1:1',
			'4:5',
			'1.91:1',
			'9:16',
		]);
	});

	test('crop: largest, centred, clamped', function (assert) {
		assert.deepEqual(crop(1, size, { x: 1500, y: 1000 }), {
			x: 500,
			y: 0,
			width: 2000,
			height: 2000,
		});
		assert.deepEqual(
			crop(1, size, { x: 2900, y: 0 }),
			{ x: 1000, y: 0, width: 2000, height: 2000 },
			'clamped',
		);
		assert.deepEqual(crop(2, size, { x: 1500, y: 1000 }), {
			x: 0,
			y: 250,
			width: 3000,
			height: 1500,
		});
		assert.deepEqual(
			crop(1, { width: 0, height: 10 }, { x: 0, y: 0 }),
			{
				x: 0,
				y: 0,
				width: 0,
				height: 0,
			},
		);
	});

	test('a ratio change keeps the centre; a platform keeps the name', function (assert) {
		const square = crop(1, size, { x: 1800, y: 1000 });
		assert.strictEqual(square.x, 800);
		const portrait = crop(3 / 4, size, middle(square));
		assert.deepEqual(portrait, {
			x: 1050,
			y: 0,
			width: 1500,
			height: 2000,
		});
		const bluesky = platforms.find(({ id }) => id === 'bluesky')!;
		const next = sameRatio(bluesky, instagram.ratios[1]!);
		assert.strictEqual(next.label, '3:4');
		assert.strictEqual(
			sameRatio(
				platforms.find(({ id }) => id === 'mastodon')!,
				next,
			).name,
			'Preview',
			'none of that name: the first',
		);
	});

	test('the export name', function (assert) {
		assert.strictEqual(
			fileName('photo', instagram, instagram.ratios[3]!),
			'photo-instagram-1.91:1.png',
		);
	});
});
