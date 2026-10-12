import { BASE, launch, visit, check, sleep, finish } from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const state = () =>
	page.evaluate(() => {
		const text = (sel) =>
			document.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() ?? '';
		const wheel = (sel) => {
			const el = document.querySelector(sel);
			return {
				now: el.getAttribute('aria-valuenow'),
				text: el.getAttribute('aria-valuetext'),
				max: el.getAttribute('aria-valuemax'),
			};
		};
		return {
			shelf: wheel('.pc-shelves'),
			palette: wheel('.pc-palettes'),
			cover: text('.pc-cover-title'),
			chips: [...document.querySelectorAll('.pc-chip[data-hex]')].map(
				(c) => c.dataset.hex,
			),
			heading: text('.palette-collection .canon-split-main .canon-rows:last-child .canon-heading'),
			cards: document.querySelectorAll('.canon-colour-card--row').length,
			count: text('.pc-count'),
			description: text('.pc-description'),
			empty: text('.pc-empty'),
			open: document.querySelector('.pc-open')?.getAttribute('href') ?? '',
			searching: !!document.querySelector('.pc-wheels--searching'),
		};
	});

await visit(page, '/tools/palette-collection');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.palette-collection').getBoundingClientRect()
				.height,
	),
);
let s = await state();
check('starts on Classic, first palette', s.shelf.text === 'Classic' && s.palette.now === '0', `${s.shelf.text} ${s.palette.text}`);
check('the deck and the details show it', s.cover === s.palette.text && s.heading === s.palette.text, `${s.cover} ${s.heading}`);
check('a chip and a card per colour', s.chips.length > 0 && s.cards === s.chips.length, `${s.chips.length} ${s.cards}`);
check('the web count and description', s.count === '284 palettes' && s.description.startsWith('Classic:'), `${s.count} | ${s.description}`);
check(
	'the open link carries the colours',
	s.open.includes('/tools/palette-genny') && decodeURIComponent(s.open).includes(s.chips[0].toLowerCase()),
	s.open,
);

await page.focus('.pc-palettes');
await page.keyboard.press('ArrowDown');
await sleep(700);
s = await state();
check('the palette wheel takes arrow keys', s.palette.now === '1' && s.cover === s.palette.text, `${s.palette.now} ${s.cover}`);

await page.focus('.pc-shelves');
await page.keyboard.press('ArrowDown');
await sleep(700);
s = await state();
check('the category wheel takes arrow keys', s.shelf.text === 'Nature' && s.description.startsWith('Nature:'), `${s.shelf.text} ${s.description}`);
check('and a new shelf starts at its first palette', s.palette.now === '0', s.palette.now);

await page.evaluate(() =>
	[...document.querySelectorAll('.palette-collection [role="radio"]')]
		.find((b) => b.textContent.trim() === '4 colours')
		.click(),
);
await sleep(300);
s = await state();
check('the size filter narrows the shelf', s.chips.length === 4 || s.empty !== '', `${s.chips.length} ${s.empty}`);
check('and counts results', /results?$/.test(s.count), s.count);
await page.evaluate(() =>
	[...document.querySelectorAll('.palette-collection [role="radio"]')]
		.find((b) => b.textContent.trim() === 'Any size')
		.click(),
);
await sleep(300);

const search = await page.$('.pc-search-field');
await search.type('mayfair');
await sleep(400);
s = await state();
check('search looks across every shelf', s.searching && s.palette.text === 'Mayfair' && s.count === '1 result', `${s.palette.text} ${s.count}`);
await search.evaluate((el) => el.select());
await search.type('zzzz');
await sleep(400);
s = await state();
check('no match says so', s.empty === 'No palettes found matching your filters.' && s.cards === 0, s.empty);
await search.evaluate((el) => el.select());
await page.keyboard.press('Backspace');
await sleep(400);
s = await state();
check('clearing the search returns to the shelf', !s.searching && s.shelf.text === 'Nature', s.shelf.text);

await page.evaluate(() => document.querySelector('.pc-chip[data-hex]').click());
await sleep(200);
const copied = await page.evaluate(() => navigator.clipboard.readText());
s = await state();
check('a chip copies its hex', copied === s.chips[0], copied);
check('and the toast shows', await page.$eval('.canon-toast', (t) => t.style.opacity === '1'));

await visit(page, '/tools/palette-collection?collectionPalette=tromso');
s = await state();
check('launch flags: a palette by id', s.palette.text === 'Tromsø' || s.cover.startsWith('Troms'), `${s.shelf.text} ${s.palette.text}`);
await visit(page, '/tools/palette-collection?collectionSearch=keycap');
s = await state();
check('launch flags: a search', s.searching && Number(s.palette.max) > 0, s.count);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/palette-collection');
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.palette-collection .canon-split-body');
	const canvas = () =>
		document.querySelector('.palette-collection .canon-canvas').getBoundingClientRect().height;
	const full = canvas();
	body.scrollTop = 800;
	await new Promise((r) => setTimeout(r, 200));
	return {
		full,
		band: canvas(),
		wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
	};
});
check('the deck collapses to 240 px', phone.full > 240 && Math.round(phone.band) === 240, `${phone.full} ${phone.band}`);
check('no horizontal scroll', !phone.wide);

await finish(browser);
