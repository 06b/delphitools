import { module, test } from 'qunit';
import { blankPage, rotatePage } from 'delphitools-v2/lib/errata/doc-model';
import {
	dropRedactions,
	intersects,
	redactBoxes,
	redactIds,
	redactObject,
} from 'delphitools-v2/lib/errata/redact';
import { store } from 'delphitools-v2/lib/errata/store';

module('Unit | errata | redact', function () {
	test('boxes follow scale and quarter turns', function (assert) {
		const page = blankPage(400, 500);
		const mark = { ...redactObject(10, 20, 100, 40), scaleX: 2 };
		page.objects = [mark];
		assert.deepEqual(redactBoxes(page), [[-40, 20, 160, 60]]);
		const turned = rotatePage(page, 1);
		const [box] = redactBoxes(turned);
		const expected = [500 - 60, -40, 500 - 20, 160];
		box!.forEach((v, i) =>
			assert.ok(Math.abs(v - expected[i]!) < 1e-9),
		);
	});

	test('only redact objects make boxes', function (assert) {
		const page = blankPage(400, 500);
		page.objects = [
			{
				...redactObject(0, 0, 10, 10),
				kind: 'shape',
				shape: 'rect',
				colour: '#000',
				strokeWidth: 1,
			},
		];
		assert.deepEqual(redactBoxes(page), []);
	});

	test('intersects excludes touching edges', function (assert) {
		assert.true(intersects([0, 0, 10, 10], [5, 5, 15, 15]));
		assert.false(intersects([0, 0, 10, 10], [10, 0, 20, 10]));
		assert.false(intersects([0, 0, 10, 10], [0, 11, 10, 20]));
	});

	test('dropRedactions keeps earlier marks, one undo step', function (assert) {
		const a = blankPage(400, 500);
		const b = blankPage(400, 500);
		const old = redactObject(0, 0, 10, 10);
		const fresh = [
			redactObject(5, 5, 10, 10),
			redactObject(1, 1, 2, 2),
		];
		a.objects = [old, fresh[0]!];
		b.objects = [fresh[1]!];
		store.setDoc({ name: 't', pages: [a, b] });
		dropRedactions(new Set([old.id]));
		assert.deepEqual([...redactIds(store.getSnapshot())], [old.id]);
		store.undo();
		assert.strictEqual(redactIds(store.getSnapshot()).size, 3);
		store.setDoc(null);
	});
});
