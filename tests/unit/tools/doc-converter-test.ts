import { module, test } from 'qunit';
import {
	convertLocally,
	convertsLocally,
} from 'delphitools-v2/components/tools/doc-converter/local';
import { guessFormatFromContent } from 'delphitools-v2/lib/pandoc/formats';

const MD =
	'# Notes\n\nSome **bold** and [a link](https://x.test).\n\n- one\n- two';

module('Unit | Tool | doc-converter', function () {
	test('only Markdown and HTML pairs skip Pandoc', function (assert) {
		assert.true(convertsLocally('markdown', 'html'));
		assert.true(convertsLocally('html', 'gfm'));
		assert.true(convertsLocally('gfm', 'commonmark'));
		assert.false(convertsLocally('markdown', 'docx'));
		assert.false(convertsLocally('latex', 'html'));
	});

	test('markdown to an html fragment', function (assert) {
		const html = convertLocally(MD, 'markdown', 'html', false);
		assert.true(html.startsWith('<h1>Notes</h1>'), html);
		assert.true(html.includes('<strong>bold</strong>'), html);
		assert.true(html.includes('<a href="https://x.test">'), html);
		assert.true(html.includes('<li><p>one</p></li>'), html);
	});

	test('standalone html is a whole page', function (assert) {
		const html = convertLocally(MD, 'markdown', 'html', true);
		assert.true(html.startsWith('<!doctype html>'), html);
		assert.true(html.includes('<style>'), html);
		assert.true(html.includes('<body><h1>Notes</h1>'), html);
	});

	test('html to markdown and between flavours', function (assert) {
		assert.strictEqual(
			convertLocally(
				'<h2>T</h2><p>a <em>b</em></p><ul><li>c</li></ul>',
				'html',
				'gfm',
				false,
			),
			'## T\n\na *b*\n\n* c',
		);
		assert.strictEqual(
			convertLocally(
				'T\n===\n\n+ x',
				'gfm',
				'markdown',
				false,
			),
			'# T\n\n* x',
		);
	});

	test('markdown with a rule and a fence is not rst', function (assert) {
		assert.strictEqual(
			guessFormatFromContent('# A\n\n```\nx\n```\n\n---\n'),
			'markdown',
		);
		assert.strictEqual(
			guessFormatFromContent(
				'Title\n=====\n\n.. note::\n\n   x',
			),
			'rst',
		);
	});
});
