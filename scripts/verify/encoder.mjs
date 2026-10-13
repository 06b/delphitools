// the canon encoder: one input in the main pane, Base64 / URL / Hash with a
// picture each, live output, swap, errors, copy, launch flags, phone layout

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const area = '.tt-source';

const state = () =>
	page.evaluate(() => {
		const q = (s) => document.querySelector(s);
		return {
			input: q('.tt-source').value,
			heading: q('.tt-result .canon-heading')?.textContent.trim(),
			output: q('.tt-result .tt-result-text')?.textContent ?? '',
			status: q('.tt-result .canon-status')?.textContent.trim(),
			strip: document.querySelectorAll('.enc-regroup .enc-strip').length,
			stripLabels: [
				...document.querySelectorAll(
					'.enc-regroup .canon-glyph-flow-glyphs .enc-label',
				),
			].map((t) => t.textContent),
			pairs: [...document.querySelectorAll('.enc-pair')].map(
				(p) =>
					`${p.querySelector('.enc-pair-top').textContent}>${p.querySelector('.enc-pair-bottom').textContent}`,
			),
			caption: q('.enc-digest-caption')?.textContent.trim(),
			digits: [...document.querySelectorAll('.enc-digit')]
				.map((d) => d.textContent)
				.join(''),
			figure: q('.enc-digest .canon-figure-said')?.textContent.trim(),
			hashes: Object.fromEntries(
				[...document.querySelectorAll('.enc-hash')].map((l) => [
					l.querySelector('.canon-value-line-label').textContent.trim(),
					l.querySelector('.canon-value-line-value').textContent.trim(),
				]),
			),
			lit: q('.enc-hash[aria-current="true"] .canon-value-line-label')
				?.textContent.trim(),
			swapOff: [...document.querySelectorAll('.encoder button')].find(
				(b) => b.textContent.trim() === 'Swap',
			)?.disabled,
		};
	});

const pick = (group, title) =>
	page.evaluate(
		(g, t) =>
			[...document.querySelectorAll(`[aria-label="${g}"] [role="radio"]`)]
				.find((b) => b.textContent.trim() === t)
				.click(),
		group,
		title,
	);

const retype = async (text) => {
	await page.evaluate(() => {
		const a = document.querySelector('.tt-source');
		a.focus();
		a.select();
	});
	await page.keyboard.press('Backspace');
	if (text) await page.keyboard.type(text);
	await sleep(120);
};

await visit(page, '/tools/encoder');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.encoder').getBoundingClientRect().height,
	),
);
check(
	'the input is in the main pane, beside the output',
	await page.evaluate(
		() =>
			!!document.querySelector('.canon-split-main .tt-source') &&
			!!document.querySelector('.canon-split-main .tt-result'),
	),
);
let s = await state();
check('starts in Base64 with the empty strip', s.strip === 1 && s.heading === 'Base64', `${s.strip} ${s.heading}`);
check('Swap is off with no output', s.swapOff === true);

await page.click(area);
await page.keyboard.type('Ma');
await sleep(80);
s = await state();
check('every keystroke encodes', s.output === 'TWE=', s.output);
check(
	'the strip regroups bytes into characters',
	['M', 'a', 'T', 'W', 'E', '='].every((l) => s.stripLabels.includes(l)),
	s.stripLabels.join(' '),
);

// a real click: the focused field keeps what is typed in it
await (
	await page.evaluateHandle(() =>
		[...document.querySelectorAll('.encoder button')].find(
			(b) => b.textContent.trim() === 'Swap',
		),
	)
).click();
await sleep(100);
s = await state();
check('Swap moves the output in and turns round', s.input === 'TWE=' && s.heading === 'Text' && s.output === 'Ma', `${s.input} ${s.heading} ${s.output}`);
check(
	'the direction follows',
	await page.evaluate(
		() =>
			document.querySelector('[aria-label="Direction"] [aria-checked="true"]').textContent.trim() ===
			'Decode',
	),
);

await retype('T');
s = await state();
check('bad Base64 says so', s.status === 'Invalid Base64.' && s.output === '', s.status);
check('and the empty row stays away', !(await page.$('.tt-result .canon-empty-row')));
await retype('_-8');
s = await state();
check('the URL-safe alphabet decodes', s.status === undefined, s.status);

await pick('Mode', 'URL');
await pick('Direction', 'Encode');
await retype('a b€');
s = await state();
check('URL encodes live', s.output === 'a%20b%E2%82%AC' && s.heading === 'URL', s.output);
check('the pairs show each symbol over its escape', s.pairs.join(' ') === 'a>a ␣>%20 b>b €>%E2%82%AC', s.pairs.join(' '));
await pick('Direction', 'Decode');
await retype('100%');
s = await state();
check('a broken escape says so', s.status === 'Invalid escape', s.status);
await retype('x%E2%82%ACy');
s = await state();
check('runs of escapes read as their character', s.pairs.includes('%E2%82%AC>€') && s.output === 'x€y', s.pairs.join(' '));

await page.evaluate(() =>
	[...document.querySelectorAll('.encoder button')]
		.find((b) => b.textContent.trim() === 'Copy')
		.click(),
);
await sleep(300);
let copied = await page.evaluate(() => navigator.clipboard.readText());
check('Copy copies the output', copied === 'x€y', copied);
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (t) => t.style.opacity === '1'),
);

await pick('Mode', 'Hash');
await retype('abc');
await sleep(150);
s = await state();
check('the input carries across modes', s.input === 'abc');
check(
	'every digest',
	s.hashes['SHA-256'] === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' &&
		s.hashes['SHA-1'] === 'a9993e364706816aba3e25717850c26c9cd0d89d' &&
		s.hashes['SHA-512']?.length === 128,
	JSON.stringify(s.hashes),
);
check('the grid shows the chosen digest', s.caption === 'SHA-256 · 256 bits' && s.digits === s.hashes['SHA-256'], s.caption);
check('and its line is lit', s.lit === 'SHA-256', s.lit);
await page.click(area);
await page.keyboard.type('d');
await sleep(200);
s = await state();
check('an edit counts the flipped bits', /^\d+bits changed$/.test(s.figure ?? ''), s.figure);
await pick('Hash', 'SHA-512');
await sleep(150);
s = await state();
check('another algorithm, a longer grid', s.caption === 'SHA-512 · 512 bits' && s.digits.length === 128 && s.lit === 'SHA-512', s.caption);
await page.evaluate(() =>
	[...document.querySelectorAll('.enc-hash')]
		.find((l) => l.textContent.includes('SHA-1'))
		.click(),
);
await sleep(300);
copied = await page.evaluate(() => navigator.clipboard.readText());
check('a hash line copies its digest', copied === '81fe8bfe87576c3ecb22426f8e57847382917acf' && copied === s.hashes['SHA-1'], copied);
await retype('');
s = await state();
check('no input, no digests', s.digits === '' && s.hashes['SHA-1'] === '—', s.hashes['SHA-1']);

await visit(page, '/tools/encoder?encText=hi%20there&encScheme=1&encDecode=0');
s = await state();
check('launch flags', s.output === 'hi%20there' && s.input === 'hi there', s.output);
await visit(page, '/tools/encoder?encText=abc&encScheme=2&encAlgo=0');
await sleep(200);
s = await state();
check('launch flags pick the algorithm', s.caption === 'SHA-1 · 160 bits', s.caption);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/encoder?encText=Many%20hands%20make%20light%20work.');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
	),
);
const band = () =>
	page.$eval('.canon-split-banner .canon-canvas', (c) => c.getBoundingClientRect().height);
const full = await band();
await page.evaluate(() => {
	document.querySelector('.canon-split-body').scrollTop = 400;
});
await sleep(200);
const collapsed = await band();
check('the picture collapses as the page scrolls', collapsed < full && collapsed >= 100, `${full} → ${collapsed}`);

await finish(browser);
