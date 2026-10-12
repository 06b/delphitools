// needs npm start first

import { BASE, launch, visit, check, sleep, finish } from './harness.mjs';

// node strips .ts types
const { HTTP_STATUSES, filterStatuses, lookupStatus } = await import(
	'../../app/lib/http-status.ts'
);

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
await visit(page, '/tools/http-status');

const codes = () =>
	page.$$eval('.hs-row-code', (els) => els.map((el) => el.textContent.trim()));
const rowsFor = (search, cls) =>
	filterStatuses(search, cls).reduce((sum, g) => sum + g.items.length, 0);
const pickClass = async (label) => {
	await page.$$eval(
		'.http-status [role="radio"]',
		(els, text) => els.find((el) => el.textContent.trim() === text)?.click(),
		label,
	);
	await sleep(150);
};
const typeSearch = async (text) => {
	await page.$eval('.hs-search-field', (el) => {
		el.value = '';
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await page.type('.hs-search-field', text);
	await sleep(50);
};
const banner = () =>
	page.evaluate(() => ({
		code: document.querySelector('.hs-chart .canon-figure-said')?.textContent.trim(),
		phrase: document.querySelector('.hs-chart-phrase')?.textContent.trim(),
		meta: document.querySelector('.hs-chart-meta')?.textContent.replace(/\s+/g, ' ').trim(),
		href: document.querySelector('.hs-chart-ref')?.getAttribute('href'),
		lit: [...document.querySelectorAll('.hs-tile--lit')].map((el) => el.textContent),
		matches: document.querySelectorAll('.hs-tile--match').length,
	}));

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.http-status').getBoundingClientRect().height,
	),
);
check('one row per table entry', (await codes()).length === HTTP_STATUSES.length);
check(
	'one tile per code in the banner',
	(await page.$$eval('.hs-tile', (els) => els.length)) === HTTP_STATUSES.length,
);
let b = await banner();
check('200 is selected at the start', b.code === '200' && b.phrase === 'OK' && b.lit.join() === '200', JSON.stringify(b));
check(
	'the banner reads the reference and links the spec section',
	b.meta === 'RFC 9110 §15.3.1 · Cacheable' && b.href === lookupStatus(200).url,
	`${b.meta} ${b.href}`,
);
check('All plus the five classes', (await page.$$eval('.http-status [role="radio"]', (els) => els.length)) === 6);
check(
	'one jump heading per class',
	(await page.$$eval('.canon-jump-heading', (els) => els.map((el) => el.dataset.canonJumpTitle))).join('|') ===
		'1xx · Informational|2xx · Successful|3xx · Redirection|4xx · Client Error|5xx · Server Error',
);

await pickClass('5xx');
check('5xx narrows the list', (await codes()).length === rowsFor('', 5) && (await codes()).every((c) => c.startsWith('5')));
check('and the banner dims the rest', (await banner()).matches === rowsFor('', 5));
await pickClass('All');

await typeSearch('418');
check('code search finds exactly the teapot, live', (await codes()).join() === '418');
check(
	'with its registry note',
	(await page.$eval('.hs-row-note', (el) => el.textContent.trim())) === 'Unused',
);
await typeSearch('unauthorized');
check('phrase search is case-insensitive', (await codes()).join() === '401');
await typeSearch('zzz');
check(
	'a miss shows the web wording',
	(await page.$eval('.http-status .canon-empty-row', (el) => el.textContent.trim())) === 'No matches: “zzz”',
);
await page.click('.hs-search .canon-button');
await sleep(100);
check('Clear restores the table', (await codes()).length === HTTP_STATUSES.length);

await page.$$eval('.hs-row-body', (els) =>
	els.find((el) => el.textContent.includes('305'))?.click(),
);
await sleep(300);
b = await banner();
check('a row selects its code', b.code === '305' && b.lit.join() === '305', b.code);
check('the banner reads the registry state', b.meta === 'RFC 9110 §15.4.6 · Deprecated', b.meta);
check(
	'the row is lit and pressed',
	await page.$eval('.hs-row-body--lit', (el) => el.getAttribute('aria-pressed') === 'true' && el.textContent.includes('305')),
);

await page.$$eval('.hs-row-copy', (els) =>
	els.find((el) => el.getAttribute('aria-label') === 'Copy 404')?.click(),
);
await sleep(300);
check('copy writes the code', (await page.evaluate(() => navigator.clipboard.readText())) === '404');
check('and the toast confirms', await page.$eval('.canon-toast', (t) => t.style.opacity === '1'));

await page.click('.canon-jump-heading-button');
await sleep(400);
check('a heading opens the jump grid', !!(await page.$('dialog[open]')));
await page.keyboard.press('Escape');
await sleep(300);

await visit(page, '/tools/http-status?httpSearch=gate&httpClass=5&httpSelect=504');
b = await banner();
check(
	'launch flags: search, class, selection',
	(await codes()).join() === '502,504' && b.code === '504',
	(await codes()).join(),
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/http-status');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
			document.querySelector('.hs-chart').scrollWidth <= document.querySelector('.hs-chart').clientWidth,
	),
);

await finish(browser);
