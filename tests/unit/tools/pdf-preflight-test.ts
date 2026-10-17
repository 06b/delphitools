import { module, test } from 'qunit';
import type { PreflightIssue } from 'delphitools-v2/lib/pdf-preflight';
import {
	DASH,
	checkTiles,
	groups,
	insetOf,
	onPage,
	pageMarks,
	resultTiles,
	verdict,
} from 'delphitools-v2/components/tools/pdf-preflight/report';

const issues: PreflightIssue[] = [
	{ severity: 'info', category: 'geometry', message: 'a', page: 1 },
	{ severity: 'warning', category: 'geometry', message: 'b', page: 2 },
	{ severity: 'error', category: 'fonts', message: 'c' },
	{ severity: 'error', category: 'images', message: 'd', page: 2 },
];

module('Unit | Tool | pdf-preflight', function () {
	test('every tile reads a dash before a report', function (assert) {
		assert.true(
			[...resultTiles(null), ...checkTiles(null)].every(
				(tile) => tile.value === DASH,
			),
		);
	});

	test('result tiles count by severity; any error fails', function (assert) {
		assert.deepEqual(
			resultTiles(issues).map((t) => t.value),
			['✕ Fail', '2', '1', '1'],
		);
		assert.strictEqual(
			resultTiles([issues[0]!])[0]!.value,
			'✓ Pass',
		);
		assert.strictEqual(
			verdict(issues),
			'2 errors must be resolved before printing',
		);
	});

	test('check tiles mark errors and warnings; info passes', function (assert) {
		const values = Object.fromEntries(
			checkTiles(issues).map((t) => [t.label, t.value]),
		);
		assert.strictEqual(values['Geometry'], '! 1');
		assert.strictEqual(values['Fonts'], '✕ 1');
		assert.strictEqual(values['Colour'], '✓');
	});

	test('a page shows its own and document-wide issues', function (assert) {
		assert.deepEqual(
			issues
				.filter((i) => onPage(i, 1))
				.map((i) => i.message),
			['b', 'c', 'd'],
		);
		assert.strictEqual(
			issues.filter((i) => onPage(i, null)).length,
			4,
		);
	});

	test('strip captions per page', function (assert) {
		assert.deepEqual(pageMarks(issues, 3), ['', '✕ 1  ! 1', '']);
	});

	test('groups keep category order, errors first', function (assert) {
		const found = groups([...issues].reverse());
		assert.deepEqual(
			found.map((g) => g.id),
			['geometry', 'fonts', 'images'],
		);
		assert.deepEqual(
			found[0]!.issues.map((i) => i.severity),
			['warning', 'info'],
		);
	});

	test('insetOf turns a viewport rect into CSS insets', function (assert) {
		assert.strictEqual(
			insetOf([10, 80, 90, 20], 100, 100),
			'inset: 20% 10% 20% 10%',
		);
	});
});
