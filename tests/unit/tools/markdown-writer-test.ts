import { module, test } from 'qunit';
import {
	extract,
	findRanges,
	pieces,
	removeDuplicates,
	removeExtraSpaces,
	removeLineNumbers,
	replaceIn,
	sortLines,
	toCamelCase,
	toKebabCase,
	toSentenceCase,
	toSnakeCase,
	toTitleCase,
	wrapAt,
} from 'delphitools-v2/components/tools/markdown-writer/text-ops';

module('Unit | Tool | markdown-writer', function () {
	test('case changes', function (assert) {
		assert.strictEqual(toTitleCase('hello wORLD'), 'Hello World');
		assert.strictEqual(
			toSentenceCase('one. TWO! three'),
			'One. Two! Three',
		);
		assert.strictEqual(
			toCamelCase('Hello big world'),
			'helloBigWorld',
		);
		assert.strictEqual(
			toSnakeCase('Hello bigWorld'),
			'hello_big_world',
		);
		assert.strictEqual(
			toKebabCase('Hello bigWorld'),
			'hello-big-world',
		);
	});

	test('line operations', function (assert) {
		assert.strictEqual(sortLines('b\na\nc'), 'a\nb\nc');
		assert.strictEqual(removeDuplicates('a\nb\na'), 'a\nb');
		assert.strictEqual(
			removeLineNumbers('1. a\n2) b\nc'),
			'a\nb\nc',
		);
		assert.strictEqual(removeExtraSpaces('a   b\n  c'), 'a b\n c');
		assert.strictEqual(wrapAt('aa bb cc', 5), 'aa bb\ncc');
	});

	test('replace: plain and pattern, first and all', function (assert) {
		assert.strictEqual(
			replaceIn('a.a.a', '.', '-', false, true),
			'a-a-a',
		);
		assert.strictEqual(
			replaceIn('a.a.a', '.', '-', false, false),
			'a-a.a',
		);
		assert.strictEqual(
			replaceIn('ab ab', '(a)b', '$1', true, true),
			'a a',
		);
		assert.throws(() => replaceIn('x', '(', '', true, true));
	});

	test('find ranges', function (assert) {
		assert.deepEqual(findRanges('A.B a.b axb', 'a.b', false), [
			[4, 7],
		]);
		assert.deepEqual(findRanges('aaa', 'aa', false), [[0, 2]]);
		assert.deepEqual(findRanges('A.B a.b axb', 'a.b', true), [
			[4, 7],
			[8, 11],
		]);
		assert.deepEqual(
			findRanges('abc', 'x*', true),
			[],
			'empty matches are not lit',
		);
		assert.strictEqual(
			findRanges('x', '(', true),
			null,
			'a broken pattern',
		);
		assert.deepEqual(findRanges('abc', '', false), []);
	});

	test('pieces cut the text at the ranges', function (assert) {
		assert.deepEqual(pieces('a cat', [[2, 5]]), [
			{ text: 'a ', hit: false },
			{ text: 'cat', hit: true },
			{ text: ' ', hit: false },
		]);
		assert.deepEqual(pieces('', []), [{ text: ' ', hit: false }]);
	});

	test('extract keeps the first of each', function (assert) {
		assert.deepEqual(extract('a@b.co x a@b.co c@d.org', 'emails'), [
			'a@b.co',
			'c@d.org',
		]);
		assert.deepEqual(extract('-1 2.5 and 3', 'numbers'), [
			'-1',
			'2.5',
			'3',
		]);
	});
});
