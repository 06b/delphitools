// what unit tests cannot see
// usage: npm start, then node scripts/verify/json-formatter.mjs
//   SHOTS=<dir> also saves 390, 1400 and 2200 wide, light and dark

import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const shots = process.env.SHOTS;
const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const downloads = mkdtempSync(join(tmpdir(), 'dt-jf-dl-'));
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

const settle = () => sleep(150);

const typing = (text) =>
	page.$eval(
		'.jf-source',
		(el, value) => {
			el.value = value;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		},
		text,
	);

const pick = (group, label) =>
	page.$$eval(
		`.json-formatter .canon-segmented[aria-label="${group}"] button`,
		(els, l) => els.find((el) => el.textContent.trim() === l)?.click(),
		label,
	);

const listing = () =>
	page.evaluate(() =>
		[...document.querySelectorAll('.jf-listing-line')]
			.map((el) => el.lastElementChild.textContent)
			.join('\n'),
	);
const source = () => page.$eval('.jf-source', (el) => el.value);
const treeRows = () =>
	page.$$eval('.jf-tree-row', (els) => els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()));
const tiles = () =>
	page.$$eval('.json-formatter .canon-tiles-tile', (els) =>
		Object.fromEntries(
			els.map((el) => [
				el.querySelector('.canon-tiles-label').textContent.trim(),
				el.querySelector('.canon-tiles-value').textContent.trim(),
			]),
		),
	);
const disabled = (sel) => page.$eval(sel, (el) => el.disabled);

async function waitForDownload(match, timeout = 15000) {
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		const name = readdirSync(downloads).find((n) => match.test(n) && !n.endsWith('.crdownload'));
		if (name) return { name, text: readFileSync(join(downloads, name), 'utf8') };
		await sleep(150);
	}
	return null;
}

const DOC = '{"a":1,"b":{"c":[2,3]}}';
const TWO = '{\n  "a": 1,\n  "b": {\n    "c": [\n      2,\n      3\n    ]\n  }\n}';

await visit(page, '/tools/json-formatter');

check(
	'the split fills the slot',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.json-formatter').getBoundingClientRect().height,
	),
);
const editor = await page.evaluate(() => {
	const area = document.querySelector('.jf-source');
	const split = document.querySelector('.json-formatter').getBoundingClientRect();
	return {
		inPicture: document.querySelector('.canon-split-sidebar').contains(area),
		named: area.getAttribute('aria-label'),
		dashed: getComputedStyle(area).borderTopStyle,
		share: area.getBoundingClientRect().width / split.width,
		height: area.getBoundingClientRect().height,
	};
});
check(
	'the source is typed in the picture pane, the dashed box when empty',
	editor.inPicture && editor.named === 'Source' && editor.dashed === 'dashed' && editor.share > 0.4,
	JSON.stringify(editor),
);
check(
	'defaults: 2 spaces and Text are picked',
	await page.evaluate(() => {
		const on = (g) =>
			document
				.querySelector(`.canon-segmented[aria-label="${g}"] [aria-checked="true"]`)
				?.textContent.trim();
		return on('Indent') === '2 spaces' && on('View') === 'Text';
	}),
);
check(
	'defaults: copy and download are disabled, the empty row shows',
	(await disabled('.jf-copy')) &&
		(await disabled('.jf-download')) &&
		(await page.$eval('.json-formatter .canon-empty-row', (el) => el.textContent.trim())) === 'None',
);
check(
	'empty: the dashed Document box and dashes in the tiles',
	(await page.$eval('.jf-shape-empty', (el) => el.textContent.trim())) === 'Document' &&
		Object.values(await tiles()).every((v) => v === '—'),
);

await page.click('.jf-source');
await page.keyboard.type('{"a":1');
await settle();
check('live: a half-typed document is invalid at once', !!(await page.$('.jf-error')));
await page.keyboard.type('}');
await settle();
check('live: the closing brace formats it', (await listing()) === '{\n  "a": 1\n}');

await typing(DOC);
await settle();
check('2 spaces formats the document', (await listing()) === TWO);
const t = await tiles();
check(
	'tiles read size, depth, keys and values',
	t.Size === `${TWO.length} B` && t.Depth === '3' && t.Keys === '3' && t.Values === '3',
	JSON.stringify(t),
);
check(
	'the listing is coloured by token and numbered',
	await page.evaluate(
		() =>
			document.querySelector('.jf-listing .jf-t--key')?.textContent === '"a"' &&
			document.querySelector('.jf-listing .jf-t--number')?.textContent === '1' &&
			document.querySelectorAll('.jf-listing .jf-gutter').length === 9,
	),
);
check(
	'the marks sit under the editor in the same type',
	await page.evaluate(() => {
		const a = getComputedStyle(document.querySelector('.jf-mark-text'));
		const b = getComputedStyle(document.querySelector('.jf-source'));
		const ra = document.querySelector('.jf-mark-text').getBoundingClientRect();
		const rb = document.querySelector('.jf-source').getBoundingClientRect();
		return (
			a.fontFamily === b.fontFamily &&
			a.fontSize === b.fontSize &&
			a.lineHeight === b.lineHeight &&
			Math.abs(ra.right - rb.right) < 1 &&
			Math.abs(ra.left - (rb.left + parseFloat(b.paddingLeft))) < 1 &&
			b.color === 'rgba(0, 0, 0, 0)' &&
			a.fontFamily.includes('Iosevka')
		);
	}),
);

await pick('Indent', '4 spaces');
await settle();
check('4 spaces', (await listing()) === JSON.stringify(JSON.parse(DOC), null, 4));
await pick('Indent', 'Tabs');
await settle();
check('tabs', (await listing()) === JSON.stringify(JSON.parse(DOC), null, '\t'));
await pick('Indent', 'Minify');
await settle();
check('minify emits one line', (await listing()) === DOC);
await pick('Indent', '2 spaces');
await settle();

await page.click('.jf-copy');
await sleep(300);
check(
	'copy writes the formatted text and confirms through the toast',
	(await page.evaluate(() => navigator.clipboard.readText())) === TWO &&
		!!(await page.$('.canon-toast')),
);

await page.click('.jf-download');
const download = await waitForDownload(/^formatted\.json$/);
check('Download writes formatted.json with the formatted text', download?.text === TWO, download?.name ?? 'none');

// the picture
const cells = () => page.$$eval('.jf-cell', (els) => els.map((el) => el.dataset.path));
check(
	'the shape draws a cell per value',
	(await cells()).join() === 'root,root.0,root.1,root.1.0,root.1.0.0,root.1.0.1',
	(await cells()).join(),
);
check(
	'the legend names the kinds present',
	(await page.$$eval('.jf-legend', (els) => els.map((el) => el.textContent.trim()))).join() ===
		'Object,Array,Number',
);
await page.click('.jf-cell[data-path="root.1"]');
await sleep(700);
check(
	'a container cell zooms in: the focus and its contents',
	(await cells()).join() === 'root.1,root.1.0,root.1.0.0,root.1.0.1' &&
		(await page.$eval('.jf-cell[data-path="root.1"]', (el) => el.style.left === '0%')),
	(await cells()).join(),
);
check(
	'the selected cell lights its line in the listing',
	(await page.$eval('.jf-listing-line.jf-row--selected', (el) => el.lastElementChild.textContent)) === '  "b": {',
);
await page.click('.jf-cell[data-path="root.1"]');
await sleep(700);
check('the focus cell zooms out', (await cells()).length === 6);

await page.focus('.jf-shape-rows');
await page.keyboard.press('ArrowDown');
await settle();
check(
	'arrow keys move the selection, read aloud',
	(await page.$eval('.jf-cell--selected', (el) => el.dataset.path)) === 'root.0' &&
		(await page.$eval('.jf-shape output', (el) => el.textContent.trim())) === 'a 1',
);
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await sleep(700);
check('Enter zooms into the selected container', (await cells())[0] === 'root.1');
await page.keyboard.press('Escape');
await sleep(700);
check('Escape zooms out', (await cells()).length === 6);

// tree
await pick('View', 'Tree');
await settle();
check(
	'the tree lists every node in the iOS form',
	(await treeRows()).join(' | ') === '▾ {2} | a: 1 | ▾ b: {1} | ▾ c: [2] | 0: 2 | 1: 3',
	(await treeRows()).join(' | '),
);
await page.click('.jf-tree-row--container');
await settle();
check('collapsing the root withholds every child', (await treeRows()).join() === '▸ {2}');
await page.click('.jf-cell[data-path="root.1.0.1"]');
await settle();
check(
	'a tap in the picture opens the rows above it and lights its row',
	(await treeRows()).length === 6 &&
		(await page.$eval('.jf-tree .jf-row--selected', (el) => el.textContent.replace(/\s+/g, ' ').trim())) ===
			'1: 3',
);
check(
	'tree rows are named buttons with their state',
	(await page.$$eval('.jf-tree-row--container', (els) => els.map((el) => el.getAttribute('aria-expanded')))).join() ===
		'true,true,true',
);
await pick('View', 'Text');
await settle();

// errors
await typing('{\n  "a": 1,\n  "b": tru\n}');
await settle();
const status = await page.$eval('.jf-error', (el) => el.textContent.trim());
check('invalid JSON shows the message and line:column', /·\s+3:\d+$/.test(status), status);
check(
	'the excerpt marks the offending character',
	(await page.$eval('.jf-excerpt', (el) => el.textContent)) === '  "b": tru' &&
		!!(await page.$('.jf-excerpt-at, .jf-excerpt-caret')),
	await page.$eval('.jf-excerpt', (el) => el.textContent),
);
check(
	'the offending source line is tinted in the editor',
	/"b": tru/.test(await page.$eval('.jf-mark-line--error', (el) => el.textContent)),
);
check(
	'invalid: the Invalid box, the head status, copy and download off',
	(await page.$eval('.jf-shape-empty--invalid', (el) => el.textContent.trim())) === 'Invalid' &&
		(await page.$eval('.jf-editor-head .canon-status', (el) => el.textContent.trim())) === 'Invalid' &&
		(await disabled('.jf-copy')) &&
		(await disabled('.jf-download')),
);

// files
const fixture = join(downloads, 'rig-fixture.json');
writeFileSync(fixture, '﻿{"from":"file","nested":{"ok":true}}');
await (await page.$('.jf-editor-head input[type="file"]')).uploadFile(fixture);
await sleep(400);
check('opening a file loads it, BOM dropped', (await source()) === '{"from":"file","nested":{"ok":true}}');
check(
	'the head names the file',
	(await page.$eval('.jf-editor-file', (el) => el.textContent.trim())) === 'rig-fixture.json',
);

await page.$eval('.jf-source', (el) => {
	const transfer = new DataTransfer();
	transfer.items.add(new File(['{"dropped":true}'], 'drop.json', { type: 'application/json' }));
	el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
});
await sleep(400);
check('dropping a file loads it', (await source()) === '{"dropped":true}');

await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(new File(['{"pasted":1}'], 'paste.json', { type: 'application/json' }));
	document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }));
});
await sleep(400);
check('pasting a file anywhere loads it', (await source()) === '{"pasted":1}');

await page.evaluate(() => navigator.clipboard.writeText('[true,null]'));
await page.click('.jf-editor-head [aria-label="Paste"]');
await sleep(300);
check('Paste takes the clipboard text', (await source()) === '[true,null]');

await page.click('.jf-editor-head [aria-label="Clear"]');
await settle();
check('Clear empties the source and the result', (await source()) === '' && !(await page.$('.jf-listing')));

// query flags
await visit(page, '/tools/json-formatter?jsonSample=1&jsonIndent=1&jsonTree=1&jsonCollapse=root.3');
check(
	'?jsonSample ?jsonIndent ?jsonTree ?jsonCollapse set up a state',
	(await page.$eval('.canon-segmented[aria-label="Indent"] [aria-checked="true"]', (el) => el.textContent.trim())) ===
		'4 spaces' &&
		(await treeRows()).some((row) => row === '▸ tools: [3]'),
	(await treeRows()).slice(0, 6).join(' | '),
);
await visit(page, '/tools/json-formatter?jsonSample=1&jsonTaps=root.3|root.3.1');
check(
	'?jsonTaps zooms the picture',
	(await cells())[0] === 'root.3.1' && (await page.$eval('.jf-cell--selected', (el) => el.dataset.path)) === 'root.3.1',
	(await cells()).slice(0, 3).join(),
);
check(
	'the document never scrolls',
	await page.evaluate(() => document.scrollingElement.scrollTop === 0),
);

// phone: one column, the picture collapses
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/json-formatter?jsonSample=1');
const phone = await page.evaluate(() => {
	const split = document.querySelector('.json-formatter');
	const body = split.querySelector('.canon-split-body');
	const before = split.querySelector('.canon-split-sidebar .canon-canvas').getBoundingClientRect().height;
	body.scrollTop = 400;
	return new Promise((resolve) =>
		requestAnimationFrame(() =>
			resolve({
				collapsing: split.hasAttribute('data-collapsing'),
				before,
				after: split.querySelector('.canon-split-sidebar .canon-canvas').getBoundingClientRect().height,
				overflow: document.documentElement.scrollWidth > window.innerWidth,
			}),
		),
	);
});
check(
	'390: stacked, the editor picture collapses to 150 on scroll, no sideways scroll',
	phone.collapsing && phone.after === 150 && phone.before > phone.after && !phone.overflow,
	JSON.stringify(phone),
);

if (shots) {
	const sizes = [
		[390, 844],
		[1400, 1000],
		[2200, 1100],
	];
	for (const theme of ['light', 'dark'])
		for (const [width, height] of sizes) {
			await page.setViewport({ width, height });
			await visit(page, '/tools/json-formatter?jsonSample=1&jsonTaps=root.3');
			await page.evaluate((t) => {
				document.documentElement.classList.toggle('dark', t === 'dark');
				document.documentElement.classList.toggle('light', t === 'light');
			}, theme);
			await sleep(700);
			await page.screenshot({ path: `${shots}/json-formatter-${width}-${theme}.png` });
		}
	await page.setViewport({ width: 1400, height: 1000 });
	await visit(page, '/tools/json-formatter?jsonSample=invalid');
	await page.screenshot({ path: `${shots}/json-formatter-1400-invalid.png` });
	await visit(page, '/tools/json-formatter?jsonSample=deep&jsonTree=1');
	await page.screenshot({ path: `${shots}/json-formatter-1400-tree.png` });
	await visit(page, '/tools/json-formatter');
	await page.screenshot({ path: `${shots}/json-formatter-1400-empty.png` });
}

await finish(browser);
