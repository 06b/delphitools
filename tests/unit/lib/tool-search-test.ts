import { module, test } from 'qunit';
import { allTools, getToolById } from 'delphitools-v2/lib/tools';
import { matchesQuery } from 'delphitools-v2/lib/tool-search';

function hits(query: string) {
	return allTools
		.filter((tool) => matchesQuery(tool, query))
		.map((tool) => tool.id);
}

module('Unit | Lib | tool-search', function () {
	test('still matches names and descriptions', function (assert) {
		const converter = getToolById('doc-converter')!;
		assert.true(matchesQuery(converter, 'document'));
		assert.true(matchesQuery(converter, 'latex'));
		assert.true(
			matchesQuery(converter, ''),
			'empty query shows all',
		);
	});

	test('a US spelling finds the colour tools', function (assert) {
		assert.true(hits('color').includes('colour-converter'));
		assert.true(hits('color blindness').includes('colorblind-sim'));
	});

	test('finds tools by a file type they accept', function (assert) {
		assert.true(hits('md').includes('doc-converter'));
		assert.true(hits('.md').includes('doc-converter'));
		assert.true(hits('docx').includes('doc-converter'));
		assert.true(hits('srt').includes('subtitle-converter'));
	});

	test('finds tools by a file type they produce', function (assert) {
		assert.true(hits('webp').includes('image-converter'));
		assert.true(hits('jpeg').includes('image-converter'));
		assert.true(
			hits('jpg').includes('image-converter'),
			'jpg alias',
		);
	});

	test('a bare type ignores wildcard accepts', function (assert) {
		assert.false(
			hits('png').includes('palette-extractor'),
			'image/* alone is not a png match',
		);
	});

	test('matches "x to y" by accepts and produces', function (assert) {
		assert.true(hits('md to html').includes('doc-converter'));
		assert.true(hits('.md -> .docx').includes('doc-converter'));
		assert.true(hits('png to webp').includes('image-converter'));
		assert.true(hits('jxl to png').includes('image-converter'));
		assert.false(hits('md to webp').includes('doc-converter'));
		assert.false(hits('png to html').includes('image-converter'));
	});

	test('ignores case and surrounding space', function (assert) {
		assert.true(hits('  MD to HTML ').includes('doc-converter'));
	});

	test('px2rem, rem2px and spelt-out variants find px-to-rem', function (assert) {
		for (const query of [
			'px2rem',
			'rem2px',
			'pxtorem',
			'px-to-rem',
			'rem to px',
			'PX2REM',
		])
			assert.true(hits(query).includes('px-to-rem'), query);
	});

	test('does not match unknown types', function (assert) {
		assert.deepEqual(hits('qqq'), []);
		assert.deepEqual(hits('qqq to zzz'), []);
	});
});
