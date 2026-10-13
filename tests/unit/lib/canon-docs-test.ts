import { module, test } from 'qunit';
import {
	className,
	componentNames,
	docsPages,
	docsSections,
	importLine,
	neighbours,
	pageFor,
} from 'delphitools-v2/lib/canon-docs';
import platforms from 'delphitools-v2/lib/canon-platforms.json';
import { tiles } from 'delphitools-v2/components/canon-docs/tiles';
import { blockParts } from 'delphitools-v2/components/canon-docs/blocks/index';

const table = platforms as Record<string, string[]>;

module('Unit | Lib | canon-docs', function () {
	test('maps each docs route to its page', function (assert) {
		assert.strictEqual(pageFor('canon.index')?.id, 'overview');
		assert.strictEqual(
			pageFor('canon.installation')?.id,
			'installation',
		);
		assert.strictEqual(
			pageFor('canon.components.index')?.id,
			'components',
		);
		assert.strictEqual(
			pageFor('canon.components.component', {
				name: 'slider',
			})?.url,
			'/canon/components/slider',
		);
		assert.strictEqual(pageFor('canon.blocks.index')?.id, 'blocks');
		assert.strictEqual(
			pageFor('canon.blocks.block', { name: 'job-panel' })
				?.heading,
			'Job panel',
		);
		assert.strictEqual(
			pageFor('canon.components.component', { name: 'nope' }),
			undefined,
		);
		assert.strictEqual(pageFor('index'), undefined);
	});

	test('names and import lines', function (assert) {
		assert.strictEqual(
			className('canon-big-number-field'),
			'CanonBigNumberField',
		);
		assert.strictEqual(
			importLine('canon-slider'),
			"import CanonSlider from 'delphicanon/components/canon-slider';",
		);
	});

	test('pages are unique, in nav order, with a pager', function (assert) {
		assert.strictEqual(
			new Set(docsPages.map((p) => p.url)).size,
			docsPages.length,
		);
		assert.deepEqual(
			docsSections.flatMap((s) => s.pages),
			docsPages,
			'the nav lists every page once, in page order',
		);
		const first = neighbours(docsPages[0]!);
		assert.strictEqual(first.previous, undefined);
		assert.strictEqual(first.next?.id, 'installation');
		assert.strictEqual(
			neighbours(docsPages[docsPages.length - 1]!).next,
			undefined,
		);
	});

	test('every kit component has a page, a demo and a platform row', function (assert) {
		const kit = Object.keys(table).sort();
		assert.deepEqual([...componentNames].sort(), kit);
		assert.deepEqual(tiles.map((t) => t.name).sort(), kit);
		for (const name of kit)
			assert.strictEqual(table[name]![0], 'Ember', name);
	});

	test('the platform table reads the ports', function (assert) {
		assert.deepEqual(table['canon-slider'], [
			'Ember',
			'React',
			'Vue',
			'Svelte',
			'UIKit',
		]);
		assert.false(
			table['canon-command']!.includes('UIKit'),
			'no UIKit palette',
		);
		assert.true(
			table['canon-math-view']!.includes('UIKit'),
			'a type ending in View keeps its name',
		);
	});

	test('every block page has a live block and its source', function (assert) {
		for (const page of docsPages.filter(
			(p) => p.kind === 'block',
		)) {
			const block = blockParts[page.name];
			assert.ok(block?.Live, page.name);
			assert.true(
				(block?.source ?? '').includes(
					'export default class',
				),
				page.name,
			);
		}
	});
});
