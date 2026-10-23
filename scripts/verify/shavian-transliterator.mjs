// shavian-transliterator: the canon port
// two-tier gloss: 7.5k core then 125k cmu fetched from public/data
// missing tier falls back to letter-by-letter heuristic silently
// 5.4mb asset was dropped in port, fetch resolves on 404 so no gate noticed
//
// Usage: npm start, then node scripts/verify/shavian-transliterator.mjs

import { launch, visit, check, finish, sleep, captureObjectUrl } from './harness.mjs';
import { grantClipboard, result } from './text-tool.mjs';
import {
	glosses as glossesOf,
	overlaps as overlapsOf,
	pick as pickOf,
	setText as setTextOf,
} from './gloss-tool.mjs';

const { browser, page } = await launch();
await grantClipboard(page);

await visit(page, '/tools/shavian-transliterator');

check(
	'the split fills the sheet',
	await page.evaluate(() => {
		const sheet = document.querySelector('.dt-canon-tool');
		const split = document.querySelector('.shavian-transliterator');
		return (
			Math.abs(
				sheet.getBoundingClientRect().height -
					split.getBoundingClientRect().height,
			) < 1
		);
	}),
);

const settled = await page
	.waitForFunction(() => !document.querySelector('.sh-loading'), {
		timeout: 30000,
	})
	.then(() => true)
	.catch(() => false);
await sleep(300);
check('the full dictionary loads', settled);
check('and no core-only warning shows', !(await page.$('.canon-status')));

const tiles = () =>
	page.$$eval('.canon-tiles-value', (els) =>
		els.map((e) => e.textContent.trim()).join(','),
	);
const glosses = () => glossesOf(page);
const setText = (text) => setTextOf(page, text);
const pick = (latin) => pickOf(page, latin);
const overlaps = () => overlapsOf(page);

const editor = await page.evaluate(() => {
	const area = document.querySelector('.media-marked-source');
	return {
		inPicture: !!area.closest('.canon-split-sidebar .canon-canvas'),
		mainHasTextarea: !!document.querySelector('.canon-split-main textarea'),
		font: parseFloat(getComputedStyle(area).fontSize),
	};
});
check(
	'the English is typed in the picture, not the main pane',
	editor.inPicture && !editor.mainHasTextarea,
);
check('in a large face', editor.font >= 20, `${editor.font} px`);
const box = (sel) =>
	page.$eval(sel, (el) => {
		const r = el.getBoundingClientRect();
		return [Math.round(r.x), Math.round(r.y), Math.round(r.width)];
	});
check(
	'the editor sits exactly on the spelling',
	JSON.stringify(await box('.media-marked-source')) ===
		JSON.stringify(await box('.media-marked-marks')),
);
check(
	'the Shavian face renders Shavian',
	await page.evaluate(async () => {
		await document.fonts.ready;
		const gloss = document.querySelector('.gl-gloss');
		return (
			getComputedStyle(gloss).fontFamily.includes('Noto Sans Shavian') &&
			document.fonts.check("20px 'Noto Sans Shavian'", '𐑐')
		);
	}),
);

const wideOverlaps = await overlaps();
check(
	'1400 px: no glyph box overlaps one of another word',
	wideOverlaps.glyphs > 40 && !wideOverlaps.hits.length,
	`${wideOverlaps.glyphs} glyphs; ${wideOverlaps.hits.join(' ')}`,
);

let words = await glosses();
check(
	'every word of the default sentence is glossed from the dictionary',
	words.length === 6 && words.every((w) => !w.guess && w.gloss),
	words.map((w) => `${w.latin}:${w.gloss}`).join(' '),
);
check('tiles count words, dictionary, guessed', (await tiles()).startsWith('6,6,0,'), await tiles());
check(
	'the output is the Shavian text',
	(await result(page)).startsWith('𐑥𐑨𐑯𐑒𐑲𐑯𐑛,'),
	await result(page),
);

// "vigilant" is outside 7.5k core; heuristic can't reach dʒ from g
await pick('vigilant');
const picked = await page.evaluate(() => ({
	block: !!document.querySelector('.gl-word-block'),
	word: document.querySelector('.gl-word-row')?.textContent.replace(/\s+/g, ' ').trim(),
	letters: document.querySelectorAll('.gl-letter').length,
}));
check('a Shavian word opens its word block', picked.block);
check(
	'a word only the fetched tier knows is glossed from it',
	/vigilant.*dʒ/.test(picked.word ?? ''),
	picked.word,
);
check('one cell per letter', picked.letters === 8, `${picked.letters}`);
words = await glosses();
check('the picked word is lit', words.find((w) => w.lit)?.latin === 'vigilant');

await page.$$eval('.gl-word-block .canon-segmented button', (els) => els[1].click());
await sleep(100);
check('Namer marks the word', (await result(page)).includes('·𐑝'), await result(page));

// the first letter's menu: an alternative, then insert and remove
const letters = () =>
	page.$$eval('.gl-letter-glyph', (els) => els.map((e) => e.textContent).join(''));
const before = await letters();
await page.click('.gl-letter');
await sleep(150);
const menu = await page.evaluate(() => {
	const panel = document.querySelector('.gl-letter-menu:popover-open');
	return [...(panel?.children ?? [])]
		.filter((e) => e.classList.contains('canon-menu-item'))
		.map((e) => e.textContent.replace(/\s+/g, ' ').trim());
});
check(
	'a letter opens its menu: insert, remove, then the letter and its alternatives',
	menu[0] === 'Insert before' &&
		menu[1] === 'Insert after' &&
		menu[2] === 'Remove' &&
		menu[3]?.endsWith('vow /v/') &&
		menu[4]?.endsWith('fee /f/'),
	menu.join(' | '),
);
await page.$$eval('.gl-letter-menu:popover-open > .canon-menu-item', (els) =>
	els.find((e) => e.textContent.includes('fee'))?.click(),
);
await sleep(150);
check('an alternative swaps the letter', (await letters()) === '𐑓' + before.slice(2), await letters());
check('and the output follows', (await result(page)).includes('·𐑓𐑦'), await result(page));

await page.click('.gl-letter');
await sleep(150);
await page.$$eval('.gl-letter-menu:popover-open > .canon-menu-item', (els) =>
	els.find((e) => e.textContent.trim() === 'Insert after')?.click(),
);
await sleep(150);
await page.$$eval('.gl-letter-menu .canon-menu:popover-open .canon-menu-item', (els) =>
	els.find((e) => e.textContent.includes('ado /ə/'))?.click(),
);
await sleep(150);
check('Insert after adds a letter', (await letters()).startsWith('𐑓𐑩𐑦'), await letters());
await page.$$eval('.gl-letter', (els) => els[1].click());
await sleep(150);
await page.$$eval('.gl-letter-menu:popover-open > .canon-menu-item', (els) =>
	els.find((e) => e.textContent.trim() === 'Remove')?.click(),
);
await sleep(150);
check('Remove takes it out', (await letters()).startsWith('𐑓𐑦'), await letters());

// typing keeps the edits of the words still in place, and closes the word
await page.focus('.media-marked-source');
await page.keyboard.press('End');
await page.type('.media-marked-source', ' Shaw');
await sleep(100);
words = await glosses();
check(
	'typing is live and glosses the new word',
	words.at(-1)?.latin === 'Shaw' && !!words.at(-1)?.gloss,
	words.at(-1)?.latin,
);
check('the edited word keeps its edits', (await result(page)).includes('·𐑓𐑦'), await result(page));
check('and the word block closes', !(await page.$('.gl-word-block')));

await setText('hello blorptastic');
words = await glosses();
check(
	'a nonsense word is flagged as a guess, live',
	words.find((w) => w.latin === 'blorptastic')?.guess === true &&
		words.find((w) => w.latin === 'hello')?.guess === false,
);
check('the tiles count the guess', (await tiles()).startsWith('2,1,1,'), await tiles());
check('the legend shows with words', !!(await page.$('.sh-legend')));

const text = await result(page);
await page.click('.tt-copy');
await sleep(150);
check(
	'Copy puts the Shavian on the clipboard',
	(await page.evaluate(() => navigator.clipboard.readText())) === text,
);
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (el) => el.style.opacity === '1'),
);
await captureObjectUrl(page);
await page.click('.tt-download');
await sleep(200);
check(
	'Download saves shavian.txt',
	(await page.evaluate(() => window.__result?.text())) === text,
);
await page.evaluate(() => {
	HTMLAnchorElement.prototype.click = function () {
		window.__saved = { href: this.href, name: this.download };
	};
});
await page.click('.sh-export');
await page.waitForFunction(() => window.__saved, { timeout: 5000 }).catch(() => {});
const saved = await page.evaluate(() => window.__saved);
check(
	'Export Gloss saves the gloss image',
	saved?.name === 'shavian-gloss.png' && saved.href.startsWith('data:image/png'),
	saved?.name,
);

await setText('');
check('an empty editor shows None', !!(await page.$('.tt-result .canon-empty-row')));
check(
	'and is the dashed place to type',
	await page.$eval('.media-marked-source', (el) => getComputedStyle(el).borderStyle === 'dashed'),
);
check('the tiles go to dashes', (await tiles()) === '—,—,—,—');

await page.evaluate(() => navigator.clipboard.writeText('the cat'));
await page.$$eval('.gl-picture-tools button', (els) =>
	els.find((b) => b.getAttribute('aria-label') === 'Paste')?.click(),
);
await sleep(150);
check('Paste fills the editor', (await page.$eval('.media-marked-source', (el) => el.value)) === 'the cat');
check('and it transliterates', (await result(page)) === '𐑞 𐑒𐑨𐑑', await result(page));

await visit(page, '/tools/shavian-transliterator?shavianText=Shaw%20wrote%20NATO&shavianWord=3&shavianMarker=3');
await page.waitForSelector('.gl-word-block');
check(
	'?shavianText= ?shavianWord= ?shavianMarker= set the text, word and marker',
	(await result(page)) === '𐑖𐑷 𐑮𐑴𐑑 ꤮𐑯𐑱𐑑𐑴',
	await result(page),
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/shavian-transliterator');
await page.waitForFunction(() => !document.querySelector('.sh-loading'), { timeout: 30000 });
await sleep(300);
const narrowOverlaps = await overlaps();
check(
	'390 px: no glyph box overlaps one of another word',
	narrowOverlaps.glyphs > 40 && !narrowOverlaps.hits.length,
	`${narrowOverlaps.glyphs} glyphs; ${narrowOverlaps.hits.join(' ')}`,
);
await visit(page, '/tools/shavian-transliterator?shavianText=' + encodeURIComponent('Mankind, be vigilant; we loved you. '.repeat(6)));
await sleep(500);
const wrapped = await overlaps();
check(
	'390 px, six lines: no glyph box overlaps one of another word',
	!wrapped.hits.length,
	wrapped.hits.join(' '),
);
const narrow = await page.evaluate(() => {
	const body = document.querySelector('.canon-split-body');
	const picture = document.querySelector('.canon-split-sidebar .canon-canvas');
	const before = picture.getBoundingClientRect().height;
	body.scrollTop = body.scrollHeight;
	return new Promise((resolve) =>
		requestAnimationFrame(() =>
			requestAnimationFrame(() =>
				resolve({
					wide: getComputedStyle(body).getPropertyValue('--canon-split-layout').trim(),
					overflow:
						document.documentElement.scrollWidth > window.innerWidth ||
						body.scrollWidth > body.clientWidth,
					before,
					after: picture.getBoundingClientRect().height,
				}),
			),
		),
	);
});
check('390 px: one column', narrow.wide === 'stacked', narrow.wide);
check('390 px: no horizontal scroll', !narrow.overflow);
check(
	'390 px: the picture collapses as the page scrolls',
	narrow.after < narrow.before,
	`${narrow.before} -> ${narrow.after}`,
);

await finish(browser);
