// the canon typo-calc: live value, unit re-read, row convert, base, resolution, gauge

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();

const field = '.canon-big-number-field-input';
const state = () =>
	page.evaluate(() => {
		const value = (unit) =>
			document
				.querySelector(
					`.typo-row[aria-label*=" ${unit}"][aria-label$="${unit}"] .typo-row-value`,
				)
				?.textContent.trim();
		return {
			field: document.querySelector('.canon-big-number-field-input')
				.value,
			unit: document
				.querySelector('.canon-big-number-field-unit')
				.textContent.trim(),
			pt: value('pt'),
			px: value('px'),
			rem: value('rem'),
			inch: value('in'),
			current: document
				.querySelector('.typo-row[aria-current="true"] .typo-row-symbol')
				?.textContent.trim(),
			gauge: document
				.querySelector('.typo-gauge-svg')
				?.getAttribute('aria-label'),
		};
	});
const retype = async (text) => {
	await page.evaluate(() => document.activeElement?.blur());
	await page.click(field);
	await sleep(80);
	await page.keyboard.type(text);
	await sleep(30);
};
const clickText = (scope, text) =>
	page.evaluate(
		(scope, text) =>
			[...document.querySelectorAll(`${scope} button`)]
				.find((b) => b.textContent.trim() === text)
				.click(),
		scope,
		text,
	);

await visit(page, '/tools/typo-calc');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.typo-calc').getBoundingClientRect()
				.height,
	),
);
let s = await state();
check('starts at 16 px, 12 pt, 1 rem', s.field === '16' && s.pt === '12' && s.rem === '1', JSON.stringify(s));
check('the px row is current', s.current === 'px', s.current);

const layout = await page.evaluate(() => {
	const input = document.querySelector('.canon-big-number-field-input');
	const first = document.querySelector('.canon-split-sidebar .canon-rows > *');
	return {
		first: first?.contains(input),
		size: parseFloat(getComputedStyle(input).fontSize),
	};
});
check('the value field opens the settings pane', layout.first);
check('in the big-number size', layout.size >= 28, `${layout.size}px`);

await page.evaluate(() => document.activeElement?.blur());
await page.click(field);
await sleep(80);
check(
	'focus selects the whole value',
	await page.evaluate(() => {
		const f = document.querySelector('.canon-big-number-field-input');
		return f.selectionStart === 0 && f.selectionEnd === f.value.length;
	}),
);
await page.keyboard.type('9');
await sleep(20);
s = await state();
check('typing replaces it and is live', s.field === '9' && s.pt === '6.75', `${s.field} ${s.pt}`);
await page.keyboard.type('6');
await sleep(20);
s = await state();
check('every keystroke answers', s.inch === '1' && s.pt === '72', `${s.inch} ${s.pt}`);
await page.keyboard.press('ArrowUp');
await sleep(20);
s = await state();
check('the arrow keys step a pixel', s.field === '97', s.field);

await retype('12');
await clickText('.typo-calc [aria-label="Unit"]', 'pt');
await sleep(50);
s = await state();
check('a unit cell reads the typed number in that unit', s.field === '12' && s.unit === 'PT' && s.px === '16' && s.current === 'pt', `${s.field} ${s.unit} ${s.px}`);

await page.evaluate(() =>
	document.querySelector('.typo-row[aria-label^="Inches"]').click(),
);
await sleep(50);
s = await state();
check('a row converts the value into its unit', s.field === '0.166667' && s.unit === 'IN' && s.pt === '12', `${s.field} ${s.unit} ${s.pt}`);
await page.keyboard.press('Tab');
await page.evaluate(() => document.activeElement?.blur());
await page.focus(field);
await page.keyboard.press('ArrowUp');
await sleep(20);
s = await state();
check('steps follow the unit', s.field === '0.25', s.field);

await retype('2');
await page.evaluate(() => {
	const base = [...document.querySelectorAll('.typo-calc .canon-row')]
		.find((r) => r.textContent.includes('Base Font Size'))
		.querySelector('input');
	base.focus();
	base.select();
});
await page.keyboard.type('10');
await page.keyboard.press('Enter');
await sleep(50);
s = await state();
check('the base drives em and rem', s.rem === '19.2', s.rem);

await clickText('.typo-calc .canon-grid', '300');
await sleep(50);
s = await state();
check('a resolution preset reconverts', s.px === '600' && s.pt === '144', `${s.px} ${s.pt}`);
check(
	'the px row names the resolution',
	await page.evaluate(() =>
		document
			.querySelector('.typo-row[aria-label^="Pixels"] .typo-row-detail')
			.textContent.includes('300 ppi'),
	),
);
await sleep(700);
s = await state();
check('the gauge is a named image with every reading', s.gauge?.includes('600 px') && s.gauge.includes('2 in'), s.gauge);

// motion: short, no overshoot, no box moves, none when reduced
await visit(page, '/tools/typo-calc');
const cursorX = () =>
	page.$eval('.typo-gauge-cursor', (c) => Number(c.getAttribute('x')));
const before = await cursorX();
await page.evaluate(() => {
	window.__xs = [];
	const sample = () => {
		const c = document.querySelector('.typo-gauge-cursor');
		if (c) window.__xs.push(Number(c.getAttribute('x')));
		if (window.__xs.length < 40) requestAnimationFrame(sample);
	};
	requestAnimationFrame(sample);
});
await retype('7');
await sleep(250);
const settled = await cursorX();
await sleep(400);
const xs = await page.evaluate(() => window.__xs);
check('the gauge settles within 250 ms', settled === (await cursorX()), `${settled}`);
check(
	'the gauge cursor never passes its target',
	xs.every((x) => (settled >= before ? x <= settled + 0.01 : x >= settled - 0.01)),
	`${before} -> ${settled}, max ${Math.max(...xs)}`,
);
const rowBox = () =>
	page.$eval('.typo-row[aria-label^="Points"]', (r) => {
		const b = r.getBoundingClientRect();
		return `${b.x},${b.y},${b.width},${b.height}`;
	});
const restBox = await rowBox();
const row = await page.$('.typo-row[aria-label^="Points"]');
const centre = await row.boundingBox();
await page.mouse.move(centre.x + centre.width - 10, centre.y + 10);
await page.mouse.down();
await sleep(60);
const pressedBox = await rowBox();
await page.mouse.up();
await sleep(100);
check(
	'a pressed row keeps its box',
	pressedBox === restBox && (await rowBox()) === restBox,
	`${restBox} / ${pressedBox}`,
);
check(
	'rows have no transform',
	await page.$$eval('.typo-row', (rows) =>
		rows.every((r) => getComputedStyle(r).transform === 'none'),
	),
);
await page.emulateMediaFeatures([
	{ name: 'prefers-reduced-motion', value: 'reduce' },
]);
await visit(page, '/tools/typo-calc');
const still = await cursorX();
await retype('3');
await sleep(40);
const jumped = await cursorX();
await sleep(300);
check(
	'reduced motion: the gauge jumps',
	jumped !== still && jumped === (await cursorX()),
	`${still} -> ${jumped}`,
);
await page.emulateMediaFeatures([]);

await visit(page, '/tools/typo-calc?typoValue=3&typoUnit=mm&typoBase=20&typoPPI=72');
s = await state();
check('launch flags', s.field === '3' && s.unit === 'MM' && s.current === 'mm', `${s.field} ${s.unit}`);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/typo-calc');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <=
			document.documentElement.clientWidth,
	),
);

await finish(browser);
