// the canon meta-tag-genny: form, live tags, preview board, copy
// usage: npm start, then node scripts/verify/meta-tag-genny.mjs

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const code = () => page.$eval('.mt-code pre', (el) => el.textContent);
const field = (title) =>
	page.evaluateHandle(
		(t) =>
			[...document.querySelectorAll('.meta-tag-genny .canon-row')]
				.find((row) => row.querySelector('.canon-row-title')?.textContent.trim() === t)
				.querySelector('input, textarea'),
		title,
	);
const type = async (title, text) => {
	const el = await field(title);
	await el.click();
	await el.type(text);
	await sleep(50);
};
const board = () =>
	page.evaluate(() => {
		const text = (sel) =>
			document.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() ?? null;
		return {
			caption: text('.mt-caption'),
			site: text('.mt-card-site'),
			title: text('.mt-card-title'),
			image: text('.mt-image-name'),
			large: !!document.querySelector('.mt-card--large'),
			bars: document.querySelectorAll('.mt-card .mt-bar').length,
			label: document.querySelector('.mt-board').getAttribute('aria-label'),
			beside: getComputedStyle(document.querySelector('.mt-beside')).display !== 'none',
			search: getComputedStyle(document.querySelector('.mt-search')).display !== 'none',
			result: text('.mt-beside .mt-result-title'),
			trail: text('.mt-beside .mt-result-trail'),
		};
	});

await visit(page, '/tools/meta-tag-genny');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.meta-tag-genny').getBoundingClientRect().height,
	),
);
let b = await board();
check('empty: grey bars in place of the text', b.bars === 5 && b.title === '', `${b.bars} bars`);
check('empty: the large card names the size to make', b.large && b.image === '1200 × 630', b.image);
check('wide: the search result sits beside the card', b.beside && !b.search);
let tags = await code();
check(
	'empty: the type and the card only',
	tags.includes('og:type" content="website"') && tags.includes('twitter:card" content="summary_large_image"') && !tags.includes('<title>'),
);

await type('Page Title', 'Hello & "world"');
tags = await code();
check('typing is live, and escaped', tags.includes('<title>Hello &amp; &quot;world&quot;</title>'), tags.split('\n')[0]);
b = await board();
check('the card shows the title', b.title === 'Hello & "world"' && b.result === 'Hello & "world"', b.title);
check(
	'the count reads characters of the limit',
	(await page.$eval('.meta-tag-genny .canon-row-detail', (el) => el.textContent.trim())) === '15 / 60',
);
await type('Page Title', ' and a title far longer than sixty characters in all');
check('over the limit the count turns red', !!(await page.$('.mt-over')));
b = await board();
check('the result cuts the title at a word', b.result.endsWith('…') && b.result.length <= 62, b.result);

await type('Canonical URL', 'https://www.example.com/notes/today');
await type('OG Image URL', 'https://example.com/i/press.jpg');
b = await board();
check('the caption names the host without www', b.caption === 'PREVIEW · example.com', b.caption);
check('the trail follows the path', b.trail === 'https://www.example.com › notes › today', b.trail);
check('the image frame names the file, never fetched', b.image === 'press.jpg' && !(await page.$('.mt-board img')));
check('the card site falls back to the host', b.site === 'EXAMPLE.COM', b.site);
tags = await code();
check(
	'canonical, og:url and twitter:url',
	['<link rel="canonical" href="https://www.example.com/notes/today">', 'og:url', 'twitter:url', 'og:image', 'twitter:image'].every((s) => tags.includes(s)),
);

const pick = (label, item) =>
	page.$$eval(
		`.meta-tag-genny [aria-label="${label}"] [role="radio"]`,
		(els, text) => els.find((el) => el.textContent.trim() === text)?.click(),
		item,
	);
await pick('OG Type', 'article');
await pick('Twitter Card', 'summary');
await sleep(100);
tags = await code();
b = await board();
check('OG Type and Twitter Card land in the tags', tags.includes('og:type" content="article"') && tags.includes('twitter:card" content="summary"'));
check('a summary card is the square thumbnail', !b.large);

await page.$$eval('.meta-tag-genny .canon-button', (els) =>
	els.find((el) => el.textContent.trim() === 'Copy').click(),
);
await sleep(300);
check('Copy copies the tags', (await page.evaluate(() => navigator.clipboard.readText())) === tags);
check('and the toast confirms', await page.$eval('.canon-toast', (t) => t.style.opacity === '1'));
check(
	'generated code is monospaced, no ligatures',
	await page.$eval('.mt-code pre', (el) => {
		const style = getComputedStyle(el);
		return /iosevka|mono/i.test(style.fontFamily) && style.fontVariantLigatures === 'none';
	}),
);

await visit(page, '/tools/meta-tag-genny?metaSample=1&metaCard=summary');
b = await board();
check('launch flags: the sample and the card', b.title === 'Field Notes: printing at home' && !b.large && b.site === 'FIELD NOTES');

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/meta-tag-genny?metaSample=1');
b = await board();
check('phone: the search result moves to the main pane', !b.beside && b.search);
check(
	'no horizontal scroll on a phone',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);

await finish(browser);
