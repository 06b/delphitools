// braille-converter: the canon port
//
// Usage: npm start, then node scripts/verify/braille-converter.mjs

import { launch, visit, check, finish, sleep } from './harness.mjs';
import {
	checkActions,
	checkLayout,
	checkNarrow,
	checkPaste,
	grantClipboard,
	headings,
	result,
	setSource,
	typeSource,
} from './text-tool.mjs';

const { browser, page } = await launch();
await grantClipboard(page);

await visit(page, '/tools/braille-converter');
await checkLayout(page, '.braille-converter');
check(
	'an empty source shows the blank cells',
	!!(await page.$('.brl-blank')),
);

const banner = () =>
	page.evaluate(() => ({
		cells: document.querySelectorAll(
			'.brl-glyph--cell, .brl-glyph--indicator',
		).length,
		indicators: document.querySelectorAll('.brl-glyph--indicator').length,
		labels: [...document.querySelectorAll('.brl-label')]
			.map((l) => l.textContent)
			.join(''),
		raised: document.querySelectorAll('.brl-dot').length,
		name: document
			.querySelector('.brl-embossing')
			.getAttribute('aria-label'),
	}));

await typeSource(page, 'Hello 42');
check(
	'text becomes cells with capital and numeric indicators, live',
	(await result(page)) === '⠠⠓⠑⠇⠇⠕ ⠼⠙⠃',
	await result(page),
);
check(
	'the direction reads Text to Braille',
	(await headings(page)).join(' > ') === 'Text > Braille',
	(await headings(page)).join(' > '),
);
check(
	'the first result cell is titled with its dot numbers',
	(await page.$eval('.brl-result-cell', (el) => el.title)) === '6',
);
check(
	'the space is not wrapped as a cell',
	(await page.$$eval('.brl-result-cell', (els) => els.length)) === 9,
);
let b = await banner();
check('the banner embosses nine cells', b.cells === 9, `${b.cells}`);
check('two of them indicators', b.indicators === 2, `${b.indicators}`);
check('each labelled with what it reads', b.labels === '⇧Hello#42', b.labels);
check('and the banner is named by the text', b.name === 'Hello 42', b.name);
const tiles = await page.$$eval('.canon-tiles-value', (els) =>
	els.map((e) => e.textContent.trim()).join(','),
);
// a space is a blank cell on the page
check('page tiles count cells, lines and pages', tiles === '10,1,1', tiles);

await typeSource(page, '⠠⠓⠑⠇⠇⠕');
check('Auto reads cells back to text', (await result(page)) === 'Hello', await result(page));
check(
	'and the headings swap to Braille > Text',
	(await headings(page)).join(' > ') === 'Braille > Text',
	(await headings(page)).join(' > '),
);
b = await banner();
check('the banner shows the typed cells', b.cells === 6, `${b.cells}`);

await page.$$eval('.canon-segmented button', (buttons) =>
	buttons.find((x) => x.textContent.trim() === 'To braille')?.click(),
);
await setSource(page, 'NASA');
check(
	'To braille is the checked segment',
	(await page.$eval('.canon-segmented [aria-checked="true"]', (el) =>
		el.textContent.trim(),
	)) === 'To braille',
);
check(
	'an all-caps word takes the caps-word indicator',
	(await result(page)) === '⠠⠠⠝⠁⠎⠁',
	await result(page),
);

await checkActions(page, '⠠⠠⠝⠁⠎⠁', 'braille.txt');
await checkPaste(page, 'Paste 1');
check('the pasted text converts', (await result(page)) === '⠠⠏⠁⠎⠞⠑ ⠼⠁');

await visit(page, '/tools/braille-converter?brailleText=%E2%A3%BF&brailleMode=2');
check(
	'?brailleMode=2 reads cells',
	(await headings(page))[1] === 'Text',
);
check(
	'an eight-dot cell draws four rows',
	(await page.$$eval('.brl-glyph--cell circle', (els) => els.length)) === 8,
);

// the braille keyboard
const source = () => page.$eval('.tt-source', (el) => el.value);
const keyboardButton = () =>
	page.evaluateHandle(() =>
		[...document.querySelectorAll('.braille-converter button')].find(
			(b) => b.textContent.trim() === 'Keyboard',
		),
	);
const panelOpen = () =>
	page.$eval('.brl-keyboard', (el) => el.matches(':popover-open'));
await visit(page, '/tools/braille-converter?brailleMode=1');
check('To braille has no keyboard', !(await (await keyboardButton()).asElement()));
await visit(page, '/tools/braille-converter?brailleMode=2');
await (await keyboardButton()).click();
await sleep(300);
check('Keyboard opens the panel', await panelOpen());
check(
	'focus starts on dot 1',
	await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Dot 1'),
);
const dot = (n) =>
	page.$eval(`.brl-keyboard-dot[aria-label="Dot ${n}"]`, (b) => b.click());
await dot(1);
await dot(2);
await dot(5);
await sleep(50);
check(
	'toggled dots build the cell',
	(await page.$eval('.brl-keyboard-glyph', (el) => el.textContent)) === '⠓',
);
await page.$$eval('.brl-keyboard button', (buttons) =>
	buttons.find((b) => b.textContent.trim() === 'Insert').click(),
);
await sleep(50);
check('Insert adds the cell', (await source()) === '⠓', await source());
check('and clears the dots', (await page.$$('.brl-keyboard-dot[aria-pressed="true"]')).length === 0);
await page.$$eval('.brl-keyboard button', (buttons) =>
	buttons.find((b) => b.textContent.trim() === 'Space').click(),
);
await sleep(50);
check('Space adds a space', (await source()) === '⠓ ', JSON.stringify(await source()));
await page.focus('.brl-keyboard-dot[aria-label="Dot 1"]');
// a Perkins chord: d f k held together give dots 1 2 5
await page.keyboard.down('f');
await page.keyboard.down('d');
await page.keyboard.down('k');
await page.keyboard.up('f');
await page.keyboard.up('d');
check('a chord waits for every key to lift', (await source()) === '⠓ ');
await page.keyboard.up('k');
await sleep(50);
check('then inserts its cell', (await source()) === '⠓ ⠓', await source());
await page.keyboard.press(' ');
await page.keyboard.press('Backspace');
await sleep(50);
check('Space and Backspace keys', (await source()) === '⠓ ⠓', JSON.stringify(await source()));
check(
	'the space key does not toggle the focused dot',
	(await page.$$('.brl-keyboard-dot[aria-pressed="true"]')).length === 0,
);
check('the result reads the cells', (await result(page)) === 'h h', await result(page));
// f held while the panel closes; its keyup lands outside the panel
await page.keyboard.down('f');
await page.keyboard.press('Escape');
await sleep(200);
check('Escape closes the panel', !(await panelOpen()));
await page.keyboard.up('f');
await (await keyboardButton()).click();
await sleep(200);
await page.focus('.brl-keyboard-dot[aria-label="Dot 1"]');
const beforeChord = await source();
await page.keyboard.press('j');
await sleep(50);
check('a key held through closing does not block the next chord', (await source()) === `${beforeChord}⠈`, JSON.stringify(await source()));
await page.keyboard.press('Escape');
await sleep(200);
await visit(page, '/tools/braille-converter');
check('Auto with nothing typed offers the keyboard', !!(await (await keyboardButton()).asElement()));

await checkNarrow(page, '/tools/braille-converter?brailleText=Hello%20World');
await sleep(50);

await finish(browser);
