// the canon timecode-calc: cash-register fields, live sum, rate, copy

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

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
		const [a, b] = document.querySelectorAll('.tcc-field');
		const timer = (label) =>
			document
				.querySelector(`.tcc-picture [aria-label="${label}"] .canon-timecode-spoken`)
				?.textContent.trim() ?? '';
		return {
			a: a.value,
			b: b.value,
			placeholder: a.placeholder,
			// the segment face reads the drop semicolon as a stop
			result: timer('Result').replace('.', ';'),
			tiles: [
				...document.querySelectorAll('.timecode-calc .canon-tiles-value'),
			].map((t) => t.textContent.trim()),
			notes: [
				...document.querySelectorAll('.timecode-calc .canon-status'),
			].map((n) => n.textContent.trim()),
			copyOff: [...document.querySelectorAll('.timecode-calc button')].find(
				(x) => x.textContent.trim() === 'Copy',
			)?.disabled,
		};
	});

const fieldA = '.tcc-field[aria-label="Timecode A"]';
const fieldB = '.tcc-field[aria-label="Timecode B"]';
const enter = async (selector, digits) => {
	await page.evaluate(() => document.activeElement?.blur());
	await page.click(selector);
	await sleep(80);
	await page.keyboard.type(digits);
	await sleep(30);
};

await visit(page, '/tools/timecode-calc');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.timecode-calc').getBoundingClientRect()
				.height,
	),
);
let s = await state();
check('29.97 DF first: the drop placeholder', s.placeholder === '00:00:00;00', s.placeholder);
check('empty: dashes and Copy off', s.tiles.join('|') === '—|—' && s.copyOff === true, s.tiles.join('|'));

const layout = await page.evaluate(() => {
	const a = document.querySelector('.tcc-field[aria-label="Timecode A"]');
	const first = document.querySelector('.canon-split-sidebar .canon-rows');
	const cs = getComputedStyle(a);
	return {
		first: first?.contains(a),
		before: [...first.querySelectorAll('input, select, button')][0] === a,
		size: parseFloat(cs.fontSize),
		height: a.getBoundingClientRect().height,
	};
});
check('Timecode A opens the settings pane', layout.first && layout.before);
check('and is large', layout.size >= 28 && layout.height >= 60, `${layout.size}px, ${layout.height}px`);

// cash register, live
await page.click(fieldA);
await sleep(50);
await page.keyboard.type('1');
await sleep(20);
s = await state();
check('a digit comes in from the right', s.a === '00:00:00;01', s.a);
check('and the sum answers at once', s.tiles[0] === '1', s.tiles.join('|'));
await page.keyboard.type('000000');
await sleep(20);
s = await state();
check('seven digits make an hour', s.a === '01:00:00;00', s.a);
await page.keyboard.press('Backspace');
await sleep(20);
s = await state();
check('Backspace takes the last digit', s.a === '00:10:00;00', s.a);
await page.keyboard.type('0');

await enter(fieldB, '100002');
s = await state();
check('A + B', s.result === '01:10:00;02' && s.tiles[0] === '125,876', `${s.result} ${s.tiles[0]}`);
check('real time', s.tiles[1] === '01:10:00.063', s.tiles[1]);

await page.evaluate(() => document.activeElement?.blur());
await page.click(fieldB);
await sleep(80);
check(
	'focus selects the whole timecode',
	await page.evaluate(() => {
		const f = document.querySelector('.tcc-field[aria-label="Timecode B"]');
		return f.selectionStart === 0 && f.selectionEnd === f.value.length;
	}),
);
await page.keyboard.type('5');
await sleep(20);
s = await state();
check('typing replaces it', s.b === '00:00:00;05', s.b);

await page.evaluate(() =>
	[...document.querySelectorAll('.timecode-calc [aria-label="Operation"] *')]
		.find((x) => x.textContent.trim() === '−')
		.click(),
);
await sleep(30);
s = await state();
check('A − B', s.result === '00:59:59;25', s.result);

await enter(fieldB, '100');
await page.evaluate(() => document.activeElement?.blur());
await enter(fieldA, '10000');
s = await state();
check('a dropped frame number snaps, with the iOS note', s.notes.some((n) => n.startsWith('Dropped frame · 00:01:00;00 → 00:01:00;02')), s.notes.join('|'));

await page.select('.timecode-calc .canon-menu-cell-select', '2');
await sleep(30);
s = await state();
check('a rate pick re-separates the fields', s.a === '00:01:00:00' && s.placeholder === '00:00:00:00', `${s.a} ${s.placeholder}`);
await enter(fieldA, '99');
s = await state();
check('a frame past the rate warns', s.notes.some((n) => n.startsWith('Frame too high · 00–24')), s.notes.join('|'));

await enter(fieldA, '1000000');
await page.evaluate(() =>
	[...document.querySelectorAll('.timecode-calc button')]
		.find((x) => x.textContent.trim() === 'Copy')
		.click(),
);
await sleep(300);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('Copy copies the result', copied === '00:59:59:00', copied);
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (t) => t.style.opacity === '1'),
);

await visit(page, '/tools/timecode-calc?tcA=01:00:00;00&tcB=00:10:00;02&tcSubtract&tcRate=29.97df');
s = await state();
check('launch flags', s.a === '01:00:00;00' && s.b === '00:10:00;02' && s.result === '00:49:59;28', `${s.a} ${s.b} ${s.result}`);
check(
	'the picture lines are named timers',
	await page.$$eval('.tcc-picture [role="timer"]', (els) => els.length === 3 && els.every((e) => e.getAttribute('aria-label'))),
);
check(
	'the segment font loads',
	await page.evaluate(async () => {
		await document.fonts.ready;
		return document.fonts.check('30px FluoWrite');
	}),
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/timecode-calc');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <=
			document.documentElement.clientWidth,
	),
);

await finish(browser);
