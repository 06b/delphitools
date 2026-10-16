import { module, test } from 'qunit';
import {
	errorExcerpt,
	focusCell,
	parentPath,
	shapeLevels,
	shapeOf,
	tokenRuns,
} from 'delphitools-v2/components/tools/json-formatter/shape';
import { buildTree, flattenTree } from 'delphitools-v2/lib/json-format';

const doc = JSON.parse('{"a":[1,2],"b":"xy","c":{"d":null}}') as unknown;

module('Unit | Tool | json-formatter', function () {
	// the iOS JSONShape.selfCheck
	test('the shape counts depth, keys and values', function (assert) {
		const shape = shapeOf(doc);
		assert.deepEqual(
			[shape.depth, shape.keys, shape.values],
			[2, 4, 4],
		);
		assert.strictEqual(shape.cells.length, 7);
		assert.strictEqual(shapeLevels(shape), 3);
	});

	test('top cells span the document, wider value wider cell', function (assert) {
		const top = shapeOf(doc).cells.filter(
			(cell) => cell.depth === 1,
		);
		assert.deepEqual(
			top.map((cell) => cell.label),
			['a', 'b', 'c'],
		);
		assert.strictEqual(top[0]!.start, 0);
		assert.true(Math.abs(top[2]!.end - 1) < 1e-9);
		assert.true(
			top[0]!.end - top[0]!.start >
				top[1]!.end - top[1]!.start,
		);
	});

	test('cells carry their line in the indented text', function (assert) {
		assert.deepEqual(
			shapeOf(doc).cells.map((cell) => cell.line),
			[0, 1, 2, 3, 5, 6, 7],
		);
	});

	test('a zoomed shape keeps ancestors, focus and contents in document fractions', function (assert) {
		const top = shapeOf(doc).cells.filter(
			(cell) => cell.depth === 1,
		);
		const zoomed = shapeOf(doc, 'root.2');
		assert.strictEqual(zoomed.focus, 'root.2');
		assert.strictEqual(focusCell(zoomed)?.label, 'c');
		assert.strictEqual(shapeLevels(zoomed), 2);
		assert.deepEqual(
			zoomed.cells.map((cell) => cell.path),
			['root', 'root.2', 'root.2.0'],
		);
		assert.strictEqual(zoomed.cells[2]!.start, top[2]!.start);
		assert.strictEqual(zoomed.cells[2]!.end, top[2]!.end);
	});

	test('a lost focus falls back to the root', function (assert) {
		assert.strictEqual(shapeOf(doc, 'root.9').focus, 'root');
		assert.strictEqual(parentPath('root.2.0'), 'root.2');
	});

	test('a bare value is one cell of depth 0', function (assert) {
		const shape = shapeOf(42);
		assert.strictEqual(shape.depth, 0);
		assert.strictEqual(shape.cells.length, 1);
	});

	test('the tree and the shape share index paths', function (assert) {
		const rows = flattenTree(buildTree(doc), new Set());
		const cells = shapeOf(doc).cells;
		assert.deepEqual(
			rows.map((row) => row.node.path),
			cells.map((cell) => cell.path),
		);
	});

	// the iOS JSONListing.selfCheck
	test('tokens split keys, values and punctuation', function (assert) {
		const kinds = tokenRuns('{"k": [1.5e3, "s\\"", true]}')
			.filter((run) => run.kind)
			.map((run) => run.kind);
		assert.deepEqual(kinds, [
			'punctuation',
			'key',
			'punctuation',
			'punctuation',
			'number',
			'punctuation',
			'string',
			'punctuation',
			'literal',
			'punctuation',
			'punctuation',
		]);
	});

	test('the runs rebuild the text', function (assert) {
		const text = '  "a": [ 1, -2 ], x';
		assert.strictEqual(
			tokenRuns(text)
				.map((run) => run.text)
				.join(''),
			text,
		);
	});

	test('the excerpt windows the error line around the column', function (assert) {
		assert.deepEqual(errorExcerpt('{\n  "b": tru\n}', 2, 8), {
			before: '  "b": ',
			at: 't',
			after: 'ru',
		});
		assert.deepEqual(errorExcerpt('[1,', 1, 4), {
			before: '[1,',
			at: '',
			after: '',
		});
		assert.strictEqual(
			errorExcerpt('"é😀x"', 1, 3).at,
			'😀',
			'a surrogate pair is one mark',
		);
		const long = `${'a'.repeat(60)}!${'b'.repeat(60)}`;
		const { before, after } = errorExcerpt(long, 1, 61);
		assert.strictEqual(before.length, 24);
		assert.strictEqual(after.length, 24);
	});
});
