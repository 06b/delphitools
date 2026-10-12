import { module, test } from 'qunit';
import { spread } from 'delphitools-v2/components/tools/media/frames';

module('Unit | Tool | media', function () {
	test('spread picks evenly spaced thumbnails (iOS selfCheck)', function (assert) {
		assert.deepEqual(spread(3, 24), [4, 12, 20]);
		assert.deepEqual(
			spread(24, 24),
			Array.from({ length: 24 }, (_, i) => i),
		);
		assert.deepEqual(spread(5, 0), []);
		assert.strictEqual(spread(30, 24).length, 30);
		assert.strictEqual(spread(30, 24).at(-1), 23);
	});
});
