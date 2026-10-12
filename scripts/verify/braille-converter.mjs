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

await checkNarrow(page, '/tools/braille-converter?brailleText=Hello%20World');
await sleep(50);

await finish(browser);
