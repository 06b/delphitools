// needs npm start first

import { launch, visit, check, sleep, finish } from './harness.mjs';

const { browser, page } = await launch();

const state = () =>
	page.evaluate(() => ({
		count: document
			.querySelector('.rx-picture .canon-figure-said')
			?.textContent.trim(),
		hits: document.querySelectorAll('.rx-hit').length,
		rails: [...document.querySelectorAll('.rx-picture-text span')].filter(
			(s) => s.style.background.includes('rx-group'),
		).length,
		lines: document.querySelectorAll('.rx-line').length,
		heading: [...document.querySelectorAll('.canon-heading')]
			.map((h) => h.textContent.trim())
			.find((t) => t.startsWith('Matches')),
		status: document.querySelector('.canon-status')?.textContent.trim(),
		flags: document.querySelector('.rx-pattern-flags')?.textContent,
	}));

await visit(page, '/tools/regex-tester?regexSample');
await sleep(300);
let seen = await state();
check('the sample finds three matches', seen.count === '3', seen.count);
check('every match is lit', seen.hits >= 3, `${seen.hits} lit pieces`);
check('groups draw rails', seen.rails >= 6, `${seen.rails} railed pieces`);
check(
	'three matches and six groups listed',
	seen.lines === 9 && seen.heading === 'Matches · 3',
	`${seen.lines} lines, ${seen.heading}`,
);

await page.$$eval('.rx-flags button', (els) => els[1].click());
await sleep(300);
seen = await state();
check('a flag cell toggles the flag', seen.flags === 'gi', seen.flags);

await page.$eval('.rx-pattern-field', (el) => {
	el.value = '(';
	el.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(800);
seen = await state();
check(
	'an invalid pattern says why',
	/Invalid regular expression/.test(seen.status ?? ''),
	seen.status,
);
check('an invalid pattern lists nothing', seen.lines === 0);

await visit(
	page,
	`/tools/regex-tester?regexPattern=${encodeURIComponent('(a+)+$')}&regexText=${'a'.repeat(40)}b`,
);
const started = Date.now();
await page.waitForFunction(
	() =>
		document.querySelector('.canon-status')?.textContent.trim() ===
		'Pattern timed out',
	{ timeout: 3000 },
);
check(
	'catastrophic backtracking times out',
	Date.now() - started < 3000,
	`${Date.now() - started} ms`,
);

await page.$$eval('.canon-grid button', (els) =>
	els.find((el) => el.textContent.trim() === 'Email')?.click(),
);
await page.$eval('.canon-text-area', (el) => {
	el.value = 'a@b.co x c@d.org';
	el.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(900);
seen = await state();
check(
	'the worker recovers after a timeout',
	seen.count === '2' && seen.status === undefined,
	`${seen.count} ${seen.status}`,
);

await finish(browser);
