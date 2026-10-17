// the canon glyph-browser: chart, card, search, keys, copy, system face

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const state = () =>
	page.evaluate(() => ({
		glyph: document.querySelector('.gb-square-glyph')?.textContent,
		figure: document
			.querySelector('.gb-figure')
			?.getAttribute('aria-label'),
		facts: document.querySelector('.gb-facts')?.textContent.trim(),
		lines: [...document.querySelectorAll('.gb-values .canon-value-line')].map(
			(l) => l.textContent.replace(/\s+/g, ' ').trim(),
		),
		selected: document
			.querySelector('.gb-cell[aria-selected="true"]')
			?.getAttribute('aria-label'),
		focused: document.activeElement?.getAttribute('aria-label'),
		sections: [...document.querySelectorAll('.gb-section .canon-jump-heading')].map(
			(h) => h.dataset.canonJumpTitle,
		),
		cells: document.querySelectorAll('button.gb-cell').length,
	}));

await visit(page, '/tools/glyph-browser');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.glyph-browser').getBoundingClientRect()
				.height,
	),
);
let s = await state();
check('starts on g', s.glyph === 'g' && s.selected === 'U+0067', `${s.glyph} ${s.selected}`);
check('every category is a section', s.sections.length === 13, s.sections.join());
check('the card has the six forms', s.lines.length === 6 && s.lines.includes('HTML &#x67;') && s.lines.includes('UTF-8 67'), s.lines.join(' | '));
const faces = await page.evaluate(() => {
	const face = (el) => getComputedStyle(el).fontFamily;
	const mono = getComputedStyle(document.documentElement)
		.getPropertyValue('--canon-mono-font')
		.trim();
	return {
		cell: face(document.querySelector('button.gb-cell')),
		card: face(document.querySelector('.gb-square-glyph')),
		ui: face(document.querySelector('.canon-heading')),
		mono,
	};
});
check(
	'glyphs render in the system face, never the UI or mono face',
	faces.cell.startsWith('system-ui') && faces.card === faces.cell && faces.cell !== faces.ui && !faces.cell.includes('Iosevka'),
	faces.cell,
);

await page.evaluate(() =>
	document.querySelector('.gb-cell[aria-label="U+03A9"]').click(),
);
await sleep(50);
s = await state();
check('a click selects a glyph', s.glyph === 'Ω' && s.facts === 'Greek', `${s.glyph} ${s.facts}`);

await page.focus('.gb-cell[aria-label="U+03A9"]');
await page.keyboard.press('ArrowRight');
await sleep(80);
s = await state();
check('arrow right moves on one', s.selected === 'U+03AA' && s.focused === 'U+03AA', `${s.selected} ${s.focused}`);
const columns = await page.evaluate(() =>
	getComputedStyle(document.querySelector('.gb-chart')).getPropertyValue('--gb-columns').trim(),
);
await page.keyboard.press('ArrowDown');
await sleep(80);
s = await state();
check('arrow down moves a row', s.selected === `U+${(0x3aa + Number(columns)).toString(16).toUpperCase().padStart(4, '0')}`, `${s.selected} (${columns} columns)`);
check(
	'one tab stop in the chart',
	(await page.$$eval('button.gb-cell[tabindex="0"]', (b) => b.length)) === 1,
);

await page.evaluate(() =>
	document.querySelector('.gb-cell[aria-label="U+2192"]').dispatchEvent(
		new MouseEvent('dblclick', { bubbles: true }),
	),
);
await sleep(300);
let copied = await page.evaluate(() => navigator.clipboard.readText());
check('double-click copies the character', copied === '→', copied);

await page.evaluate(() =>
	[...document.querySelectorAll('.gb-values .canon-value-line')]
		.find((l) => l.textContent.includes('JS'))
		.click(),
);
await sleep(300);
copied = await page.evaluate(() => navigator.clipboard.readText());
check('a form line copies', copied.startsWith('\\u'), copied);

await page.click('.gb-search');
await page.keyboard.type('20ac');
await sleep(100);
s = await state();
check('search narrows the chart by hex', s.cells === 1 && s.sections.join() === 'Currency', `${s.cells} ${s.sections}`);
await page.evaluate(() => {
	const f = document.querySelector('.gb-search');
	f.select();
});
await page.keyboard.type('arrows');
await sleep(100);
s = await state();
check('a category name keeps it whole', s.sections.join() === 'Arrows' && s.cells > 100, `${s.cells} ${s.sections}`);
await page.evaluate(() => {
	const f = document.querySelector('.gb-search');
	f.select();
});
await page.keyboard.type('zzzz');
await sleep(100);
check('no match says so', !!(await page.$('.glyph-browser .canon-status')));

await visit(page, '/tools/glyph-browser?gbCode=1F600&gbSearch=1f60');
s = await state();
check('launch flags', s.glyph === '😀' && s.facts === 'Emoji' && s.sections.join() === 'Emoji', `${s.glyph} ${s.sections}`);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/glyph-browser');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <=
			document.documentElement.clientWidth,
	),
);

const tip = await page.evaluate(() => {
	const box = (el) => el.getBoundingClientRect();
	const hint = document.querySelector('.gb-tip');
	const rows = box(hint.previousElementSibling);
	const own = box(hint);
	return {
		inset: own.left === rows.left && own.right === rows.right,
		centred: getComputedStyle(hint).textAlign === 'center',
	};
});
check('the copy hint sits in the rows column, centred', tip.inset && tip.centred, JSON.stringify(tip));

await finish(browser);
