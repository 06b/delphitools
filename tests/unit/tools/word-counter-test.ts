import { module, test } from 'qunit';
import {
	averageWordLength,
	countText,
	topWords,
} from 'delphitools-v2/components/tools/word-counter/count';

module('Unit | Tool | word-counter', function () {
	test('top words: case-insensitive, edge punctuation off, ties alphabetical', function (assert) {
		assert.deepEqual(
			topWords('The cat. the CAT, "cat" dog an', 5),
			[
				{ word: 'cat', count: 3 },
				{ word: 'the', count: 2 },
				{ word: 'dog', count: 1 },
			],
		);
	});

	test('top words: shorter than three characters are left out', function (assert) {
		assert.deepEqual(topWords('a an to of', 5), []);
	});

	test('top words: the limit', function (assert) {
		assert.strictEqual(topWords('one two three four', 2).length, 2);
	});

	test('average word length to one decimal, 0 with no words', function (assert) {
		assert.strictEqual(averageWordLength(countText('ab abcd')), 3);
		assert.strictEqual(
			averageWordLength(countText('abc ab ab')),
			2.3,
		);
		assert.strictEqual(averageWordLength(countText('  ')), 0);
	});
});
