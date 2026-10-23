import { module, test } from 'qunit';
import {
	coloursFromQuery,
	cssBlock,
	hexesFromLines,
	launchFlags,
	slug,
	strategiesIn,
} from 'delphitools-v2/components/tools/palette-genny/palette';

module('Unit | Tool | palette-genny', function () {
	test('launch flags read strategy, locks and focus', function (assert) {
		const flags = launchFlags(
			'?gennyStrategy=bauhaus&gennyLocked=0,2,x&gennyFocus=1&colors=1a2744,2c4a7c',
		);
		assert.strictEqual(flags.strategy, 'bauhaus');
		assert.deepEqual(flags.locked, [0, 2]);
		assert.strictEqual(flags.focus, 1);
		assert.deepEqual(flags.colours, ['#1a2744', '#2c4a7c']);
	});

	test('an unknown strategy is ignored', function (assert) {
		assert.strictEqual(
			launchFlags('?gennyStrategy=nope').strategy,
			undefined,
		);
		assert.strictEqual(launchFlags('').focus, undefined);
	});

	test('the CSS block numbers the colours', function (assert) {
		assert.strictEqual(
			cssBlock(['#000000', '#ffffff']),
			':root {\n  --palette-1: #000000;\n  --palette-2: #ffffff;\n}',
		);
	});

	test('strategies come grouped by category', function (assert) {
		assert.deepEqual(strategiesIn('random'), [
			'true-random',
			'random-cohesive',
		]);
	});

	test('the collection id is a slug of the name', function (assert) {
		assert.strictEqual(slug('Ocean Sunset!!'), 'ocean-sunset');
	});

	test('the import takes one hex per line, two at least', function (assert) {
		assert.deepEqual(hexesFromLines('1a2744\n#2c4a7c\nzzz'), [
			'#1a2744',
			'#2c4a7c',
		]);
		assert.strictEqual(hexesFromLines('1a2744'), null);
	});
});

module('Unit | Tool | palette-genny | share link', function () {
	test('accepts bare hex', function (assert) {
		assert.deepEqual(coloursFromQuery('?colors=1a2744,2c4a7c'), [
			'#1a2744',
			'#2c4a7c',
		]);
	});

	test('accepts hex with a leading hash', function (assert) {
		assert.deepEqual(
			coloursFromQuery('?colors=%231a2744,%232c4a7c'),
			['#1a2744', '#2c4a7c'],
		);
	});

	test('tolerates whitespace around each value', function (assert) {
		assert.deepEqual(
			coloursFromQuery('?colors= 1a2744 , 2c4a7c '),
			['#1a2744', '#2c4a7c'],
		);
	});

	// one colour renders stub
	test('rejects a single colour', function (assert) {
		assert.strictEqual(coloursFromQuery('?colors=1a2744'), null);
	});

	test('drops malformed values and rejects what is left if too few', function (assert) {
		assert.strictEqual(
			coloursFromQuery('?colors=notahex,zzz'),
			null,
		);
		assert.deepEqual(
			coloursFromQuery('?colors=1a2744,zzz,2c4a7c'),
			['#1a2744', '#2c4a7c'],
		);
	});

	test('rejects three- and eight-digit hex', function (assert) {
		assert.strictEqual(coloursFromQuery('?colors=abc,def'), null);
		assert.strictEqual(
			coloursFromQuery('?colors=1a2744ff,2c4a7cff'),
			null,
		);
	});

	test('returns null without the param', function (assert) {
		assert.strictEqual(coloursFromQuery(''), null);
		assert.strictEqual(coloursFromQuery('?other=1'), null);
		assert.strictEqual(coloursFromQuery('?colors='), null);
	});
});
