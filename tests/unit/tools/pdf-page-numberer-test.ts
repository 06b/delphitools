import { module, test } from 'qunit';
import {
	byStart,
	clampStart,
	fitSections,
	parseSections,
	section,
	sectionAt,
	sectionLabels,
	splitAt,
} from 'delphitools-v2/components/tools/pdf-page-numberer/sections';
import {
	numberLines,
	stampOf,
	unitWidth,
	watermarkAt,
	type StampOptions,
} from 'delphitools-v2/components/tools/pdf-page-numberer/stamp';

const options = (more: Partial<StampOptions>): StampOptions => ({
	numbersOn: true,
	template: '{n} / {N}',
	numberAnchor: 'bottom-center',
	font: 'sans',
	fontSize: 11,
	margin: 24,
	stampOn: false,
	stampText: '',
	stampAnchor: 'top-right',
	stampMode: 'label',
	opacity: 0.15,
	sections: [section()],
	...more,
});

module('Unit | Tool | pdf-page-numberer', function () {
	test('sectionAt finds the section numbering a page', function (assert) {
		const a = section(2, 'roman-lower');
		const b = section(4);
		assert.strictEqual(sectionAt([b, a], 1), undefined);
		assert.strictEqual(sectionAt([b, a], 3), a);
		assert.strictEqual(sectionAt([b, a], 9), b);
	});

	test('splitAt takes the first free start and the split style', function (assert) {
		const first = section(1, 'roman-upper');
		const added = splitAt([first], 1, 3);
		assert.strictEqual(added?.fromPage, 2);
		assert.strictEqual(added?.style, 'roman-upper');
		assert.strictEqual(splitAt([first], 3, 3)?.fromPage, 3);
		assert.strictEqual(
			splitAt([first, section(2), section(3)], 2, 3),
			undefined,
		);
	});

	test('clampStart keeps starts unique', function (assert) {
		const ordered = byStart([section(5), section(1), section(3)]);
		assert.strictEqual(clampStart(ordered, 1, 1, 9), 2);
		assert.strictEqual(clampStart(ordered, 1, 7, 9), 4);
		assert.strictEqual(clampStart(ordered, 2, 20, 9), 9);
		assert.strictEqual(clampStart(ordered, 0, 0, 9), 1);
	});

	test('fitSections drops sections past the end', function (assert) {
		const kept = fitSections([section(1), section(6)], 3);
		assert.deepEqual(
			kept.map((s) => s.fromPage),
			[1],
		);
		assert.strictEqual(
			fitSections([section(8)], 3)[0]?.fromPage,
			1,
		);
	});

	test('parseSections reads the iOS flag', function (assert) {
		const parsed = parseSections('2:roman-lower,4:arabic:5,x:nope');
		assert.deepEqual(
			parsed.map((s) => [s.fromPage, s.style, s.startAt]),
			[
				[2, 'roman-lower', 1],
				[4, 'arabic', 5],
			],
		);
	});

	test('sectionLabels reads pages and the first numerals', function (assert) {
		const ordered = [
			section(1, 'roman-lower'),
			section(5, 'arabic', 3),
			section(6, 'alpha-upper'),
		];
		assert.deepEqual(sectionLabels(ordered, 9), [
			'p. 1–4 · i, ii, iii',
			'p. 5 · 3, 4, 5',
			'p. 6–9 · A, B, C',
		]);
	});

	test('numberLines expands the template where numbers are on', function (assert) {
		const sections = [section(2, 'roman-lower')];
		assert.deepEqual(numberLines(options({ sections }), 3), [
			null,
			'i / 3',
			'ii / 3',
		]);
		assert.deepEqual(
			numberLines(options({ sections, numbersOn: false }), 2),
			[null, null],
		);
	});

	test('stampOf skips blank stamps', function (assert) {
		assert.strictEqual(
			stampOf(options({ stampOn: true, stampText: '  ' })),
			null,
		);
		assert.strictEqual(
			stampOf(options({ stampText: 'DRAFT' })),
			null,
		);
		assert.strictEqual(
			stampOf(options({ stampOn: true, stampText: 'DRAFT' })),
			'DRAFT',
		);
	});

	test('a long watermark on A4 stays inside the page', function (assert) {
		const [w, h] = [595.28, 841.89];
		const text = 'CONFIDENTIAL DRAFT COPY';
		const k = Math.SQRT1_2;
		for (const font of ['sans', 'serif', 'mono'] as const) {
			const { x, y, size } = watermarkAt(w, h, text, font);
			const run = unitWidth(text, font) * size;
			// baseline frame: descender to ascender
			const corners = [
				[0, -0.25 * size],
				[run, -0.25 * size],
				[0, 0.75 * size],
				[run, 0.75 * size],
			].map(([u, v]) => [
				x + (u! - v!) * k,
				y + (u! + v!) * k,
			]);
			const inside = corners.every(
				([cx, cy]) =>
					cx! >= 0 &&
					cx! <= w &&
					cy! >= 0 &&
					cy! <= h,
			);
			assert.true(
				inside,
				`${font}: ${JSON.stringify(corners)}`,
			);
			const spread =
				Math.max(...corners.map((c) => c[0]!)) -
				Math.min(...corners.map((c) => c[0]!));
			assert.true(
				spread > 0.7 * w,
				`${font} fills: ${spread}`,
			);
		}
	});

	test('unitWidth reads the export font metrics', function (assert) {
		assert.strictEqual(unitWidth('MMMM', 'mono'), 2.4);
		assert.strictEqual(unitWidth('W', 'sans').toFixed(3), '0.944');
		assert.strictEqual(
			unitWidth('\u{1F600}', 'sans'),
			unitWidth('?', 'sans'),
		);
	});
});
