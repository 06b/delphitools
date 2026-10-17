import { module, test } from 'qunit';
import {
	CHEATSHEET,
	TOTAL_CLASSES,
	filterCheatsheet,
	findClass,
	lookupTailwindClass,
} from 'delphitools-v2/components/tools/tailwind-cheatsheet/data';
import {
	motionOf,
	specimen,
} from 'delphitools-v2/components/tools/tailwind-cheatsheet/specimen';
import { siblingCells } from 'delphitools-v2/components/tools/tailwind-cheatsheet/stage';

const names = (search: string) =>
	filterCheatsheet(search).flatMap((category) =>
		category.items.map((item) => item.class),
	);

module('Unit | Tool | tailwind-cheatsheet', function () {
	// the iOS TailwindCheatsheet.selfCheck cases
	test('the web table and the tip', function (assert) {
		assert.strictEqual(CHEATSHEET.length, 19);
		assert.strictEqual(TOTAL_CLASSES, 308);
		assert.strictEqual(
			new Set(
				CHEATSHEET.flatMap((c) =>
					c.items.map((i) => i.class),
				),
			).size,
			TOTAL_CLASSES,
			'rows are keyed by class',
		);
	});

	test('filter folds case and matches class, css and example', function (assert) {
		assert.strictEqual(
			filterCheatsheet('').length,
			CHEATSHEET.length,
		);
		assert.deepEqual(names('JUSTIFY-BETWEEN'), ['justify-between']);
		assert.deepEqual(names('group-hover:visible'), [
			'group-hover:',
		]);
		assert.strictEqual(
			filterCheatsheet('space-evenly')[0]?.name,
			'Alignment',
		);
		assert.strictEqual(filterCheatsheet('zzz').length, 0);
		assert.deepEqual(names('  m-auto '), ['m-auto'], 'trims');
	});

	test('lookup', function (assert) {
		assert.strictEqual(
			findClass('rotate-45')?.category.name,
			'Transforms',
		);
		assert.strictEqual(findClass('nope'), undefined);
		assert.strictEqual(
			lookupTailwindClass(' M-4 ')?.css,
			'margin: 1rem (16px)',
		);
	});

	test('every class draws', function (assert) {
		for (const category of CHEATSHEET)
			for (const item of category.items)
				assert.ok(
					specimen(item, category.name).length >
						0,
					item.class,
				);
	});

	test('motion: transforms and transitions move', function (assert) {
		assert.strictEqual(
			motionOf('rotate-45', 'Transforms')?.kind,
			'transform',
		);
		assert.strictEqual(
			motionOf('animate-spin', 'Transitions')?.kind,
			'spin',
		);
		assert.deepEqual(motionOf('delay-300', 'Transitions'), {
			kind: 'timing',
			duration: 0.15,
			delay: 0.3,
		});
		assert.strictEqual(
			motionOf('ease-in', 'Transitions')?.kind,
			'curve',
		);
		assert.strictEqual(
			motionOf('transition', 'Transitions'),
			undefined,
		);
		assert.strictEqual(motionOf('p-4', 'Spacing'), undefined);
	});

	test('the stage omits what it animates', function (assert) {
		const spin = findClass('animate-spin')!;
		assert.strictEqual(
			specimen(spin.item, spin.category.name, true),
			'',
		);
		assert.notStrictEqual(
			specimen(spin.item, spin.category.name),
			'',
		);
	});

	test('sibling cells fit at the largest size', function (assert) {
		const one = siblingCells(4, 1000, 100);
		assert.strictEqual(one.columns, 4, 'one row when it fits');
		assert.strictEqual(one.height, 100);
		const two = siblingCells(18, 400, 160);
		assert.ok(
			two.columns * (two.width + 4) - 4 <= 400,
			'fits the width',
		);
	});
});
