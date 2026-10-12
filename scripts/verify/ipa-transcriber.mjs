// ipa-transcriber: the canon port
// shares dictionary tiers with shavian; "vigilant" needs the fetched tier
//
// Usage: npm start, then node scripts/verify/ipa-transcriber.mjs

import { launch, visit, check, finish, sleep } from './harness.mjs';
import {
	checkActions,
	checkLayout,
	checkNarrow,
	checkPaste,
	grantClipboard,
	result,
	setSource,
	typeSource,
} from './text-tool.mjs';

const { browser, page } = await launch();
await grantClipboard(page);

await visit(page, '/tools/ipa-transcriber');
await checkLayout(page, '.ipa-transcriber');

const ready = await page
	.waitForFunction(
		() =>
			!document.querySelector('.ipa-loading') &&
			!!document.querySelector('.ipa-word'),
		{ timeout: 30000 },
	)
	.then(() => true)
	.catch(() => false);
await sleep(300);
check('the full dictionary loads', ready);
check(
	'and no core-only warning shows',
	!(await page.$('.canon-status')),
);

const words = () =>
	page.$$eval('.ipa-word', (els) =>
		els.map((w) => ({
			title: w.getAttribute('title'),
			ipa: w.textContent,
			guess: w.classList.contains('ipa-word--guess'),
		})),
	);
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
let out = await words();
const vigilant = out.find((w) => w.title === 'vigilant');
check(
	'a word only the fetched tier knows is transcribed from it',
	!!vigilant && vigilant.ipa.includes('dʒ'),
	vigilant?.ipa ?? 'word not found',
);
check(
	'no word of the default sentence is a guess',
	out.length === 6 && out.every((w) => !w.guess),
);
check('tiles count words, dictionary, guessed', (await tiles()) === '6,6,0');
check(
	'stress marks are set apart',
	(await page.$$eval('.tt-result-text .ipa-stress', (els) => els.length)) > 0,
);
// glyphs of the core tier's guesses linger, faded out
const gloss = await page.$$eval('.ipa-gloss-word', (els) =>
	els
		.filter(
			(e) =>
				getComputedStyle(e.closest('.canon-glyph-flow-glyph'))
					.opacity !== '0',
		)
		.map((e) => e.textContent)
		.join(' '),
);
check(
	'the banner glosses each word under its IPA',
	gloss === 'Mankind be vigilant we loved you',
	gloss,
);

await typeSource(page, 'hello blorptastic');
out = await words();
const nonsense = out.find((w) => w.title === 'blorptastic');
check(
	'a nonsense word is flagged as a guess, live',
	!!nonsense && nonsense.guess && nonsense.ipa.length > 0,
	nonsense?.ipa ?? 'word not found',
);
check(
	'and the known word beside it is not',
	out.some((w) => w.title === 'hello' && !w.guess),
);
check('the tiles count the guess', (await tiles()) === '2,1,1', await tiles());
check(
	'the legend shows with words',
	!!(await page.$('.ipa-legend')),
);

text = await result(page);
await checkActions(page, text, 'ipa.txt');

await setSource(page, '');
check('an empty source shows None', !!(await page.$('.tt-result .canon-empty-row')));
check('and the empty slashes in the banner', !!(await page.$('.ipa-gloss-empty')));
check('the tiles go to dashes', (await tiles()) === '—,—,—');

await checkPaste(page, 'the cat');
check('the pasted text transcribes', (await result(page)) === '/ðə kæt/', await result(page));

await visit(page, '/tools/ipa-transcriber?ipaText=quick');
await page.waitForSelector('.ipa-word');
check('?ipaText= sets the source', (await result(page)) === '/kwɪk/', await result(page));

await checkNarrow(page, '/tools/ipa-transcriber');

await finish(browser);
