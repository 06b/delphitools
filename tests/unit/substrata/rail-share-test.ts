import { module, test } from 'qunit';
import { sharePanels } from 'delphitools-v2/lib/substrata/rail-share';

module('Unit | Substrata | rail-share', function () {
	test('panels that fit keep their height', function (assert) {
		assert.deepEqual(sharePanels(100, [20, 30]), [20, 30]);
	});

	test('the tallest give up room first', function (assert) {
		assert.deepEqual(
			sharePanels(100, [20, 200, 300]),
			[20, 40, 40],
		);
		assert.deepEqual(
			sharePanels(600, [130, 1100, 130]),
			[130, 340, 130],
		);
	});

	test('no room leaves nothing', function (assert) {
		assert.deepEqual(sharePanels(0, [50, 50]), [0, 0]);
	});
});
