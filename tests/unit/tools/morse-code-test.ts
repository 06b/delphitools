import { module, test } from 'qunit';
import {
	fitUnit,
	glyphAt,
	marksOf,
	tapeOf,
	units,
} from 'delphitools-v2/components/tools/morse-code/layout';
import { pressKey } from 'delphitools-v2/components/tools/morse-code/keypad';

module('Unit | Tool | morse-code', function () {
	test('pressKey: dits and dahs append', function (assert) {
		assert.strictEqual(pressKey('', 'dit'), '.');
		assert.strictEqual(pressKey('.', 'dah'), '.-');
		assert.strictEqual(pressKey('.- ', 'dit'), '.- .');
	});

	test('pressKey: gaps never lead or double', function (assert) {
		assert.strictEqual(pressKey('', 'letter'), '');
		assert.strictEqual(pressKey('', 'word'), '');
		assert.strictEqual(pressKey('.-', 'letter'), '.- ');
		assert.strictEqual(pressKey('.- ', 'letter'), '.- ');
		assert.strictEqual(pressKey('.- ', 'word'), '.- / ');
		assert.strictEqual(pressKey('.- / ', 'letter'), '.- / ');
		assert.strictEqual(pressKey('.- / ', 'word'), '.- / ');
	});

	test('pressKey: backspace takes a symbol or a whole gap', function (assert) {
		assert.strictEqual(pressKey('.-', 'back'), '.');
		assert.strictEqual(pressKey('.- ', 'back'), '.-');
		assert.strictEqual(pressKey('.- / ', 'back'), '.-');
		assert.strictEqual(pressKey('', 'back'), '');
	});

	test('units: a dot 1, a dash 3, a unit between', function (assert) {
		assert.strictEqual(units('.'), 1);
		assert.strictEqual(units('-'), 3);
		assert.strictEqual(units('.-'), 5);
		assert.strictEqual(units(''), 1);
	});

	test('tapeOf: letters, word spaces and where each starts', function (assert) {
		const tape = tapeOf('.. / -');
		assert.deepEqual(
			tape.glyphs.map((g) => g.label),
			['I', ' ', 'T'],
		);
		// I is 3 units, gap 3, space 1, gap 3, T 3
		assert.deepEqual(tape.starts, [0, 6, 10]);
		assert.strictEqual(tape.total, 13);
		assert.strictEqual(tapeOf('-.-.-.-.-').glyphs[0]?.label, '?');
	});

	test('glyphAt: the glyph sounding at a unit', function (assert) {
		assert.strictEqual(glyphAt([0, 6, 10], 0), 0);
		assert.strictEqual(glyphAt([0, 6, 10], 7), 1);
		assert.strictEqual(glyphAt([0, 6, 10], 40), 2);
		assert.strictEqual(glyphAt([2], 0), undefined);
	});

	test('fitUnit: fills the width within 3 to 12 px', function (assert) {
		assert.strictEqual(fitUnit(10, 101), 10);
		assert.strictEqual(fitUnit(10, 1000), 12);
		assert.strictEqual(fitUnit(1000, 100), 3);
		assert.strictEqual(fitUnit(0, 100), 8);
	});

	test('marksOf: each mark and its length', function (assert) {
		assert.deepEqual(marksOf('-.'), [
			{ at: 0, length: 3 },
			{ at: 4, length: 1 },
		]);
	});
});
