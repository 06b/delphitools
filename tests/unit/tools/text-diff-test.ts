import { module, test } from 'qunit';
import {
	diffLines,
	diffPatch,
	diffStats,
	pieces,
	ribbonBlocks,
	rowSpans,
	sideMarks,
	tokens,
	wordChanges,
} from 'delphitools-v2/components/tools/text-diff/diff';

module('Unit | Tool | text-diff', function () {
	test('two empty texts compare as nothing', function (assert) {
		assert.deepEqual(diffLines('', ''), []);
	});

	// the iOS DiffWords.selfCheck
	test('the patch matches iOS', function (assert) {
		const diff = diffLines('a\nb\nc', 'a\nB\nc\nd');
		assert.strictEqual(diffPatch(diff), '  a\n- b\n+ B\n  c\n+ d');
		assert.deepEqual(diffStats(diff), { added: 2, removed: 1 });
	});

	test('tokens split words, spaces and single symbols', function (assert) {
		assert.deepEqual(
			tokens('a-bc  d').map((token) => token.text),
			['a', '-', 'bc', '  ', 'd'],
		);
		assert.deepEqual(
			tokens('é😀x').map(({ span }) => span[1] - span[0]),
			[1, 2, 1],
		);
	});

	test('similar lines pair their changed words', function (assert) {
		const words = wordChanges(
			'Privacy-first tools for designers.',
			'Privacy-first tools for designers and developers.',
		);
		assert.deepEqual(words, { removed: [], added: [[33, 48]] });
		assert.strictEqual(wordChanges('alpha beta', 'gamma'), null);
	});

	test('row spans and side marks follow the pairs', function (assert) {
		const diff = diffLines('one two\nkeep', 'one three\nkeep');
		const spans = rowSpans(diff);
		assert.deepEqual(spans, [[[4, 7]], [[4, 9]], []]);
		const marks = sideMarks(diff, spans);
		assert.deepEqual(marks.old, [
			{ lit: true, spans: [[4, 7]] },
			{ lit: false, spans: [] },
		]);
		assert.deepEqual(marks.new[0], { lit: true, spans: [[4, 9]] });
		assert.deepEqual(pieces('one two', [[4, 7]]), [
			{ text: 'one ', on: false },
			{ text: 'two', on: true },
		]);
	});

	test('ribbon blocks run like lines on both sides', function (assert) {
		const { blocks, oldLengths, newLengths } = ribbonBlocks(
			diffLines('a\nb\nc', 'a\nB\nBB\nc'),
		);
		assert.deepEqual(
			blocks.map((block) => [
				block.kind,
				block.left,
				block.right,
			]),
			[
				['same', [0, 1], [0, 1]],
				['del', [1, 2], [1, 1]],
				['add', [2, 2], [1, 3]],
				['same', [2, 3], [3, 4]],
			],
		);
		assert.deepEqual(oldLengths, [1, 1, 1]);
		assert.deepEqual(newLengths, [1, 1, 2, 1]);
	});
});
