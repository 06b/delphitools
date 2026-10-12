// clipboard needs localhost override
// npm start, node scripts/verify/password-genny.mjs

import { launch, visit, check, finish, sleep, BASE } from './harness.mjs';
import {
	buildCharset,
	passphraseEntropy,
	passwordEntropy,
} from '../../app/lib/password.ts';

const DEFAULT_POOL = buildCharset({
	length: 16,
	lowercase: true,
	uppercase: true,
	digits: true,
	symbols: true,
	excludeAmbiguous: true,
});

const { browser, page } = await launch({
	ignore: [
		/password-genny: wordlist fetch failed/,
		// first fetch rig-failed
		/Failed to load resource: the server responded with a status of 500/,
	],
});
await browser
	.defaultBrowserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const rows = () =>
	page.$$eval(
		'.pw-row .canon-value-line-value:not(.canon-value-line-ghost)',
		(els) => els.map((e) => e.textContent.trim()),
	);
const strength = () =>
	page.$eval('.pw-strength', (el) => el.textContent.replace(/\s+/g, ' ').trim());
const toggle = (title) =>
	page.evaluate((t) => {
		const row = [...document.querySelectorAll('.password-genny .canon-row')].find(
			(r) => r.querySelector('.canon-row-title')?.textContent.trim() === t,
		);
		row.querySelector('[role="switch"]').click();
	}, title);
const switchState = (title) =>
	page.evaluate((t) => {
		const row = [...document.querySelectorAll('.password-genny .canon-row')].find(
			(r) => r.querySelector('.canon-row-title')?.textContent.trim() === t,
		);
		const sw = row.querySelector('[role="switch"]');
		return { on: sw.checked, disabled: sw.disabled };
	}, title);
const pick = (label, item) =>
	page.$$eval(
		`.password-genny [aria-label="${label}"] [role="radio"]`,
		(els, text) => els.find((el) => el.textContent.trim() === text).click(),
		item,
	);
const setNumber = async (title, value) => {
	const field = await page.evaluateHandle(
		(t) =>
			[...document.querySelectorAll('.password-genny .canon-row')]
				.find((r) => r.querySelector('.canon-row-title')?.textContent.trim() === t)
				.querySelector('.canon-stepper-field'),
		title,
	);
	await field.focus();
	await field.evaluate((el) => el.select());
	await field.type(String(value));
	await page.keyboard.press('Enter');
};
const button = (text) =>
	page.$$eval(
		'.password-genny .canon-button',
		(els, t) => els.find((b) => b.textContent.trim() === t).click(),
		text,
	);

await visit(page, '/tools/password-genny');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.password-genny').getBoundingClientRect().height,
	),
);
const firstRows = await rows();
check('a batch renders on load', firstRows.length === 10, `${firstRows.length} rows`);
check(
	'every row is the default length 16, from the default pool',
	firstRows.every((row) => row.length === 16 && [...row].every((c) => DEFAULT_POOL.includes(c))),
);
check('no lookalikes in the default batch', firstRows.every((row) => !/[Il1O0]/.test(row)));
check(
	'strength readout quantifies the default pool',
	(await strength()).replace(' ', '').startsWith(`${passwordEntropy(16, DEFAULT_POOL.length).toFixed(1)}bits`) &&
		(await strength()).endsWith('Very strong'),
	await strength(),
);
check(
	'the banner draws the first row, a character a cell',
	(await page.$$eval('.pw-char', (els) => els.map((e) => e.textContent).join(''))) === firstRows[0],
);
check(
	'the pool lights the characters the password uses',
	await page.$$eval('.pw-cell--used', (els) => els.map((e) => e.textContent)).then(
		(used) => used.length === new Set(firstRows[0]).size,
	),
);
check(
	'the ambiguous five are struck out',
	(await page.$$eval('.pw-cell--struck', (els) => els.map((e) => e.textContent).sort().join(''))) === '01IOl',
);

await setNumber('Length', 32);
await sleep(150);
check('length resizes every row', (await rows()).every((row) => row.length === 32));
await page.focus('.password-genny .canon-stepper-field');
await page.keyboard.press('ArrowUp');
await sleep(150);
check('the arrow keys step the length', (await rows()).every((row) => row.length === 33));
await setNumber('Length', 32);
await sleep(100);

await toggle('Lowercase');
await toggle('Uppercase');
await toggle('Symbols');
await sleep(150);
check('digits-only output excludes 0 and 1 while the toggle is on', (await rows()).every((row) => /^[2-9]+$/.test(row)));
const digits = await switchState('Digits');
check('the last active class cannot switch off', digits.on && digits.disabled);
check(
	'digits take the primary colour in the list',
	await page.$eval('.pw-row .canon-value-line-value', (el) =>
		[...el.querySelectorAll('span')].some((s) => s.style.color.includes('primary')),
	),
);

await toggle('Lowercase');
await toggle('Uppercase');
await toggle('Symbols');
await toggle('Exclude ambiguous');
await sleep(150);
check(
	'turning exclusion off re-adds the five lookalikes exactly',
	(await strength()).replace(' ', '').startsWith(`${passwordEntropy(32, 89).toFixed(1)}bits`),
	await strength(),
);

await pick('Count', '20');
await sleep(150);
check('count 20 renders 20 rows', (await rows()).length === 20);

await button('Copy all');
await sleep(200);
const allClip = await page.evaluate(() => navigator.clipboard.readText());
check('copy all lands the whole batch on the clipboard', allClip === (await rows()).join('\n'), `${allClip.split('\n').length} lines`);
check('and the toast confirms', await page.$eval('.canon-toast', (t) => t.style.opacity === '1'));

await page.click('.pw-row:nth-of-type(3)');
await sleep(400);
const third = (await rows())[2];
check('a row copies its value', (await page.evaluate(() => navigator.clipboard.readText())) === third);
await sleep(600);
check(
	'and the banner moves to it',
	(await page.$$eval('.pw-char', (els) => els.map((e) => e.textContent).join(''))) === third,
);

const before = await rows();
await button('Generate');
await sleep(60);
check('Generate replaces the batch', (await rows()).every((row, i) => row !== before[i]));

// lazy wordlist, fail first entry
await page.setRequestInterception(true);
let failWordlist = true;
page.on('request', (request) => {
	if (failWordlist && request.url().endsWith('/data/eff-large-wordlist.txt'))
		request.respond({ status: 500, body: 'rig-induced failure' });
	else request.continue();
});
await pick('Mode', 'Passphrase');
await page.waitForSelector('.pw-error', { timeout: 5000 });
check(
	'a failed fetch surfaces the web wording',
	(await page.$eval('.pw-error', (el) => el.textContent.trim())) ===
		'The word list failed to load, password mode still works.',
);
check(
	'Generate is disabled while the wordlist is missing',
	await page.$$eval('.password-genny .canon-button', (els) =>
		els.find((b) => b.textContent.trim() === 'Generate').disabled,
	),
);
failWordlist = false;
await button('Retry');
await page.waitForFunction(
	() =>
		[...document.querySelectorAll('.pw-row .canon-value-line-value:not(.canon-value-line-ghost)')].length > 0,
	{ timeout: 10000 },
);
const phrases = await rows();
check('Retry recovers and the batch renders', phrases.length === 20);
check(
	'passphrase mode builds 5 hyphenated words, first capitalised, trailing digit',
	phrases.every((row) => /^[A-Z][a-z]+(-[a-z]+){4}[0-9]$/.test(row)),
	phrases[0],
);
const list = await page.evaluate(async () => {
	const text = await fetch('/data/eff-large-wordlist.txt').then((r) => r.text());
	return Object.fromEntries(text.split('\n').map((line) => line.split(/\s+/).reverse()));
});
const words = phrases[0].replace(/\d$/, '').toLowerCase().split('-');
check('every word comes from the EFF list', words.every((w) => w in list));
await sleep(800);
const banner = await page.$$eval('.pw-word', (els) =>
	els.map((word) => ({
		word: word.querySelector('.pw-word-text').firstChild.textContent.trim().toLowerCase(),
		faces: [...word.querySelectorAll('.pw-die')].map((die) => die.querySelectorAll('.pw-pip').length).join(''),
	})),
);
check(
	'each word sits over the dice that pick it',
	banner.length === 5 && banner.every(({ word, faces }) => faces === list[word]),
	banner.map(({ word, faces }) => `${word} ${faces}/${list[word]}`).join(' '),
);
check(
	'passphrase strength counts words and the digit',
	(await strength()).replace(' ', '').startsWith(`${passphraseEntropy(5, 7776, true).toFixed(1)}bits`) &&
		(await strength()).endsWith('Strong'),
	await strength(),
);

await setNumber('Words', 8);
await sleep(150);
check('words drive the word count', (await rows()).every((row) => row.split('-').length === 8));
await pick('Separator', '.');
await sleep(150);
check('the separator applies', (await rows()).every((row) => row.split('.').length === 8));

await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await visit(page, '/tools/password-genny?pwLength=20&pwSymbols=0&pwSelect=2');
await button('Generate');
await sleep(40);
const shown = await page.$$eval('.pw-char', (els) => els.map((e) => e.textContent).join(''));
const after = await rows();
check('reduced motion: the banner settles at once', shown === after[2]);
check(
	'launch flags: length, symbols off, selection',
	after.every((row) => row.length === 20 && /^[A-Za-z2-9]+$/.test(row)),
);
await page.emulateMediaFeatures([]);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/password-genny?pwPhrase=1');
await sleep(500);
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
			document.querySelector('.pw-picture').scrollWidth <= document.querySelector('.pw-picture').clientWidth,
	),
);

await finish(browser);
