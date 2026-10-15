import { module, test } from 'qunit';
import {
	sheetGrid,
	sheetTimes,
	stamp,
} from 'delphitools-v2/components/tools/frame-extractor/sheet';

module('Unit | Tool | frame-extractor', function () {
	test('sheetTimes are the middles of equal spans', function (assert) {
		assert.deepEqual(sheetTimes(12, 4), [1.5, 4.5, 7.5, 10.5]);
		assert.deepEqual(sheetTimes(12, 0), []);
	});

	test('sheetGrid is at most four columns', function (assert) {
		assert.deepEqual(sheetGrid(2), [2, 1]);
		assert.deepEqual(sheetGrid(12), [4, 3]);
		assert.deepEqual(sheetGrid(13), [4, 4]);
	});

	test('stamp makes a time safe for a file name', function (assert) {
		assert.strictEqual(stamp('00:00:01.500'), '00-00-01-500');
	});
});
