import { module, test } from 'qunit';
import {
	areaRatio,
	closest,
	decimal,
	dimensions,
	eighths,
	frames,
	gap,
	matches,
	mediaBox,
	named,
	pageQuery,
	parseQuery,
	ratio,
	signed,
	type PaperQuery,
	type Rect,
} from 'delphitools-v2/components/tools/paper-sizes/paper';

const inside = (outer: Rect, r: Rect) =>
	r.x >= outer.x - 0.001 &&
	r.y >= outer.y - 0.001 &&
	r.x + r.width <= outer.x + outer.width + 0.001 &&
	r.y + r.height <= outer.y + outer.height + 0.001;

const size = (id: string) => named(id)!.size;

module('Unit | Tool | paper-sizes', function () {
	test('ratios of rounded standard sizes snap within 0.5 %', function (assert) {
		const [a3, a4, a5] = [size('A3'), size('A4'), size('A5')];
		assert.notStrictEqual(
			areaRatio(a4, a5),
			2,
			'the raw ratio is not 2',
		);
		assert.strictEqual(ratio(areaRatio(a4, a5)), '2', 'A4 over A5');
		assert.strictEqual(
			ratio(areaRatio(a5, a4)),
			'2',
			'either order',
		);
		assert.strictEqual(ratio(124740 / 31080), '4');
		assert.strictEqual(
			ratio(64130 / 62370),
			'1.03',
			'no snap past 0.5 %',
		);
		assert.strictEqual(ratio(areaRatio(a3, a3)), '1');
	});

	test('sheets to one scale in each arrangement', function (assert) {
		const area = { x: 0, y: 0, width: 400, height: 500 };
		const a4 = { width: 210, height: 297 };
		const a3 = { width: 297, height: 420 };
		const [s0, s1] = frames([a4, a3], 'stacked', area) as [
			Rect,
			Rect,
		];
		assert.strictEqual(s0.x, s1.x, 'stacked: one start edge');
		assert.strictEqual(
			s0.y + s0.height,
			s1.y + s1.height,
			'one base line',
		);
		assert.true(
			Math.abs(s1.width / s0.width - 297 / 210) < 1e-9,
			'one scale',
		);
		const [b0, b1] = frames([a4, a3], 'sideBySide', area) as [
			Rect,
			Rect,
		];
		assert.true(
			Math.abs(b1.x - (b0.x + b0.width) - gap) < 0.001,
			'side by side: the gap',
		);
		assert.strictEqual(b0.y + b0.height, b1.y + b1.height);
		assert.true([b0, b1].every((r) => inside(area, r)));
		const [c0, c1] = frames([a4, a3], 'aboveBelow', area) as [
			Rect,
			Rect,
		];
		assert.true(
			Math.abs(c1.y - (c0.y + c0.height) - gap) < 0.001,
			'above and below: first on top',
		);
		assert.true([c0, c1].every((r) => inside(area, r)));
		const [small] = frames(
			[{ width: 10, height: 10 }],
			'sideBySide',
			area,
		) as [Rect];
		assert.true(small.width < 30, 'never scaled past A4');
		assert.deepEqual(frames([], 'stacked', area), []);
	});

	test('queries', function (assert) {
		assert.deepEqual(parseQuery('  '), { kind: 'none' });
		assert.deepEqual(parseQuery('A4'), {
			kind: 'name',
			text: 'a4',
		});
		assert.deepEqual(parseQuery('210x297'), {
			kind: 'size',
			width: 210,
			height: 297,
		});
		const comma = parseQuery('8,5 × 11') as Extract<
			PaperQuery,
			{ kind: 'size' }
		>;
		assert.strictEqual(comma.kind, 'size');
		assert.true(
			Math.abs(comma.width - 215.9) < 1e-9,
			'a decimal comma, small numbers are inches',
		);
		assert.true(Math.abs(comma.height - 279.4) < 1e-9);
		const px = parseQuery('2480x3508 @300dpi') as Extract<
			PaperQuery,
			{ kind: 'size' }
		>;
		assert.strictEqual(px.kind, 'size');
		assert.true(Math.abs(px.width - 209.97) < 0.01);
		assert.strictEqual(px.dpi, 300);
		assert.strictEqual(
			closest(297, 210)[0]!.pick.size.name,
			'A4',
			'either way up',
		);
		assert.strictEqual(
			closest(215.9, 279.4)[0]!.pick.size.name,
			'Letter',
		);
		assert.strictEqual(
			closest(216, 279)[0]!.pick.size.name,
			'ANSI A',
		);
		assert.true(matches(parseQuery('jis'), named('jb4')!));
		assert.false(matches(parseQuery('jis'), named('A4')!));
		assert.strictEqual(signed(-3.4), '−3');
		assert.strictEqual(signed(12.6), '+13');
		assert.strictEqual(signed(0.2), '0');
	});

	test('units', function (assert) {
		const a4 = named('A4')!.size;
		const letter = named('letter')!.size;
		assert.strictEqual(dimensions(a4, 0, 300), '210 × 297 mm');
		assert.strictEqual(
			dimensions(letter, 0, 300),
			'215.9 × 279.4 mm',
		);
		assert.strictEqual(dimensions(a4, 1, 300), '8.27 × 11.69 in');
		assert.strictEqual(dimensions(letter, 2, 300), '8½ × 11″');
		assert.strictEqual(dimensions(a4, 2, 300), '≈ 8¼ × 11¾″');
		assert.strictEqual(dimensions(a4, 3, 300), '595.3 × 841.9 pt');
		assert.strictEqual(dimensions(a4, 4, 300), '2480 × 3508 px');
		assert.deepEqual(eighths(0.375), { text: '⅜', exact: true });
		assert.strictEqual(decimal(11), '11');
		assert.strictEqual(decimal(8.268), '8.27');
	});

	test('pdf page size', function (assert) {
		assert.deepEqual(
			mediaBox(
				'<< /Type /Page /MediaBox [0 0 595.28 841.89] >>',
			),
			[595.28, 841.89],
		);
		assert.strictEqual(mediaBox('<< /Type /Page >>'), undefined);
		assert.strictEqual(pageQuery([595.28, 841.89]), '210x297mm');
	});
});
