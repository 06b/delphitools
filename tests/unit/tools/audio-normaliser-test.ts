import { module, test } from 'qunit';
import { gainText } from 'delphitools-v2/components/tools/audio-normaliser/picture';

module('Unit | Tool | audio-normaliser', function () {
	test('gainText signs the figure with plus or a true minus', function (assert) {
		assert.strictEqual(gainText(6.04), '+6.0');
		assert.strictEqual(gainText(0), '+0.0');
		assert.strictEqual(gainText(-2.96), '−3.0');
	});
});
