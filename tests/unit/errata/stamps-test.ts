import { module, test } from 'qunit';
import {
	blankPage,
	type TextObject,
} from 'delphitools-v2/lib/errata/doc-model';
import {
	addStamped,
	pageNumberObjects,
	scopePages,
	STAMP_RED,
	stampObjects,
	textWidth,
	watermarkObjects,
} from 'delphitools-v2/lib/errata/stamps';
import { store } from 'delphitools-v2/lib/errata/store';

const doc = () => ({
	name: 't',
	pages: [blankPage(400, 500), blankPage(400, 500), blankPage(600, 300)],
});

module('Unit | errata | stamps', function () {
	test('scopePages', function (assert) {
		assert.deepEqual(scopePages('all', '', 3, 1), [0, 1, 2]);
		assert.deepEqual(scopePages('current', '', 3, 1), [1]);
		assert.deepEqual(scopePages('current', '', 2, 2), []);
		assert.deepEqual(
			scopePages('range', '3, 1-2, 2', 3, 0),
			[0, 1, 2],
		);
		assert.strictEqual(scopePages('range', '4', 3, 0), null);
		assert.strictEqual(scopePages('range', '', 3, 0), null);
	});

	test('page numbers sit on the anchor with the export baseline', function (assert) {
		const [item] = pageNumberObjects(
			doc(),
			[1],
			'{n} / {N}',
			'bottom-center',
			10,
		);
		const o = item!.object as TextObject;
		assert.strictEqual(item!.index, 1);
		assert.strictEqual(o.text, '2 / 3');
		assert.strictEqual(o.w, textWidth('2 / 3', 10));
		assert.strictEqual(o.cx, 200);
		// baseline 24pt above bottom
		const baseline = o.cy - o.h / 2 + 10 * 1.13 * 0.778;
		assert.true(
			Math.abs(baseline - (500 - 24)) < 1e-9,
			String(baseline),
		);
		assert.deepEqual(
			pageNumberObjects(doc(), [0], ' ', 'top-left', 10),
			[],
		);
	});

	test('watermark spans 80% of the page one way, at most the other', function (assert) {
		const items = watermarkObjects(
			doc(),
			[0, 2],
			'DRAFT',
			0.15,
			-45,
		);
		assert.strictEqual(items.length, 2);
		for (const { index, object } of items) {
			const o = object as TextObject;
			const page = doc().pages[index]!;
			const t = Math.PI / 4;
			const bw = o.w * Math.cos(t) + o.h * Math.sin(t);
			const bh = o.w * Math.sin(t) + o.h * Math.cos(t);
			assert.true(bw <= page.baseWidth * 0.8 + 1e-6);
			assert.true(bh <= page.baseHeight * 0.8 + 1e-6);
			const slack = Math.min(
				Math.abs(bw - page.baseWidth * 0.8),
				Math.abs(bh - page.baseHeight * 0.8),
			);
			assert.true(slack < 1e-6, String(slack));
			assert.strictEqual(o.angle, -45);
			assert.strictEqual(o.opacity, 0.15);
			assert.strictEqual(o.cx, page.baseWidth / 2);
		}
	});

	test('stamps take colour and bold, measured in bold', function (assert) {
		const [item] = stampObjects(
			doc(),
			[0],
			'Seen ok',
			'bottom-left',
			24,
			'#0550ae',
			true,
		);
		const o = item!.object as TextObject;
		assert.strictEqual(o.colour, '#0550ae');
		assert.true(o.bold);
		assert.strictEqual(o.w, textWidth('Seen ok', 24, true));
		assert.true(o.w > textWidth('Seen ok', 24));
		assert.strictEqual(o.cx - o.w / 2, 24);
		const plain = stampObjects(doc(), [0], 'X', 'top-left', 24)[0]!
			.object as TextObject;
		assert.strictEqual(plain.colour, STAMP_RED);
		assert.false('bold' in plain);
		assert.deepEqual(
			stampObjects(doc(), [0, 1], ' ', 'top-left', 24),
			[],
		);
	});

	test('addStamped is one undo step', function (assert) {
		store.setDoc(doc());
		addStamped(watermarkObjects(doc(), [0, 1, 2], 'X', 0.2, 0));
		assert.deepEqual(
			store.getSnapshot()!.pages.map((p) => p.objects.length),
			[1, 1, 1],
		);
		store.undo();
		assert.deepEqual(
			store.getSnapshot()!.pages.map((p) => p.objects.length),
			[0, 0, 0],
		);
		store.setDoc(null);
	});
});
