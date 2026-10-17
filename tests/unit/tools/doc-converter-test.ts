import { module, test } from 'qunit';
import {
	isLost,
	ledgerRows,
	parseHtml,
	parseMarkdown,
	parsePandocJson,
	sample,
} from 'delphitools-v2/components/tools/doc-converter/blocks';
import { guessFormatFromContent } from 'delphitools-v2/lib/pandoc/formats';

const text = (s: ReturnType<typeof sample>) => (s.rich ? '' : s.text);

module('Unit | Tool | doc-converter', function () {
	// iOS DocConvertLedger.selfCheck
	test('ledger rows from markdown', function (assert) {
		const rows = ledgerRows(
			parseMarkdown(
				'# A\n\nSome **b** and [c](https://x).\n\n- one\n- two\n\n# D',
			),
		);
		assert.deepEqual(
			rows.map((row) => row.element),
			['heading', 'paragraph', 'bullets', 'bold', 'link'],
		);
		assert.strictEqual(rows[0]!.count, 2);
		assert.strictEqual(rows[2]!.count, 1);
		assert.strictEqual(
			text(sample(rows[0]!.example, 'html')),
			'<h1>A</h1>',
		);
		assert.strictEqual(
			text(sample(rows[2]!.example, 'markdown')),
			'- one',
			"a list's first item",
		);
		assert.strictEqual(
			text(sample(rows[3]!.example, 'plain')),
			'b',
		);
		assert.true(isLost('bold', 'plain'));
		assert.false(isLost('bold', 'rtf'));
		const rich = sample(rows[0]!.example, 'docx');
		assert.true(rich.rich);
		assert.strictEqual(rich.rich ? rich.runs[0]?.text : '', 'A');
	});

	test('markdown blocks and inlines', function (assert) {
		const blocks = parseMarkdown(
			'Title\n===\n\n> *quote*\n\n```\ncode\n```\n\n---\n\n1. x `y`',
		);
		assert.deepEqual(
			blocks.map((block) => block.kind),
			['heading', 'quote', 'code', 'rule', 'list'],
		);
		assert.deepEqual(blocks[4], {
			kind: 'list',
			ordered: true,
			items: [[{ text: 'x ' }, { text: 'y', code: true }]],
		});
		assert.deepEqual(
			parseMarkdown('snake_case_name'),
			[
				{
					kind: 'paragraph',
					runs: [{ text: 'snake_case_name' }],
				},
			],
			'no intraword emphasis',
		);
	});

	test('html reader', function (assert) {
		const blocks = parseHtml(
			'<h2>T</h2><!-- x --><p>a <b>b</b> &amp; <a href="u">l</a></p><ul><li>i</li></ul><hr><script>bad()</script>',
		);
		assert.deepEqual(
			blocks.map((block) => block.kind),
			['heading', 'paragraph', 'list', 'rule'],
		);
		assert.deepEqual(blocks[1], {
			kind: 'paragraph',
			runs: [
				{ text: 'a ' },
				{ text: 'b', bold: true },
				{ text: ' & ' },
				{ text: 'l', link: 'u' },
			],
		});
	});

	test('pandoc json reader', function (assert) {
		const json = JSON.stringify({
			blocks: [
				{
					t: 'Header',
					c: [
						1,
						['', [], []],
						[{ t: 'Str', c: 'Hi' }],
					],
				},
				{
					t: 'Para',
					c: [
						{ t: 'Str', c: 'a' },
						{ t: 'Space' },
						{
							t: 'Strong',
							c: [
								{
									t: 'Str',
									c: 'b',
								},
							],
						},
					],
				},
				{
					t: 'BulletList',
					c: [
						[
							{
								t: 'Plain',
								c: [
									{
										t: 'Str',
										c: 'x',
									},
								],
							},
						],
					],
				},
				{ t: 'HorizontalRule' },
			],
		});
		const blocks = parsePandocJson(json);
		assert.deepEqual(blocks[1], {
			kind: 'paragraph',
			runs: [{ text: 'a ' }, { text: 'b', bold: true }],
		});
		assert.deepEqual(
			ledgerRows(blocks).map((row) => row.element),
			['heading', 'paragraph', 'bullets', 'rule', 'bold'],
		);
		assert.true(isLost('rule', 'docbook'));
	});

	test('samples across writers', function (assert) {
		const [para] = parseMarkdown('**b** [l](u)');
		assert.strictEqual(
			text(sample(para!, 'latex')),
			'\\textbf{b} \\href{u}{l}',
		);
		assert.strictEqual(text(sample(para!, 'org')), '*b* [[u][l]]');
		assert.strictEqual(
			text(sample(para!, 'native')),
			'Para [ Strong [ Str "b" ] , Str " " , Link ( "" , [] , [] ) [ Str "l" ] ( "u" , "" ) ]',
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
