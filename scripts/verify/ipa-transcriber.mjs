// ipa-transcriber: the canon port, on the shavian gloss editor
// shares dictionary tiers with shavian; "vigilant" needs the fetched tier
//
// Usage: npm start, then node scripts/verify/ipa-transcriber.mjs

import { launch, visit, check, finish, sleep } from './harness.mjs';
import { checkActions, grantClipboard, result } from './text-tool.mjs';
import {
	choose,
	glosses,
	letterGlyphs,
	menuItems,
	openLetter,
	overlaps,
	pick,
	setText,
} from './gloss-tool.mjs';

const { browser, page } = await launch();
await grantClipboard(page);

const settle = () =>
	page
		.waitForFunction(
			() =>
				!document.querySelector('.ipa-loading') &&
				!!document.querySelector('.gl-gloss'),
			{ timeout: 30000 },
		)
		.then(() => true)
		.catch(() => false);

await visit(page, '/tools/ipa-transcriber');
check(
	'the split fills the sheet',
	await page.evaluate(() => {
		const sheet = document.querySelector('.dt-canon-tool');
		const split = document.querySelector('.ipa-transcriber');
		return (
			Math.abs(
				sheet.getBoundingClientRect().height -
					split.getBoundingClientRect().height,
			) < 1
		);
	}),
);
const ready = await settle();
await sleep(300);
check('the full dictionary loads', ready);
check('and no core-only warning shows', !(await page.$('.canon-status')));

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

const tiles = () =>
	page.$$eval('.canon-tiles-value', (els) =>
		els.map((e) => e.textContent.trim()).join(','),
	);

let text = await result(page);
check(
	'the transcription sits between slashes',
	text.startsWith('/') && text.endsWith('/'),
	text,
);
let words = await glosses(page);
check(
	'every word carries its IPA over it, none a guess',
	words.length === 6 && words.every((w) => w.gloss && !w.guess),
	words.map((w) => `${w.latin}:${w.gloss}`).join(' '),
);
const vigilant = words.find((w) => w.latin === 'vigilant');
check(
	'a word only the fetched tier knows is transcribed from it',
	!!vigilant?.gloss.includes('dʒ'),
	vigilant?.gloss,
);
check('tiles count words, dictionary, guessed', (await tiles()) === '6,6,0');
check(
	'stress marks are set apart, in the picture and the result',
	(await page.$$eval('.gl-gloss .ipa-stress', (els) => els.length)) > 0 &&
		(await page.$$eval('.tt-result-text .ipa-stress', (els) => els.length)) > 0,
);
const wide = await overlaps(page);
check(
	'1400 px: no glyph box overlaps one of another word',
	wide.glyphs > 40 && !wide.hits.length,
	`${wide.glyphs} glyphs; ${wide.hits.join(' ')}`,
);

// the Shavian flow: a word picked shows its symbols to fix
await pick(page, 'vigilant');
const picked = await page.evaluate(() => ({
	word: document.querySelector('.gl-word-row')?.textContent.replace(/\s+/g, ' ').trim(),
	lit: document.querySelector('.gl-word--lit [aria-hidden]')?.textContent,
}));
check('a word opens its word block', picked.word?.startsWith('vigilant /'), picked.word);
check('and is lit', picked.lit === 'vigilant');
const symbols = await letterGlyphs(page);
check(
	'one cell per symbol, stress marks included',
	symbols.join('') === vigilant?.gloss && symbols.includes('ˈ'),
	symbols.join(' '),
);
const at = symbols.indexOf('v');
await openLetter(page, at);
const menu = await menuItems(page);
check(
	'a symbol opens its menu: insert, remove, then the symbol and its alternatives',
	menu[0] === 'Insert before' &&
		menu[1] === 'Insert after' &&
		menu[2] === 'Remove' &&
		menu[3]?.endsWith('vow /v/') &&
		menu[4]?.endsWith('fee /f/'),
	menu.join(' | '),
);
await choose(page, 'fee');
check(
	'an alternative swaps the symbol',
	(await letterGlyphs(page))[at] === 'f',
	(await letterGlyphs(page)).join(' '),
);
check('and the result follows', (await result(page)).includes(' ˈfɪdʒ'), await result(page));

await openLetter(page, at);
await choose(page, 'Insert after');
await choose(page, 'ado /ə/', true);
check('Insert after adds a symbol', (await letterGlyphs(page)).slice(at, at + 2).join('') === 'fə');
await openLetter(page, at + 1);
await choose(page, 'Remove');
check('Remove takes it out', (await letterGlyphs(page))[at + 1] !== 'ə');

const stressAt = (await letterGlyphs(page)).indexOf('ˈ');
await openLetter(page, stressAt);
const stressMenu = await menuItems(page);
check(
	'a stress mark offers the other',
	stressMenu.some((i) => i.endsWith('Secondary stress /ˌ/')),
	stressMenu.slice(3).join(' | '),
);
await page.keyboard.press('Escape');
await sleep(100);

await page.focus('.media-marked-source');
await page.keyboard.press('End');
await page.type('.media-marked-source', ' Shaw');
await sleep(150);
words = await glosses(page);
check('typing is live and transcribes the new word', words.at(-1)?.latin === 'Shaw' && !!words.at(-1)?.gloss);
check(
	'the edited word keeps its edits',
	words.find((w) => w.latin === 'vigilant')?.gloss.startsWith('ˈf'),
	words.find((w) => w.latin === 'vigilant')?.gloss,
);
check('and the word block closes', !(await page.$('.gl-word-block')));

await setText(page, 'hello blorptastic');
words = await glosses(page);
const nonsense = words.find((w) => w.latin === 'blorptastic');
check('a nonsense word is flagged as a guess, live', !!nonsense?.guess && !!nonsense.gloss);
check('and the known word beside it is not', words.some((w) => w.latin === 'hello' && !w.guess));
check('the tiles count the guess', (await tiles()) === '2,1,1', await tiles());
check('the legend shows with words', !!(await page.$('.ipa-legend')));
await pick(page, 'blorptastic');
await openLetter(page, 0);
await choose(page, 'Remove');
words = await glosses(page);
check(
	'a fixed guess is no longer a guess',
	!words.find((w) => w.latin === 'blorptastic')?.guess && (await tiles()) === '2,2,0',
	await tiles(),
);

text = await result(page);
await checkActions(page, text, 'ipa.txt');

await setText(page, '');
check('an empty editor shows None', !!(await page.$('.tt-result .canon-empty-row')));
check(
	'and is the dashed place to type',
	await page.$eval('.media-marked-source', (el) => getComputedStyle(el).borderStyle === 'dashed'),
);
check('the tiles go to dashes', (await tiles()) === '—,—,—');

await page.evaluate(() => navigator.clipboard.writeText('the cat'));
await page.$$eval('.gl-picture-tools button', (els) =>
	els.find((b) => b.getAttribute('aria-label') === 'Paste')?.click(),
);
await sleep(150);
check('Paste fills the editor', (await page.$eval('.media-marked-source', (el) => el.value)) === 'the cat');
check('and it transcribes', (await result(page)) === '/ðə kæt/', await result(page));

await visit(page, '/tools/ipa-transcriber?ipaText=quick%20brown&ipaWord=2');
await settle();
await page.waitForSelector('.gl-word-block', { timeout: 5000 }).catch(() => {});
check('?ipaText= sets the text', (await result(page)).startsWith('/kwɪk '), await result(page));
check(
	'?ipaWord= picks a word',
	(await page.$eval('.gl-word-row', (el) => el.textContent).catch(() => '')).includes('brown'),
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/ipa-transcriber');
await settle();
await sleep(300);
const narrowOverlaps = await overlaps(page);
check(
	'390 px: no glyph box overlaps one of another word',
	narrowOverlaps.glyphs > 40 && !narrowOverlaps.hits.length,
	`${narrowOverlaps.glyphs} glyphs; ${narrowOverlaps.hits.join(' ')}`,
);
await visit(page, '/tools/ipa-transcriber?ipaText=' + encodeURIComponent('Mankind, be vigilant; we loved you. '.repeat(6)));
await settle();
await sleep(300);
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
