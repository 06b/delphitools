import { module, test } from 'qunit';
import {
	className,
	componentGroups,
	componentNames,
	groupSlug,
	navIdFor,
	navSections,
	slugOf,
	docsPages,
	docsSections,
	importLine,
	docsPatterns,
	docsScreens,
	neighbours,
	pageFor,
	searchDocs,
} from 'delphitools-v2/lib/canon-docs';
import platforms from 'delphitools-v2/lib/canon-platforms.json';
import { tiles } from 'delphitools-v2/components/canon-docs/tiles';
import { patternParts } from 'delphitools-v2/components/canon-docs/patterns/index';
import { screenParts } from 'delphitools-v2/components/canon-docs/screens/index';

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
		assert.strictEqual(
			pageFor('canon.patterns.index')?.id,
			'patterns',
		);
		assert.strictEqual(
			pageFor('canon.patterns.pattern', { name: 'job-panel' })
				?.heading,
			'Job panel',
		);
		assert.strictEqual(
			pageFor('canon.screens.index')?.id,
			'screens',
		);
		assert.strictEqual(
			pageFor('canon.screens.screen', { name: 'settings' })
				?.url,
			'/canon/screens/settings',
		);
		assert.strictEqual(
			pageFor('canon.screens.screen', { name: 'nope' }),
			undefined,
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

	test('every pattern and screen page has a live part and its source', function (assert) {
		const parts = { pattern: patternParts, screen: screenParts };
		const pages = docsPages.filter(
			(p) => p.kind === 'pattern' || p.kind === 'screen',
		);
		assert.strictEqual(
			pages.length,
			docsPatterns.length + docsScreens.length,
		);
		for (const page of pages) {
			const part =
				parts[page.kind as 'pattern' | 'screen'][
					page.name
				];
			assert.ok(part?.Live, page.name);
			assert.true(
				(part?.source ?? '').includes(
					'export default class',
				),
				page.name,
			);
		}
	});

	test('the nav: the top pages, then one row per component group', function (assert) {
		assert.deepEqual(
			navSections.map((section) => [
				section.title,
				section.pages.map((p) => p.id),
			]),
			[
				[
					'',
					[
						'overview',
						'installation',
						'patterns',
						'screens',
					],
				],
				[
					'Components',
					componentGroups.map(
						(group) =>
							`group-${groupSlug(group)}`,
					),
				],
			],
		);
		assert.deepEqual(
			docsSections.slice(0, 2).map((s) => s.title),
			['', 'Patterns'],
			'patterns come before the components',
		);
	});

	test('a group shares the component route; entries light their section row', function (assert) {
		const slugs = componentNames.map(slugOf);
		for (const group of componentGroups)
			assert.false(
				slugs.includes(groupSlug(group)),
				groupSlug(group),
			);
		const params = (name: string) => ({ name });
		assert.strictEqual(
			pageFor(
				'canon.components.component',
				params('controls'),
			)?.id,
			'group-controls',
		);
		assert.strictEqual(
			navIdFor(
				pageFor(
					'canon.components.component',
					params('slider'),
				),
			),
			'group-controls',
		);
		assert.strictEqual(
			navIdFor(
				pageFor(
					'canon.patterns.pattern',
					params('tone'),
				),
			),
			'patterns',
		);
		assert.strictEqual(
			navIdFor(
				pageFor(
					'canon.screens.screen',
					params('settings'),
				),
			),
			'screens',
		);
	});

	test('search keeps the matching pages under their headings', function (assert) {
		assert.strictEqual(searchDocs('  '), navSections);
		assert.deepEqual(
			searchDocs('colour well').map((s) => [
				s.title,
				s.pages.map((p) => p.id),
			]),
			[['Colour', ['canon-colour-well']]],
		);
		assert.deepEqual(
			searchDocs('screens').flatMap((s) => s.pages).length,
			docsScreens.length + 1,
		);
		assert.deepEqual(searchDocs('zzz'), []);
	});
});
