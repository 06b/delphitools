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
			heading: text('.palette-collection .canon-split-main .canon-rows:nth-last-child(1 of .canon-rows) .canon-heading'),
			cards: document.querySelectorAll('.canon-colour-card--row').length,
			description: text('.pc-description'),
			empty: text('.pc-empty'),
			open: document.querySelector('.pc-open')?.getAttribute('href') ?? '',
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
check('the category description', s.description.startsWith('Classic:'), s.description);
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

check(
	'the colour-count filter is gone',
	await page.evaluate(
		() =>
			![...document.querySelectorAll('.palette-collection [role="radio"]')].some((b) =>
				/size|colours/.test(b.textContent),
			),
	),
);

const radio = (label) =>
	page.evaluate(
		(l) =>
			[...document.querySelectorAll('.pc-view [role="radio"]')]
				.find((b) => b.textContent.trim() === l)
				.click(),
		label,
	);
await radio('Grid');
await sleep(300);
const grid = await page.evaluate(() => ({
	tiles: document.querySelectorAll('.pc-tile').length,
	current: document.querySelector('.pc-tile[aria-current="true"] .pc-tile-name')?.textContent,
	count: document.querySelector('.pc-shelves .pc-row-count')?.closest('.canon-detent-wheel') &&
		Number(
			[...document.querySelectorAll('.pc-shelves .pc-row')]
				.find((r) => r.querySelector('.pc-row-title').textContent === 'Nature')
				?.querySelector('.pc-row-count').textContent,
		),
	deck: !!document.querySelector('.pc-deck'),
}));
check('the grid shows every palette of the shelf', grid.tiles === grid.count && grid.tiles > 1 && !grid.deck, JSON.stringify(grid));
check('and marks the current one', grid.current === s.palette.text, grid.current);
await page.evaluate(() => document.querySelectorAll('.pc-tile')[3].click());
await sleep(700);
s = await state();
check('a tile returns to the fan on that palette', s.palette.now === '3' && s.cover === s.palette.text && s.chips.length > 0, `${s.palette.now} ${s.cover}`);

const fan = await page.evaluate(() => {
	const canvas = document.querySelector('.pc-deck').getBoundingClientRect();
	const boxes = [...document.querySelectorAll('.pc-chip-face')].map((c) => c.getBoundingClientRect());
	const left = Math.min(...boxes.map((b) => b.left));
	const right = Math.max(...boxes.map((b) => b.right));
	const top = Math.min(...boxes.map((b) => b.top));
	const bottom = Math.max(...boxes.map((b) => b.bottom));
	return {
		dx: Math.abs((left + right) / 2 - (canvas.left + canvas.width / 2)),
		dy: Math.abs((top + bottom) / 2 - (canvas.top + canvas.height / 2)),
	};
});
check('the fan sits at the centre of the canvas', fan.dx < 40 && fan.dy < 40, JSON.stringify(fan));

const labels = await page.evaluate(() => {
	const chip = document.querySelector('.pc-chip[data-hex]');
	const face = chip.querySelector('.pc-chip-face').getBoundingClientRect();
	const text = chip.querySelector('.pc-chip-text').getBoundingClientRect();
	return {
		size: parseFloat(getComputedStyle(chip.querySelector('.pc-chip-hex')).fontSize),
		name: chip.querySelector('.pc-chip-name')?.textContent ?? '',
		inside:
			text.left >= face.left - 1 && text.right <= face.right + 1 &&
			text.top >= face.top - 1 && text.bottom <= face.bottom + 1,
	};
});
check('chip labels: value and name, larger, on the chip', labels.size >= 14 && labels.name !== '' && labels.inside, JSON.stringify(labels));

const chipBox = await page.evaluate(() => {
	const r = document.querySelectorAll('.pc-chip[data-hex]')[1].querySelector('.pc-chip-text').getBoundingClientRect();
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
const slid = () =>
	page.evaluate(() => getComputedStyle(document.querySelectorAll('.pc-chip-face')[1]).translate);
await page.mouse.move(chipBox.x, chipBox.y);
await sleep(400);
check('a hovered chip slides out of the deck', (await slid()).includes('-12px'), await slid());
await page.mouse.move(5, 500);
await sleep(600);
check('and back on leave', ['none', '0px'].includes(await slid()), await slid());

const scrolled = () =>
	page.evaluate(() =>
		['.dt-main', '.palette-collection .canon-split-main', '.palette-collection .canon-split-body']
			.map((q) => document.querySelector(q)?.scrollTop ?? 0)
			.reduce((a, b) => a + b, 0),
	);
const spot = await page.evaluate(() => {
	const r = document.querySelector('.pc-deck').getBoundingClientRect();
	return { x: r.left + 12, y: r.bottom - 12 };
});
const before = await scrolled();
await page.mouse.move(spot.x, spot.y);
await page.mouse.wheel({ deltaY: 300 });
await sleep(400);
const after = await scrolled();
check('the wheel over the deck strip outside the fan scrolls the page', after > before, `${before} -> ${after}`);
await page.evaluate(() =>
	['.dt-main', '.palette-collection .canon-split-main', '.palette-collection .canon-split-body'].forEach((q) => {
		const e = document.querySelector(q);
		if (e) e.scrollTop = 0;
	}),
);
const drum = await page.evaluate(() => {
	const r = document.querySelector('.pc-palettes').getBoundingClientRect();
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
const wasAt = (await state()).palette.now;
await page.mouse.move(drum.x, drum.y);
await page.mouse.wheel({ deltaY: 120 });
await sleep(900);
check('the wheel over a drum still spins it', (await state()).palette.now !== wasAt && (await scrolled()) === 0, `${wasAt} -> ${(await state()).palette.now}`);

await page.evaluate(() => document.querySelector('.pc-chip[data-hex]').click());
await sleep(200);
const copied = await page.evaluate(() => navigator.clipboard.readText());
s = await state();
check('a chip copies its value', copied.toUpperCase() === s.chips[0], copied);
check('and the toast shows', await page.$eval('.canon-toast', (t) => t.style.opacity === '1'));

await visit(page, '/tools/palette-collection?collectionPalette=tromso');
s = await state();
check('launch flags: a palette by id', s.palette.text === 'Tromsø' || s.cover.startsWith('Troms'), `${s.shelf.text} ${s.palette.text}`);

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

// values follow the header notation: cards, chips and copy
await page.evaluate(() => localStorage.setItem('colour-notation', 'oklch'));
await visit(page, '/tools/palette-collection');
await sleep(700);
const shown = await page.evaluate(() => ({
	label: document.querySelector('.canon-colour-card .canon-value-line-label')?.textContent.trim(),
	value: document.querySelector('.canon-colour-card .canon-value-line-value')?.textContent.trim(),
	chip: document.querySelector('.pc-chip-hex')?.textContent.trim(),
}));
check('card values use the header notation', shown.label === 'OKLCH' && shown.value?.startsWith('oklch('), JSON.stringify(shown));
check('chips use the header notation', shown.chip?.startsWith('oklch('), shown.chip);
await page.evaluate(() => localStorage.removeItem('colour-notation'));

await finish(browser);
