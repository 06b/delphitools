import { module, test } from 'qunit';
import {
	syntaxLines,
	type Run,
} from 'delphitools-v2/components/tools/recipe-table/syntax';

const pairs = (runs: Run[]) => runs.map((run) => [run.text, run.kind]);

module('Unit | Tool | recipe-table', function () {
	test('every line joins back to its source', function (assert) {
		const text = [
			'title: Aglio e olio',
			'serves: 2',
			'',
			'> Salt the water',
			'fry | 2 min',
			'  - garlic: 2 cloves | sliced / slice | thin',
			'@ sauce | ¼ cup',
			'x the water',
			'= pasta water',
		].join('\n');
		const lines = syntaxLines(text);
		assert.deepEqual(
			lines.map((runs) =>
				runs.map((run) => run.text).join(''),
			),
			text.split('\n'),
		);
	});

	test('metadata, then steps and their inputs', function (assert) {
		const [meta, step, ing, ref, discard, name] = syntaxLines(
			[
				'serves: 2',
				'fry | 2 min',
				'- garlic: 2 cloves / slice',
				'@ sauce | ¼ cup',
				'x the water',
				'= pasta water',
			].join('\n'),
		);
		assert.deepEqual(pairs(meta!), [
			['serves:', 'meta'],
			[' 2', 'value'],
		]);
		assert.deepEqual(pairs(step!), [
			['fry ', 'step'],
			['|', 'mark'],
			[' 2 min', 'detail'],
		]);
		assert.deepEqual(pairs(ing!), [
			['-', 'mark'],
			[' garlic', 'ingredient'],
			[':', 'mark'],
			[' 2 cloves', 'quantity'],
			[' / ', 'mark'],
			['slice', 'step'],
		]);
		assert.deepEqual(pairs(ref!), [
			['@', 'mark'],
			[' sauce ', 'name'],
			['|', 'mark'],
			[' ¼ cup', 'detail'],
		]);
		assert.deepEqual(pairs(discard!), [
			['x', 'mark'],
			[' the water', 'discard'],
		]);
		assert.deepEqual(pairs(name!), [
			['=', 'mark'],
			[' pasta water', 'name'],
		]);
	});

	test('a metadata key after the first step is a step', function (assert) {
		const lines = syntaxLines('boil\ntitle: late');
		assert.deepEqual(pairs(lines[1]!), [['title: late', 'step']]);
	});

	test('a note is one run; a blank line keeps its spaces', function (assert) {
		const [note, blank] = syntaxLines('  > stir often\n   ');
		assert.deepEqual(pairs(note!), [
			['  ', null],
			['> stir often', 'note'],
		]);
		assert.deepEqual(pairs(blank!), [['   ', null]]);
	});
});
