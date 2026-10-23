import { module, test } from 'qunit';
import {
	moved,
	partLabel,
	partNames,
	turned,
} from 'delphitools-v2/components/tools/pdf-organiser/plan';

module('Unit | Tool | pdf-organiser', function () {
	test('turned swaps the sides on odd quarter turns', function (assert) {
		const a4 = { width: 595, height: 842 };
		assert.deepEqual(turned(a4, 0), a4);
		assert.deepEqual(turned(a4, 90), { width: 842, height: 595 });
		assert.deepEqual(turned(a4, 180), a4);
		assert.deepEqual(turned(a4, -90), { width: 842, height: 595 });
	});

	test('moved moves one item', function (assert) {
		assert.deepEqual(moved(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
		assert.deepEqual(moved(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
		assert.deepEqual(moved(['a', 'b'], 5, 0), ['a', 'b']);
	});

	test('parts are named and labelled as iOS', function (assert) {
		assert.deepEqual(partNames([[0, 1], [4]], 'doc', false), [
			'doc-part-1.pdf',
			'doc-part-2.pdf',
		]);
		assert.deepEqual(partNames([[0], [1]], 'doc', true), [
			'doc-page-1.pdf',
			'doc-page-2.pdf',
		]);
		assert.strictEqual(partLabel([2]), '3');
		assert.strictEqual(partLabel([0, 1, 2, 3]), '1–4');
	});
});
