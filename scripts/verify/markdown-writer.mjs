// what unit tests cannot see
// usage: npm start, then node scripts/verify/markdown-writer.mjs
//   SHOTS=<dir> also saves 390, 1400 and 2200 wide, light and dark, empty and loaded

import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const shots = process.env.SHOTS;
const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const downloads = mkdtempSync(join(tmpdir(), 'dt-mw-dl-'));
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

let dialogs = [];
page.on('dialog', (dialog) => {
	dialogs.push(dialog.message());
	void dialog.accept();
});

const settle = () => sleep(150);
const KEY = 'delphitools-scratchpad';

const typing = (text) =>
	page.$eval(
		'.mw-source',
		(el, value) => {
			el.value = value;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		},
		text,
	);
const source = () => page.$eval('.mw-source', (el) => el.value);
const press = (label) =>
	page.$$eval(
		'.markdown-writer .canon-button',
		(els, l) => {
			const el = els.find((b) => b.textContent.trim() === l);
			el?.click();
			return !!el;
		},
		label,
	);
const button = (label) =>
	page.$$eval(
		'.markdown-writer .canon-button',
		(els, l) => {
			const el = els.find((b) => b.textContent.trim() === l);
			return el ? { disabled: el.disabled, focused: el === document.activeElement } : null;
		},
		label,
	);
const field = (name, value) =>
	page.$eval(
		`.mw-field input[aria-label="${name}"]`,
		(el, v) => {
			el.value = v;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		},
		value,
	);
const counts = () => page.$eval('.mw-counts', (el) => el.getAttribute('aria-label'));
const hits = () => page.$$eval('.mw-hit', (els) => els.map((el) => el.textContent));
const statusTexts = () =>
	page.$$eval('.markdown-writer .canon-status', (els) => els.map((el) => el.textContent.trim()));
const heading = (n) =>
	page.$$eval('.markdown-writer .canon-heading', (els, i) => els[i]?.textContent.trim(), n);
const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

async function waitForDownload(match, timeout = 15000) {
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		const name = readdirSync(downloads).find((n) => match.test(n) && !n.endsWith('.crdownload'));
		if (name) return { name, text: readFileSync(join(downloads, name), 'utf8') };
		await sleep(150);
	}
	return null;
}

await visit(page, '/tools/markdown-writer');
await page.evaluate((key) => localStorage.removeItem(key), KEY);
await visit(page, '/tools/markdown-writer');

check(
	'the split fills the slot',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.markdown-writer').getBoundingClientRect().height,
	),
);
const editor = await page.evaluate(() => {
	const area = document.querySelector('.mw-source');
	const pane = document.querySelector('.canon-split-sidebar').getBoundingClientRect();
	const box = area.getBoundingClientRect();
	return {
		inPicture: document.querySelector('.canon-split-sidebar').contains(area),
		named: area.getAttribute('aria-label'),
		dashed: getComputedStyle(area).borderTopStyle,
		width: box.width / pane.width,
		height: box.height / pane.height,
	};
});
check(
	'the editor is the big pane, the dashed box when empty',
	editor.inPicture &&
		editor.named === 'Text' &&
		editor.dashed === 'dashed' &&
		editor.width > 0.85 &&
		editor.height > 0.75,
	JSON.stringify(editor),
);
check(
	'empty: copy, download and clear are disabled; counts read 0',
	(await button('Copy')).disabled &&
		(await button('Download')).disabled &&
		(await button('Clear')).disabled &&
		(await counts()) === '0 words, 0 chars, 0 lines',
);

await page.click('.mw-source');
await page.keyboard.type('pear apple\nfig');
await settle();
check(
	'typing updates the counts live',
	(await counts()) === '3 words, 14 chars, 2 lines',
	await counts(),
);
check(
	'the marks carry the text under the transparent textarea',
	await page.evaluate(() => {
		const marks = document.querySelector('.mw-marks');
		const area = document.querySelector('.mw-source');
		return (
			marks.textContent === `${area.value} ` &&
			getComputedStyle(area).color === 'rgba(0, 0, 0, 0)' &&
			getComputedStyle(area).borderTopStyle === 'none'
		);
	}),
);

await sleep(1200);
check(
	'the draft saves after a pause, with the time',
	(await page.evaluate((key) => localStorage.getItem(key), KEY)) === 'pear apple\nfig' &&
		(await page.$eval('.mw-saved', (el) => el.textContent.trim().startsWith('Saved'))),
);
await visit(page, '/tools/markdown-writer');
check('a reload restores the draft', (await source()) === 'pear apple\nfig');

await typing('pear\napple\nfig\napple');
// a real click, so the cell takes focus first
await (
	await page.evaluateHandle(() =>
		[...document.querySelectorAll('.markdown-writer .canon-button')].find(
			(b) => b.textContent.trim() === 'Sort A–Z',
		),
	)
).click();
await settle();
check('Sort A–Z sorts the lines', (await source()) === 'apple\napple\nfig\npear', await source());
check('focus stays on the pressed cell', (await button('Sort A–Z')).focused);
await press('Remove Duplicates');
await settle();
check('Remove Duplicates', (await source()) === 'apple\nfig\npear');
await page.$eval('.mw-source', (el) => el.focus());
await page.evaluate(() => document.execCommand('undo'));
await settle();
check(
	'a transform is one undo step',
	(await source()) === 'apple\napple\nfig\npear',
	await source(),
);
await press('UPPERCASE');
await settle();
check('UPPERCASE', (await source()) === 'APPLE\nAPPLE\nFIG\nPEAR');
await press('lowercase');
await press('Add Line Numbers');
await settle();
check('Add Line Numbers', (await source()).startsWith('1. apple'), await source());
await press('Remove Line Numbers');
await press('Join Lines');
await settle();
check('Join Lines', (await source()) === 'apple apple fig pear', await source());

await typing('a/b c');
await press('URL Encode');
await settle();
check('URL Encode', (await source()) === 'a%2Fb%20c');
await press('URL Decode');
await settle();
check('URL Decode', (await source()) === 'a/b c');
await typing('100%');
await press('URL Decode');
await settle();
check(
	'a bad escape shows Invalid escape and keeps the text',
	(await source()) === '100%' && (await statusTexts()).includes('Invalid escape'),
);
await press('Trim Lines');
await settle();
check('the next transform clears the warning', !(await statusTexts()).includes('Invalid escape'));

await typing('Cat cat CAT concat');
await field('Find', 'cat');
await settle();
check(
	'find lights each match live and counts them',
	JSON.stringify(await hits()) === '["cat","cat"]' &&
		(await page.$eval('.mw-find-count', (el) => el.textContent.replace(/\s+/g, ''))) ===
			'2matches2matches',
	JSON.stringify(await hits()),
);
await field('Find', 'zzz');
await settle();
check('no match: Replace and Replace All are disabled', (await button('Replace')).disabled && (await button('Replace All')).disabled);
await field('Find', 'cat');
await field('Replace', 'dog');
await press('Replace');
await settle();
check('Replace changes the first match', (await source()) === 'Cat dog CAT concat');
await press('Replace All');
await settle();
check('Replace All changes the rest', (await source()) === 'Cat dog CAT condog');
await page.click('.mw-find-status input[role="switch"]');
await field('Find', '(');
await settle();
check('a broken pattern shows Invalid regex', (await statusTexts()).includes('Invalid regex'));
await field('Find', 'c\\w+');
await field('Replace', '[$&]');
await settle();
check('regex matches light', JSON.stringify(await hits()) === '["condog"]', JSON.stringify(await hits()));
await press('Replace All');
await settle();
check('regex Replace All keeps $& groups', (await source()) === 'Cat dog CAT [condog]', await source());
await field('Find', '');
await settle();
check('an empty find lights nothing', (await hits()).length === 0);

await typing('mail ruby@delphi.tools and bob@example.org, ruby@delphi.tools; see https://delphi.tools/x');
await press('Emails');
await settle();
const found = await page.$$eval('.markdown-writer .canon-value-line', (els) =>
	els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
);
check(
	'Emails lists each address once, numbered, under N found',
	found.length === 2 && found[0].startsWith('1') && (await heading(5)) === '2 found',
	`${JSON.stringify(found)} ${await heading(5)}`,
);
await press('Copy All');
await sleep(300);
check('Copy All copies every item', (await clipboard()) === 'ruby@delphi.tools\nbob@example.org');
await typing('no numbers here');
await press('Numbers');
await settle();
check(
	'nothing found: the None row and the plain heading',
	(await page.$eval('.markdown-writer .canon-empty-row', (el) => el.textContent.trim())) === 'None' &&
		(await heading(5)) === 'Extract',
);

await press('Copy');
await sleep(300);
check(
	'Copy copies the text and the toast confirms',
	(await clipboard()) === 'no numbers here' &&
		(await page.$eval('.canon-toast-live', (el) => el.textContent.trim())) !== '',
);
await press('Download');
const file = await waitForDownload(/^scratchpad.*\.txt$/);
check('Download saves scratchpad.txt', file?.text === 'no numbers here', file?.name ?? 'none');

const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 3000 }).catch(() => null), press('Files')]);
const picked = join(downloads, 'picked.txt');
writeFileSync(picked, 'from the picker');
dialogs = [];
await chooser?.accept([picked]);
await sleep(400);
check(
	'Files opens a picker; a file asks before it replaces the draft',
	(await source()) === 'from the picker' && dialogs.includes('Replace draft?'),
	`${dialogs} ${await source()}`,
);

await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(new File(['dropped text'], 'notes.txt', { type: 'text/plain' }));
	document
		.querySelector('.canon-split-main')
		.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
});
await sleep(400);
check('a file dropped anywhere on the tool loads', (await source()) === 'dropped text');

dialogs = [];
await press('Clear');
await sleep(300);
check(
	'Clear asks, empties the editor and the saved draft',
	dialogs.includes('Clear all content?') &&
		(await source()) === '' &&
		(await page.evaluate((key) => localStorage.getItem(key), KEY)) === null,
);

await page.evaluate((key) => localStorage.setItem(key, 'saved draft'), KEY);
await visit(page, '/tools/markdown-writer?padText=one\\ntwo&padFind=o&padExtract=numbers');
await typing('one\ntwo!');
await sleep(1200);
check(
	'?padText= loads text without touching the saved draft',
	(await page.evaluate((key) => localStorage.getItem(key), KEY)) === 'saved draft',
);
check('?padFind= lights matches', (await hits()).length === 2);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/markdown-writer');
const phone = await page.evaluate(() => ({
	collapsing: document.querySelector('.markdown-writer').hasAttribute('data-collapsing'),
	overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
	body: document.querySelector('.canon-split-body').scrollWidth - document.querySelector('.canon-split-body').clientWidth,
}));
check('390: stacked, the editor collapses on scroll, no sideways scroll', phone.collapsing && phone.overflow <= 0 && phone.body <= 0, JSON.stringify(phone));

if (shots) {
	const sizes = [
		[390, 844],
		[1400, 1000],
		[2200, 1100],
	];
	const sample =
		'Shopping list\\n\\npear\\napple\\nfig\\napple\\n\\nmail ruby@delphi.tools about https://delphi.tools before 2026-10-20.\\n' +
		'The quick brown fox jumps over the lazy dog. The dog sleeps; the fox runs on.';
	for (const theme of ['light', 'dark'])
		for (const [width, height] of sizes)
			for (const state of ['empty', 'loaded']) {
				await page.setViewport({ width, height });
				await visit(
					page,
					state === 'loaded'
						? `/tools/markdown-writer?padText=${encodeURIComponent(sample)}&padFind=the&padExtract=emails`
						: '/tools/markdown-writer?padText=',
				);
				await page.evaluate((t) => {
					document.documentElement.classList.toggle('dark', t === 'dark');
					document.documentElement.classList.toggle('light', t === 'light');
				}, theme);
				await sleep(600);
				await page.screenshot({ path: `${shots}/markdown-writer-${width}-${theme}-${state}.png` });
			}
}

await finish(browser);
