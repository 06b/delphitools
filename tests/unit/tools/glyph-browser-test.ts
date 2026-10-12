import { module, test } from 'qunit';
import {
	chart,
	codeText,
	isVisible,
	utf8,
} from 'delphitools-v2/components/tools/glyph-browser/glyphs';

module('Unit | Tool | glyph-browser', function () {
	test('controls and unassigned code points are blank', function (assert) {
		assert.true(isVisible(0x41));
		assert.false(isVisible(0x7f), 'DEL is a control');
		assert.false(isVisible(0x0378), 'unassigned in Greek');
	});

	test('the copy forms', function (assert) {
		assert.strictEqual(utf8(0x41), '41');
		assert.strictEqual(utf8(0x20ac), 'E2 82 AC');
		assert.strictEqual(codeText(0x1f600, 'js'), '\\u{1f600}');
		assert.strictEqual(codeText(0x41, 'html'), '&#x41;');
	});

	test('the chart rows align to the column count', function (assert) {
		const sixteen = chart(16, '');
		assert.strictEqual(sixteen.length, 13);
		const latin = sixteen[0]!;
		assert.strictEqual(latin.rows[0]?.start, 0x20);
		assert.strictEqual(latin.rows[0]?.cells.length, 16);
		assert.strictEqual(latin.count, 95, 'DEL left out');
		const eight = chart(8, '');
		assert.strictEqual(eight[0]!.rows.length, 12);
	});

	test('search keeps matching cells and whole categories', function (assert) {
		const euro = chart(16, '20ac');
		assert.deepEqual(
			euro.map((s) => s.name),
			['Currency'],
		);
		assert.strictEqual(euro[0]!.count, 1);
		assert.deepEqual(
			chart(16, 'greek').map((s) => s.name),
			['Greek'],
		);
		assert.strictEqual(chart(16, 'zzzz').length, 0);
	});
});
