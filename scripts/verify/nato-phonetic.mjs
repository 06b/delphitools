// nato-phonetic: the canon port
//
// Usage: npm start, then node scripts/verify/nato-phonetic.mjs

import { launch, visit, check, finish } from './harness.mjs';
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

const hoist = () =>
	page.evaluate(() => ({
		flags: document.querySelectorAll('.np-flag-box .np-flag').length,
		plain: [...document.querySelectorAll('.np-plain')].map(
			(p) => p.textContent,
		),
		words: [...document.querySelectorAll('.np-word')]
			.map((w) => w.textContent)
			.join(' '),
		tacklines: document.querySelectorAll('.np-halyard--tackline').length,
		name: document
			.querySelector('.np-hoist .canon-glyph-flow')
			.getAttribute('aria-label'),
	}));
const clickSegment = (label) =>
	page.$$eval(
		'.canon-segmented button',
		(buttons, text) =>
			buttons.find((x) => x.textContent.trim() === text)?.click(),
		label,
	);
const used = () =>
	page.$$eval('.np-tile--used', (tiles) =>
		tiles.map((t) => t.querySelector('.np-tile-letter').textContent).join(''),
	);

await visit(page, '/tools/nato-phonetic');
await checkLayout(page, '.nato-phonetic');
check('an empty hoist is a bare halyard', !!(await page.$('.np-halyard--empty')));
check(
	'the chart has 26 named tiles',
	(await page.$$eval('.np-tile', (els) =>
		els.filter((e) => e.getAttribute('aria-label')).length,
	)) === 26,
);

await typeSource(page, 'Hi 5');
check('text spells, live', (await result(page)) === 'Hotel India / Five', await result(page));
check(
	'the direction reads Text to Spelled',
	(await headings(page)).join(' > ') === 'Text > Spelled',
);
let h = await hoist();
check('two flags hoisted', h.flags === 2, `${h.flags}`);
check('a digit gets a plain box', h.plain.join() === '5', h.plain.join());
check('words under the flags', h.words === 'Hotel India Five', h.words);
check('a tackline between words', h.tacklines === 1);
check('the hoist is named by the spelling', h.name === 'Hotel India / Five', h.name);
check('used letters light their tiles', (await used()) === 'HI', await used());

// a fresh load: fading glyphs of the last text would count
await visit(page, '/tools/nato-phonetic?natoText=Alfa%20Bravo%20%2F%20Charlie');
check('Auto reads a spelling back', (await result(page)) === 'AB C', await result(page));
check(
	'and the headings swap to Spelled > Text',
	(await headings(page)).join(' > ') === 'Spelled > Text',
);
h = await hoist();
check('the hoist shows the letters read', h.flags === 3, `${h.flags}`);
check('reading lights no tiles', (await used()) === '');

await page.click('.np-tile[aria-label="Delta"]');
check(
	'a tile spells its letter: Spell takes over and the letter is added',
	(await page.$eval('.tt-source', (el) => el.value)) ===
		'Alfa Bravo / CharlieD' &&
		(await page.$eval('.canon-segmented[aria-label="Direction"] [aria-checked="true"]', (el) =>
			el.textContent.trim(),
		)) === 'Spell',
);

await clickSegment('DIN 5009');
await setSource(page, 'Köln');
check('DIN 5009 spells cities', (await result(page)) === 'Köln Umlaut Offenbach Leipzig Nürnberg', await result(page));
check(
	'and the chart follows the alphabet',
	(await page.$eval('.np-tile[aria-label="Aachen"] .np-tile-word', (el) =>
		el.textContent.trim(),
	)) === 'Aachen',
);
await clickSegment('NATO');

await clickSegment('Read');
await setSource(page, 'Echo Xray');
check('Read reads, hyphen or not', (await result(page)) === 'EX', await result(page));
await clickSegment('Auto');

await setSource(page, 'SOS');
await checkActions(page, 'Sierra Oscar Sierra', 'spelled.txt');
await checkPaste(page, 'Zulu Yankee');
check('the pasted spelling reads', (await result(page)) === 'ZY');

await page.focus('.np-tile[aria-label="Alfa"]');
await page.keyboard.press('Enter');
check(
	'a tile works from the keyboard',
	(await page.$eval('.tt-source', (el) => el.value)) === 'Zulu YankeeA',
);

await visit(page, '/tools/nato-phonetic?natoText=Delphi&natoAlphabet=1&natoMode=1');
check(
	'?natoAlphabet= and ?natoMode= set up the tool',
	(await result(page)) ===
		'Düsseldorf Essen Leipzig Potsdam Hamburg Ingelheim',
	await result(page),
);

await checkNarrow(page, '/tools/nato-phonetic?natoText=Delphi%20tools');

await finish(browser);
