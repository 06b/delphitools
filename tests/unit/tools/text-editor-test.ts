import { module, test } from 'qunit';
import {
	blockMark,
	countStats,
} from 'delphitools-v2/components/tools/text-editor/marks';

module('Unit | Tool | text-editor', function () {
	test('blockMark: the iOS gutter marks', function (assert) {
		assert.deepEqual(
			[
				'HEADING 1',
				'HEADING 6',
				'PARAGRAPH',
				'BULLET LIST',
				'NUMBERED LIST',
				'QUOTE',
				'CODE',
				'RULE',
				'TABLE',
			].map(blockMark),
			['H1', 'H6', '¶', '•', '1.', '“', '{ }', '—', 'TABLE'],
		);
	});

	test('countStats: TextEditorViewModel counts', function (assert) {
		assert.deepEqual(countStats(''), {
			words: 0,
			characters: 0,
			lines: 0,
			minutes: 0,
		});
		assert.deepEqual(countStats('one two\nthree'), {
			words: 3,
			characters: 13,
			lines: 2,
			minutes: 1,
		});
		assert.strictEqual(countStats('w '.repeat(401)).minutes, 3);
		assert.strictEqual(countStats('\u{1F600}').characters, 1);
	});
});
