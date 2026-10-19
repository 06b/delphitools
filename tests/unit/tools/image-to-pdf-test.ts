import { module, test } from 'qunit';
import {
	blankPage,
	layout,
	sortedByName,
	type Options,
} from 'delphitools-v2/components/tools/image-to-pdf/layout';

const A4: Options = {
	sizeId: 'a4',
	orientation: 'auto',
	fit: 'contain',
	marginMm: 10,
	bleed: false,
};

const BLEED_PT = (3 * 72) / 25.4;

module('Unit | Tool | image-to-pdf', function () {
	test('a wide image turns the page and sits inside the margin', function (assert) {
		const { page, area, placement } = layout(4000, 3000, A4);
		assert.true(page.width > page.height);
		assert.true(area.x > 28);
		assert.true(placement.x >= area.x);
		assert.true(placement.y >= area.y);
		assert.true(
			placement.x + placement.width <=
				area.x + area.width + 1e-6,
		);
		assert.true(
			placement.y + placement.height <=
				area.y + area.height + 1e-6,
		);
	});

	test('fill overflows the area; match sizes the page to the image', function (assert) {
		const cover = layout(4000, 1000, { ...A4, fit: 'cover' });
		assert.true(cover.placement.width > cover.area.width);
		const match = layout(400, 200, { ...A4, sizeId: 'match' });
		assert.strictEqual(
			Math.round(match.page.width - match.area.width),
			Math.round(match.area.x * 2),
		);
		assert.strictEqual(match.placement.width, match.area.width);
	});

	test('the blank page is the chosen paper, A4 portrait when matching', function (assert) {
		const landscape = blankPage({
			...A4,
			orientation: 'landscape',
		});
		assert.true(landscape.size.width > landscape.size.height);
		const matching = blankPage({
			...A4,
			sizeId: 'match',
			orientation: 'landscape',
		});
		assert.strictEqual(Math.round(matching.size.width), 595);
		assert.strictEqual(Math.round(matching.size.height), 842);
	});

	test('bleed grows the page 3 mm a side round an unchanged trim', function (assert) {
		const plain = layout(3000, 4000, A4);
		const bled = layout(3000, 4000, { ...A4, bleed: true });
		assert.strictEqual(
			bled.page.width,
			plain.page.width + BLEED_PT * 2,
		);
		assert.strictEqual(bled.trim.x, BLEED_PT);
		assert.strictEqual(bled.trim.width, plain.page.width);
		assert.strictEqual(bled.trim.height, plain.page.height);
		// the margin counts from the trim
		assert.strictEqual(
			Math.round((bled.area.x - BLEED_PT) * 100),
			Math.round(plain.area.x * 100),
		);
		assert.strictEqual(plain.trim.x, 0);
	});

	test('with no margin a filling image runs into the bleed', function (assert) {
		const fill = layout(3000, 4000, {
			...A4,
			marginMm: 0,
			fit: 'cover',
			bleed: true,
		});
		assert.deepEqual(fill.area, {
			x: 0,
			y: 0,
			width: fill.page.width,
			height: fill.page.height,
		});
		assert.true(fill.placement.x <= 0);
		assert.true(fill.placement.y <= 0);
		const match = layout(400, 200, {
			...A4,
			sizeId: 'match',
			marginMm: 0,
			bleed: true,
		});
		assert.true(match.placement.width >= match.page.width);
		assert.true(match.placement.height >= match.page.height);
	});

	test('names sort in numeric order, case aside', function (assert) {
		const items = [
			'page10.png',
			'Page2.png',
			'page1.png',
			'cover.jpg',
		].map((name) => ({ name }));
		assert.deepEqual(
			sortedByName(items, true).map((i) => i.name),
			['cover.jpg', 'page1.png', 'Page2.png', 'page10.png'],
		);
		assert.deepEqual(
			sortedByName(items, false).map((i) => i.name),
			['page10.png', 'Page2.png', 'page1.png', 'cover.jpg'],
		);
	});
});
