import { module, test } from 'qunit';
import {
	blankPage,
	type ErrataPage,
} from 'delphitools-v2/lib/errata/doc-model';
import {
	deletePages,
	duplicatePages,
	insertBlank,
	movePages,
	rotatePages,
	updatePages,
	addContentEdits,
} from 'delphitools-v2/lib/errata/page-ops';
import { store } from 'delphitools-v2/lib/errata/store';

const pages = (): ErrataPage[] =>
	['a', 'b', 'c', 'd', 'e'].map((id) => ({ ...blankPage(400, 500), id }));
const ids = (list: readonly ErrataPage[]) => list.map((p) => p.id).join('');

module('Unit | errata | organise', function () {
	test('movePages keeps the selection order', function (assert) {
		const p = pages();
		assert.strictEqual(
			ids(movePages(p, new Set(['b', 'd']), 0)),
			'bdace',
		);
		assert.strictEqual(
			ids(movePages(p, new Set(['b', 'd']), 5)),
			'acebd',
		);
		assert.strictEqual(
			ids(movePages(p, new Set(['a']), 3)),
			'bcade',
		);
		assert.strictEqual(
			ids(movePages(p, new Set(['c']), 3)),
			'abcde',
		);
	});

	test('rotate, delete, duplicate, insert', function (assert) {
		const p = pages();
		const rotated = rotatePages(p, new Set(['b']), -1);
		assert.strictEqual(rotated[1]!.rotation, 270);
		assert.strictEqual(rotated[0], p[0]);

		assert.strictEqual(
			ids(deletePages(p, new Set(['a', 'e']))),
			'bcd',
		);
		assert.strictEqual(
			deletePages(p, new Set(ids(p))).length,
			5,
			'the last page stays',
		);

		p[1] = {
			...p[1]!,
			objects: [
				{
					id: 'o',
					kind: 'shape',
					shape: 'rect',
					colour: '#000',
					strokeWidth: 1,
					cx: 0,
					cy: 0,
					w: 1,
					h: 1,
					scaleX: 1,
					scaleY: 1,
					angle: 0,
				},
			],
		};
		const dup = duplicatePages(p, new Set(['b']));
		assert.strictEqual(dup.length, 6);
		assert.strictEqual(dup[1], p[1]);
		assert.notStrictEqual(dup[2]!.id, 'b');
		assert.strictEqual(dup[2]!.objects.length, 1);
		assert.notStrictEqual(dup[2]!.objects[0]!.id, 'o');

		const wide = { ...blankPage(600, 300), id: 'w' };
		const ins = insertBlank(
			[p[0]!, wide, p[2]!],
			new Set(['a', 'w']),
		);
		assert.strictEqual(ins.length, 4);
		assert.strictEqual(
			ins[2]!.baseWidth,
			600,
			'after the last selected',
		);
		assert.strictEqual(
			insertBlank(p, new Set()).length,
			6,
			'at the end without a selection',
		);
	});

	test('updatePages is one undo step and skips no-ops', function (assert) {
		store.setDoc({ name: 't', pages: pages() });
		updatePages((p) => movePages(p, new Set(['c']), 3));
		assert.false(store.canUndo());
		updatePages((p) => movePages(p, new Set(['a', 'b']), 5));
		assert.strictEqual(ids(store.getSnapshot()!.pages), 'cdeab');
		store.undo();
		assert.strictEqual(ids(store.getSnapshot()!.pages), 'abcde');
		store.setDoc(null);
	});

	test('content edits reach every copy of a source page', function (assert) {
		const src = { ...blankPage(400, 500), id: 's', sourceIndex: 0 };
		const p = duplicatePages([src, pages()[1]!], new Set(['s']));
		store.setDoc({ name: 't', pages: p });
		addContentEdits('s', [
			{ kind: 'delete', stream: '', from: 0, to: 1 },
		]);
		const after = store.getSnapshot()!.pages;
		assert.strictEqual(after[0]!.edits.length, 1);
		assert.strictEqual(after[1]!.edits.length, 1);
		assert.strictEqual(after[2]!.edits.length, 0);
		store.setDoc(null);
	});
});
