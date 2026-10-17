// what unit tests cannot see
// usage: npm start, then node scripts/verify/text-editor.mjs
//   SHOTS=<dir> also saves 390, 1400 and 2200 wide, light and dark, empty, loaded and settings

import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const shots = process.env.SHOTS;
const { browser, page } = await launch();
// the dirty-document beforeunload prompt
page.on('dialog', (dialog) => void dialog.accept());
await page
	.browserContext()
	.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const downloads = mkdtempSync(join(tmpdir(), 'dt-te-dl-'));
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

const DOC = '# Field notes\n\nThe first paragraph has two sentences. This is the second one.\n\n- one\n- two\n';
const ready = () => page.waitForSelector('.text-editor .dt-editor', { timeout: 15000 });
const open = async (query = '') => {
	await visit(page, `/tools/text-editor${query}`);
	await ready();
	await sleep(300);
};
const tiles = () =>
	page.$$eval('.text-editor .te-figure', (els) =>
		Object.fromEntries(
			els.map((el) => [
				el.querySelector('.te-figure-label').textContent.trim(),
				el.querySelector('.te-figure-value').textContent.trim(),
			]),
		),
	);
const sheetOpen = () => page.evaluate(() => !!document.querySelector('.te-settings[open]'));
const focused = () => page.evaluate(() => document.activeElement?.className ?? '');
const disabled = (sel) => page.$eval(sel, (el) => el.disabled);
const click = (sel) => page.$eval(sel, (el) => el.click());
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

await open();

check(
	'the tool fills the slot',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.text-editor').getBoundingClientRect().height,
	),
);
const span = await page.evaluate(() => {
	const tool = document.querySelector('.text-editor').getBoundingClientRect();
	const pane = document.querySelector('.te-pane').getBoundingClientRect();
	const bar = document.querySelector('.te-bar').getBoundingClientRect();
	const foot = document.querySelector('.te-figures').getBoundingClientRect();
	const sheet = document.querySelector('.te-page').getBoundingClientRect();
	return {
		width: pane.width === tool.width,
		height: Math.round(pane.height + bar.height + foot.height) === Math.round(tool.height),
		bar: Math.round(bar.height),
		page: Math.round(sheet.width),
		centred: Math.abs(sheet.left - pane.left - (pane.right - sheet.right)) <= 1,
		settings: document.querySelectorAll('.te-switch-typewriter').length,
	};
});
check(
	'1400: the editor spans the tool under a slim bar, the page centred at a 680 px measure',
	span.width && span.height && span.bar <= 45 && span.page === 680 + 80 + 16 && span.centred && span.settings === 0,
	JSON.stringify(span),
);
check(
	'empty: the dashed placeholder box',
	await page.$eval('.text-editor .dt-editor', (el) => getComputedStyle(el).borderTopStyle === 'dashed'),
);
check(
	'empty: Clear, Export and Copy are disabled; Files and Full Screen are not',
	(await disabled('.te-clear')) &&
		(await disabled('.te-export')) &&
		(await disabled('.te-copy')) &&
		!(await disabled('.te-files')) &&
		!(await disabled('.te-full')),
);
const zero = await tiles();
check('empty: the tiles read zero', zero.Words === '0' && zero['Reading time'] === '0 min', JSON.stringify(zero));

// typing goes into the big pane
await page.click('.text-editor .dt-editor');
await page.keyboard.type('Hello there world. Second sentence here.');
await sleep(200);
const typed = await tiles();
check('typing in the pane updates the tiles live', typed.Words === '6' && typed.Lines === '1', JSON.stringify(typed));
check(
	'typed: the dashed box is gone and the gutter marks the paragraph',
	await page.evaluate(
		() =>
			getComputedStyle(document.querySelector('.text-editor .dt-editor')).borderTopStyle !== 'dashed' &&
			document.querySelector('.te-gutter-row--lit .te-block-trigger')?.textContent.trim() === '¶',
	),
);
check('typed: Copy is enabled', !(await disabled('.te-copy')));

// selection shows the format bar; Bold marks the text
await page.evaluate(() => {
	const text = document.querySelector('.text-editor .dt-editor p').firstChild;
	const range = document.createRange();
	range.setStart(text, 0);
	range.setEnd(text, 5);
	const sel = getSelection();
	sel.removeAllRanges();
	sel.addRange(range);
});
await sleep(250);
const bubble = await page.evaluate(() => {
	const bar = document.querySelector('.te-bubble');
	if (!bar) return null;
	const box = bar.getBoundingClientRect();
	const pane = document.querySelector('.te-pane').getBoundingClientRect();
	return { inside: box.left >= pane.left && box.right <= pane.right && box.top >= pane.top, n: bar.querySelectorAll('button').length };
});
check('a selection shows the format bar inside the pane', bubble?.inside && bubble.n === 5, JSON.stringify(bubble));
await click('.te-bubble-btn[aria-label="Bold"]');
await sleep(150);
check(
	'Bold marks the selection',
	(await page.$eval('.text-editor .dt-editor', (el) => el.querySelector('strong')?.textContent)) === 'Hello',
);

// block menu from the gutter
await click('.te-block-trigger');
await sleep(250);
const menuOpen = await page.evaluate(() => {
	const panel = document.querySelector('.text-editor .canon-menu[popover]:popover-open, .canon-menu:popover-open');
	return panel ? [...panel.querySelectorAll('[role^="menuitem"]')].map((el) => el.textContent.trim()) : null;
});
check('the gutter mark opens the block menu', menuOpen?.includes('Heading 2') && menuOpen.includes('Paragraph'), JSON.stringify(menuOpen));
await page.evaluate(() =>
	[...document.querySelectorAll('.canon-menu:popover-open [role^="menuitem"]')]
		.find((el) => el.textContent.trim() === 'Heading 2')
		?.click(),
);
await sleep(250);
check(
	'picking Heading 2 turns the block into a heading, marked H2',
	(await page.$eval('.text-editor .dt-editor', (el) => !!el.querySelector('h2'))) &&
		(await page.$eval('.te-block-trigger', (el) => el.textContent.trim())) === 'H2',
);

// Clear is one undo step
await click('.te-clear');
await sleep(200);
check('Clear empties the document', (await tiles()).Words === '0');
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(200);
check('undo brings the cleared text back', (await tiles()).Words === '6');

// file drop anywhere loads a document
await page.evaluate((text) => {
	const transfer = new DataTransfer();
	transfer.items.add(new File([text], 'notes.md', { type: 'text/markdown' }));
	document.querySelector('.te-bar').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }));
}, DOC);
await sleep(400);
check(
	'a file dropped on the bar loads into the editor',
	(await page.$eval('.text-editor .dt-editor h1', (h) => h.textContent.trim()).catch(() => null)) === 'Field notes',
);
const loaded = await tiles();
check('loaded: tiles count the document', loaded.Words === '15' && loaded.Lines === '4', JSON.stringify(loaded));

// Copy: the markdown, through the toast
await click('.te-copy');
await sleep(300);
const copied = await clipboard();
check('Copy copies the Markdown', copied.startsWith('# Field notes') && /[-*] one/.test(copied), JSON.stringify(copied.slice(0, 40)));
check('Copy confirms through the toast', await page.evaluate(() => !!document.querySelector('.canon-toast')));

// Source mode round trip
await click('.te-source-toggle');
await sleep(200);
const source = await page.$eval('.te-source', (el) => el.value).catch(() => null);
check('Source shows the raw Markdown', source?.startsWith('# Field notes'), JSON.stringify(source?.slice(0, 30)));
check('Source is pressed', (await page.$eval('.te-source-toggle', (el) => el.getAttribute('aria-pressed'))) === 'true');
await page.$eval('.te-source', (el) => {
	el.value = '## Edited\n\nNew body text.';
	el.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(100);
check('source edits count live', (await tiles()).Words === '5');
await click('.te-source-toggle');
await sleep(250);
check(
	'leaving Source parses the edit back',
	(await page.$eval('.text-editor .dt-editor h2', (h) => h.textContent.trim()).catch(() => null)) === 'Edited',
);

// Export menu: Markdown downloads
await click('.te-export');
await sleep(250);
const exportTitles = await page.evaluate(() =>
	[...document.querySelectorAll('.canon-menu:popover-open [role^="menuitem"]')].map((el) => el.textContent.trim()),
);
check(
	'Export lists Markdown, HTML, rich text and PDF',
	JSON.stringify(exportTitles) === JSON.stringify(['Markdown (.md)', 'HTML (.html)', 'Copy as rich text', 'PDF (print)']),
	JSON.stringify(exportTitles),
);
await page.evaluate(() =>
	[...document.querySelectorAll('.canon-menu:popover-open [role^="menuitem"]')][0]?.click(),
);
const md = await waitForDownload(/\.md$/);
check('Markdown (.md) downloads the document', md?.name === 'document.md' && md.text.includes('## Edited'), md?.name);
await click('.te-export');
await sleep(250);
await page.evaluate(() =>
	[...document.querySelectorAll('.canon-menu:popover-open [role^="menuitem"]')][1]?.click(),
);
const html = await waitForDownload(/\.html$/);
check('HTML (.html) downloads the document', html?.text.includes('<h2>Edited</h2>'), html?.name);

// settings: the sheet from the Settings cell, by keyboard
await page.focus('.te-settings-cell');
await page.keyboard.press('Enter');
await sleep(400);
const sheet = await page.evaluate(() => {
	const el = document.querySelector('.te-settings[open]');
	const box = el?.getBoundingClientRect();
	return (
		el && {
			right: Math.round(box.right),
			top: Math.round(box.top),
			h: Math.round(box.height),
			modal: el.matches(':modal'),
			focusInside: el.contains(document.activeElement),
		}
	);
});
check(
	'Enter on Settings opens the full-height sheet at the end edge, modal, focus inside',
	sheet?.modal && sheet.right === 1400 && sheet.top === 0 && sheet.h === 1000 && sheet.focusInside,
	JSON.stringify(sheet),
);
check('the Settings cell reports the open sheet', (await page.$eval('.te-settings-cell', (el) => el.getAttribute('aria-expanded'))) === 'true');
const reached = new Set();
for (let i = 0; i < 20; i += 1) {
	await page.keyboard.press('Tab');
	// a modal dialog wraps through the browser's own UI, which reads as body
	reached.add(
		await page.evaluate(() => {
			const el = document.activeElement;
			if (el === document.body) return 'body';
			return el.closest('.te-settings') ? el.className : 'outside';
		}),
	);
}
check(
	'Tab stays in the sheet and reaches the font, the switches and the field switches',
	!reached.has('outside') &&
		[...reached].some((c) => /te-switch-typewriter/.test(c)) &&
		[...reached].some((c) => /te-field-words/.test(c)) &&
		[...reached].some((c) => /canon-button--segment/.test(c)),
	JSON.stringify([...reached]),
);
await click('.te-switch-highlightParagraph');
await click('.te-switch-dimInactive');
await click('.te-switch-showGutter');
await sleep(150);
check('Show gutter off disables the field switches', await disabled('.te-field-words'));
await page.$$eval('.te-settings .canon-segmented[aria-label="Font"] button', (els) =>
	els.find((el) => el.textContent.trim() === 'Serif')?.click(),
);
await sleep(100);
const unnamedInSheet = await page.evaluate(() =>
	[...document.querySelectorAll('.te-settings button, .te-settings input')]
		.filter((el) => !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent.trim()))
		.map((el) => el.className),
);
check('every sheet control has a name', unnamedInSheet.length === 0, JSON.stringify(unnamedInSheet));
await page.keyboard.press('Escape');
await sleep(400);
check('Escape closes the sheet', !(await sheetOpen()));
check('and focus returns to the Settings cell', /te-settings-cell/.test(await focused()), await focused());
await page.click('.te-settings-cell');
await sleep(400);
check('a click on Settings opens it again', await sheetOpen());
await page.mouse.click(100, 500);
await sleep(400);
check(
	'a click on the backdrop closes it, focus on the cell',
	!(await sheetOpen()) && /te-settings-cell/.test(await focused()),
	await focused(),
);

await page.click('.text-editor .dt-editor p');
await sleep(150);
check('Highlight current paragraph lights the caret block', await page.evaluate(() => !!document.querySelector('.pm-para-active')));
check('Dim inactive paragraphs dims the others', await page.evaluate(() => !!document.querySelector('.pm-dim')));
check('Show gutter off hides the marks', (await page.$('.te-gutter')) === null);
check(
	'Font Serif sets the editor in a serif',
	await page.$eval('.text-editor .dt-editor', (el) => /Georgia|Iowan|serif/.test(getComputedStyle(el).fontFamily)),
);

// keyboard: every control reachable and named
const unnamed = await page.evaluate(() =>
	[...document.querySelectorAll('.text-editor button, .text-editor input:not([type=file]), .text-editor textarea')]
		.filter((el) => !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent.trim()))
		.map((el) => el.className),
);
check('every control has a name', unnamed.length === 0, JSON.stringify(unnamed));

// full screen, and Escape back out
await click('.te-full');
await sleep(400);
const full = await page.evaluate(() => {
	const pane = document.querySelector('.te-pane').getBoundingClientRect();
	return { w: pane.width, h: pane.height, count: document.querySelector('.te-count')?.textContent.trim() };
});
check(
	'Full Screen fills the window with the count',
	full.w === 1400 && full.h === 1000 && /words/.test(full.count ?? ''),
	JSON.stringify(full),
);
await page.keyboard.press('Escape');
await sleep(400);
check(
	'Escape leaves full screen',
	await page.evaluate(() => !document.fullscreenElement && !document.querySelector('.te-pane--zen')),
);

// the iPhone path: no element full screen, the overlay
await page.evaluate(() => {
	Element.prototype.requestFullscreen = undefined;
});
await click('.te-full');
await sleep(300);
const overlay = await page.evaluate(() => {
	const pane = document.querySelector('.te-pane').getBoundingClientRect();
	return { w: pane.width, h: pane.height, top: pane.top };
});
check('with no full screen API the overlay covers the window', overlay.w === 1400 && overlay.h === 1000 && overlay.top === 0, JSON.stringify(overlay));
await click('.te-zen-bar button');
await sleep(200);
check('Exit closes the overlay', (await page.$('.te-pane--zen')) === null);

// phone
await page.setViewport({ width: 390, height: 844 });
await open(`?teText=${encodeURIComponent(DOC.repeat(4))}`);
const phone = await page.evaluate(() => {
	const tool = document.querySelector('.text-editor').getBoundingClientRect();
	const pane = document.querySelector('.te-pane').getBoundingClientRect();
	const scroll = document.querySelector('.te-scroll');
	return {
		width: pane.width === tool.width,
		tall: pane.height > 600,
		scrolls: scroll.scrollHeight > scroll.clientHeight,
		symbols: document.querySelector('.te-bar').hasAttribute('data-symbol-only'),
		overflow: document.documentElement.scrollWidth > window.innerWidth,
	};
});
check(
	'390: the editor spans the tool and scrolls inside, the bar shows symbols, no sideways scroll',
	phone.width && phone.tall && phone.scrolls && phone.symbols && !phone.overflow,
	JSON.stringify(phone),
);
await click('.te-settings-cell');
await sleep(400);
const phoneSheet = await page.evaluate(() => {
	const box = document.querySelector('.te-settings[open]')?.getBoundingClientRect();
	return box && { left: Math.round(box.left), right: Math.round(box.right), h: Math.round(box.height) };
});
check(
	'390: the sheet fits the window',
	phoneSheet?.left >= 24 && phoneSheet.right === 390 && phoneSheet.h === 844,
	JSON.stringify(phoneSheet),
);
await page.keyboard.press('Escape');
await sleep(400);

if (shots) {
	const sizes = [
		[390, 844],
		[1400, 1000],
		[2200, 1100],
	];
	for (const theme of ['light', 'dark'])
		for (const [width, height] of sizes)
			for (const [state, query] of [
				['empty', ''],
				['loaded', `?teText=${encodeURIComponent(DOC)}&teParagraph=1&teFields=words,chars`],
			]) {
				await page.setViewport({ width, height });
				await open(query);
				await page.evaluate((t) => {
					document.documentElement.classList.toggle('dark', t === 'dark');
					document.documentElement.classList.toggle('light', t === 'light');
				}, theme);
				await sleep(500);
				await page.screenshot({ path: `${shots}/text-editor-${width}-${theme}-${state}.png` });
				if (state !== 'loaded') continue;
				await click('.te-settings-cell');
				await sleep(500);
				await page.screenshot({ path: `${shots}/text-editor-${width}-${theme}-settings.png` });
				await page.keyboard.press('Escape');
				await sleep(400);
			}
	await page.setViewport({ width: 1400, height: 1000 });
	await open(`?teText=${encodeURIComponent(DOC)}`);
	await page.evaluate(() => {
		const text = document.querySelector('.text-editor .dt-editor p').firstChild;
		const range = document.createRange();
		range.setStart(text, 4);
		range.setEnd(text, 15);
		getSelection().removeAllRanges();
		getSelection().addRange(range);
	});
	await sleep(250);
	await click('.te-block-trigger');
	await sleep(300);
	await page.screenshot({ path: `${shots}/text-editor-1400-menu.png` });
	await page.keyboard.press('Escape');
	await page.evaluate(() => {
		Element.prototype.requestFullscreen = undefined;
	});
	await click('.te-full');
	await sleep(400);
	await page.screenshot({ path: `${shots}/text-editor-1400-full.png` });
}

await finish(browser);
