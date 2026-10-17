// the canon doc-converter: editor, files, format picks, local and Pandoc runs
// usage: bun run start, then node scripts/verify/doc-converter.mjs
//   SKIP_ENGINE=1 skips the Pandoc conversions (they fetch the ~16 MB engine)

import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const DASH = '\u2014';
const MD =
	'# Notes\n\nSome **bold** and [a link](https://example.com).\n\n- one\n- two\n\n## Next';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const downloads = mkdtempSync(join(tmpdir(), 'dt-dc-dl-'));
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

const settle = () => sleep(200);

const tiles = (section) =>
	page.$$eval(`${section} .canon-tiles-tile`, (els) =>
		Object.fromEntries(
			els.map((el) => [
				el.querySelector('.canon-tiles-label').textContent.trim(),
				el.querySelector('.canon-tiles-value').textContent.trim(),
			]),
		),
	);
const type = (text) =>
	page.$eval(
		'.dc-editor',
		(el, value) => {
			el.value = value;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		},
		text,
	);
const disabled = (sel) => page.$eval(sel, (el) => el.disabled);
const text = (sel) =>
	page.evaluate((s) => document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() ?? null, sel);
const PANDOC = /pandoc\.wasm|pandoc\.worker/;
const pandocRequests = [];
page.on('request', (req) => {
	if (PANDOC.test(req.url())) pandocRequests.push(req.url());
});
const dropFile = (content, name, type = '') =>
	page.evaluate(
		(c, n, t) => {
			const data = new DataTransfer();
			data.items.add(new File([c], n, { type: t }));
			const target = document.querySelector('.dc-input');
			for (const kind of ['dragenter', 'dragover', 'drop'])
				target.dispatchEvent(new DragEvent(kind, { dataTransfer: data, bubbles: true, cancelable: true }));
		},
		content,
		name,
		type,
	);
const pickFormat = async (label, query) => {
	await page.$eval(`.dc-format-pick[aria-label^="${label}"]`, (el) => el.click());
	await page.waitForSelector('.dc-format-dialog[open] .canon-command-input');
	await page.type('.dc-format-dialog[open] .canon-command-input', query);
	await page.keyboard.press('Enter');
	await sleep(500);
};
const download = async (match, timeout = 10000) => {
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		const name = readdirSync(downloads).find((n) => match.test(n) && !n.endsWith('.crdownload'));
		if (name) return { name, text: readFileSync(join(downloads, name), 'utf8') };
		await sleep(150);
	}
	return null;
};
const converted = (timeout = 180000) =>
	page.waitForFunction(
		() =>
			document.querySelector('.dc-output .canon-tiles-value')?.textContent.trim() !== '\u2014' ||
			document.querySelector('.dc-error'),
		{ timeout },
	);

await visit(page, '/tools/doc-converter');

check(
	'the split fills the slot',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.doc-converter').getBoundingClientRect().height,
	),
);

// empty: the loaded layout in blank
check('empty: the editor is the dashed box', await page.$eval('.dc-editor', (el) => el.matches(':placeholder-shown') && getComputedStyle(el).borderTopStyle === 'dashed'));
check('empty: the Source heading is there', (await text('.dc-source .canon-heading')) === 'Source');
const blankIn = await tiles('.dc-input');
check('empty: input tiles are dashes', Object.values(blankIn).every((v) => v === DASH) && Object.keys(blankIn).join() === 'Name,Format,Size,Words', JSON.stringify(blankIn));
const blankOut = await tiles('.dc-output');
check('empty: output tiles are dashes', Object.values(blankOut).every((v) => v === DASH) && Object.keys(blankOut).join() === 'Name,Format,Size,Lines', JSON.stringify(blankOut));
check('empty: Convert, Download and Clear are disabled', (await disabled('.dc-convert')) && (await disabled('.dc-save')) && (await disabled('.dc-clear')));
check('empty: settings are enabled', !(await page.$$eval('.dc-settings button', (els) => els.some((el) => el.disabled && !el.classList.contains('dc-swap')))));
check('no banner above the panes', !(await page.$('.doc-converter .canon-split-banner')));
check('empty: the source cell reads Auto-detect', (await text('.dc-format-pick')) === 'Auto-detect');
check('empty: swap is disabled with auto-detect', await disabled('.dc-swap'));

// typed markdown
await type(MD);
await settle();
const typedIn = await tiles('.dc-input');
check('input tiles: format and words', typedIn.Format === 'Markdown' && typedIn.Words === '13' && typedIn.Name === DASH, JSON.stringify(typedIn));
check('typed: Convert is enabled and named for the target', !(await disabled('.dc-convert')) && (await text('.dc-convert')) === 'Convert to HTML');
check('typed: the source cell names the detection', (await text('.dc-format-pick')) === 'Auto-detect · Markdown');

// markdown and html convert in the browser, no engine
await page.click('.dc-convert');
await converted(5000);
let out = await tiles('.dc-output');
check('local: Markdown to HTML completes', out.Name === 'document.html' && out.Format === 'HTML' && Number(out.Lines) > 10, JSON.stringify(out));
check('local: the code block shows a standalone page', /^<!doctype html>[\s\S]*<h1>Notes<\/h1>/.test((await page.$eval('.dc-code', (el) => el.textContent)).trim()));
await page.click('.dc-save');
let file = await download(/^document\.html$/);
check('local: Download saves document.html', !!file?.text.includes('<strong>bold</strong>'));
await pickFormat('Target format', 'github');
await page.click('.dc-convert');
await converted(5000);
check('local: Markdown to GitHub Markdown completes', (await tiles('.dc-output')).Name === 'document.md' && ((await text('.dc-code')) ?? '').startsWith('# Notes'));
await type('<h1>T</h1><p>a <em>b</em></p><hr>');
await pickFormat('Target format', 'commonmark');
await page.click('.dc-convert');
await converted(5000);
const cm = await page.$eval('.dc-code', (el) => el.textContent.trim());
check('local: HTML to CommonMark completes', cm.startsWith('# T\n\na *b*\n\n---'), JSON.stringify(cm));
check('local: no Pandoc request', pandocRequests.length === 0, pandocRequests.join(' '));

// target pick, searchable
await type(MD);
await pickFormat('Target format', 'latex');
check('format pick: search and Enter picks LaTeX', (await text('.dc-convert')) === 'Convert to LaTeX');
await pickFormat('Target format', 'word');
check('standalone is off for file targets', await page.$eval('.dc-standalone [role="switch"], .dc-standalone button', (el) => el.disabled || el.getAttribute('aria-disabled') === 'true'));

// swap needs an explicit source
await pickFormat('Source format', 'html');
await pickFormat('Target format', 'markdown');
check('swap: enabled for HTML to Markdown', !(await disabled('.dc-swap')));
await page.click('.dc-swap');
await settle();
check('swap: swaps the pair', (await page.$$eval('.dc-format-pick', (els) => els.map((e) => e.textContent.trim()).join(' > '))) === 'Markdown > HTML');
await pickFormat('Source format', 'auto');

// files and paste
await dropFile('# From a file\n\nText.', 'readme.md', 'text/markdown');
await sleep(400);
const fromFile = await tiles('.dc-input');
check('drop: a text file loads into the editor', (await page.$eval('.dc-editor', (el) => el.value)).startsWith('# From a file') && fromFile.Name === 'readme.md', JSON.stringify(fromFile));
await dropFile('PK\u0003\u0004binary', 'letter.docx');
await sleep(300);
check('drop: a Word file shows as a file row', !(await page.$('.dc-editor')) && (await text('.dc-file .canon-row-title')) === 'letter.docx');
const word = await tiles('.dc-input');
check('drop: Word input tiles', word.Format === 'Word' && word.Words === DASH && word.Name === 'letter.docx', JSON.stringify(word));
check('drop: a Word file can convert', !(await disabled('.dc-convert')));
await page.click('.dc-clear');
await settle();
check('clear: back to the empty editor', await page.$eval('.dc-editor', (el) => el.value === ''));
await dropFile('x', 'photo.png', 'image/png');
await sleep(300);
check('drop: an image is refused with the web message', ((await text('.dc-file-error')) ?? '').startsWith("Pandoc can't read PNG images.") && (await disabled('.dc-convert')));
await page.click('.dc-clear');
await settle();

await page.evaluate(() => {
	const data = new DataTransfer();
	data.setData('text/plain', '# Pasted\n\nbody');
	document.querySelector('.dc-input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
});
await settle();
check('paste: text outside a field is the source', (await page.$eval('.dc-editor', (el) => el.value)) === '# Pasted\n\nbody');

await pickFormat('Source format', 'word');
check('a binary source asks for a file', ((await text('.dc-binary')) ?? '').startsWith('Word input must be uploaded') && (await disabled('.dc-convert')));
await pickFormat('Source format', 'auto');

await page.evaluate(() => localStorage.removeItem('delphitools-scratchpad'));
await page.click('.dc-scratchpad');
await settle();
check('scratchpad: empty says so', ((await text('.dc-notice-status')) ?? '').startsWith('Your Text Scratchpad is empty'));
await page.evaluate(() => localStorage.setItem('delphitools-scratchpad', '# Scratch'));
await page.click('.dc-scratchpad');
await settle();
check('scratchpad: loads its text', (await page.$eval('.dc-editor', (el) => el.value)) === '# Scratch');

// launch flags
await visit(page, `/tools/doc-converter?docText=${encodeURIComponent('# A\\n\\nb')}&docTo=latex`);
check('flags: ?docText and ?docTo', (await page.$eval('.dc-editor', (el) => el.value)) === '# A\n\nb' && (await text('.dc-convert')) === 'Convert to LaTeX');

// a worker that fails to load ends in an error, not an endless download
{
	const broken = await page.browserContext().newPage();
	await broken.setRequestInterception(true);
	broken.on('request', (req) => {
		const url = req.url();
		if (url.includes('pandoc.wasm')) req.respond({ status: 200, contentType: 'application/wasm', headers: { 'access-control-allow-origin': '*' }, body: Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]) });
		else req.continue();
	});
	// page interception misses worker scripts, so the worker itself throws on load
	await broken.evaluateOnNewDocument(() => {
		const Real = window.Worker;
		window.Worker = class extends Real {
			constructor(url, options) {
				super(URL.createObjectURL(new Blob(['throw new Error("broken worker")'], { type: 'text/javascript' })), options);
			}
		};
	});
	await broken.goto(`${BASE}/tools/doc-converter?docText=${encodeURIComponent('# A')}&docTo=docx&docRun=1`, { waitUntil: 'networkidle2' });
	const failed = await broken
		.waitForFunction(() => document.querySelector('.dc-error') && !document.querySelector('.dc-convert').disabled, { timeout: 15000 })
		.then(() => true, () => false);
	const shown = await broken.evaluate(() => document.querySelector('.dc-error')?.textContent ?? '');
	const retry = await broken.evaluate(() => document.querySelector('.dc-convert').textContent.trim());
	check('engine: a worker load failure shows an error and offers Retry', failed && shown.includes('broken worker') && retry === 'Retry', `${shown} / ${retry}`);
	await broken.close();
}

if (!process.env.SKIP_ENGINE) {
	await visit(page, `/tools/doc-converter?docText=${encodeURIComponent(MD.replaceAll('\n', '\\n'))}&docTo=docx`);
	const started = Date.now();
	await page.click('.dc-convert');
	await converted(120000);
	await page.waitForSelector('.dc-preview', { timeout: 60000 });
	const docx = await tiles('.dc-output');
	check('pandoc: Markdown to Word loads the engine and completes', pandocRequests.some((u) => u.includes('pandoc.wasm')) && docx.Name === 'document.docx' && docx.Size !== DASH && !docx.Lines, `${JSON.stringify(docx)} in ${Date.now() - started} ms`);
	check('pandoc: the preview runs no scripts', (await page.$eval('.dc-preview', (el) => el.getAttribute('sandbox'))) === '');
	await page.click('.dc-save');
	check('pandoc: Download saves document.docx', !!(await download(/^document\.docx$/)));
	await type(MD + '\n\nmore');
	await settle();
	check('an edit clears the result', (await tiles('.dc-output')).Name === DASH);

	await page.click('.dc-toc [role="switch"], .dc-toc button');
	await pickFormat('Target format', 'html');
	await page.click('.dc-convert');
	await converted();
	check('pandoc: a table of contents goes through Pandoc', ((await text('.dc-code')) ?? '').includes('id="TOC"'));

	await visit(page, `/tools/doc-converter?docText=${encodeURIComponent('# A\\n\\nb')}&docFrom=latex&docTo=markdown`);
	await type('\\section{Intro}\n\nSome \\textbf{bold}.');
	await page.click('.dc-convert');
	await converted();
	check('pandoc: LaTeX to Markdown completes', ((await text('.dc-code')) ?? '').includes('**bold**'));
}

for (const width of [390, 1400, 2200]) {
	await page.setViewport({ width, height: 900 });
	await settle();
	check(
		`${width}: no horizontal scroll`,
		await page.evaluate(() => {
			const main = document.querySelector('.dt-main');
			return main.scrollWidth <= main.clientWidth && document.documentElement.scrollWidth <= innerWidth;
		}),
	);
}

await finish(browser);
