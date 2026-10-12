import { launch, visit, check, sleep, finish } from './harness.mjs';

const { browser, page } = await launch();

const state = () =>
	page.evaluate(() => {
		const fields = [
			...document.querySelectorAll('.contrast-input input'),
		];
		const wells = [...document.querySelectorAll('.contrast-well')];
		return {
			ratio: document
				.querySelector('.contrast-scale meter')
				.getAttribute('aria-valuetext'),
			fg: fields[0].value,
			bg: fields[1].value,
			wells: wells.map((w) => w.getAttribute('aria-label')),
			editsBackground:
				wells[1].getAttribute('aria-pressed') === 'true',
			lit: document.querySelectorAll('.contrast-lamp--lit').length,
			suggestions: [
				...document.querySelectorAll('.contrast-suggestion'),
			].map((b) => !b.disabled),
			strip: document
				.querySelector('.canon-colour-strip-value')
				.textContent.trim(),
		};
	});

await visit(page, '/tools/contrast-checker');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document
				.querySelector('.contrast-checker')
				.getBoundingClientRect().height,
	),
);
let s = await state();
check(
	'starts at #EAEAEA on #1A1A2E',
	s.fg === '#EAEAEA' && s.bg === '#1A1A2E',
	`${s.fg} ${s.bg}`,
);
check('the ratio is 14.17:1', s.ratio === '14.17:1', s.ratio);
check('every lamp lit', s.lit === 5, `${s.lit}`);
check('no suggestion needed', s.suggestions.every((on) => !on));
check('the solid edits the foreground', !s.editsBackground && s.strip === '#EAEAEA');
check(
	'the solid is named',
	await page.$eval('.canon-colour-solid', (el) => !!el.getAttribute('aria-label')),
);

const field = await page.evaluate(() => {
	const first = document.querySelector('.canon-split-sidebar > *');
	const inputs = [...document.querySelectorAll('.contrast-input')];
	return {
		first: inputs.every((i) => first.contains(i)),
		heights: inputs.map((i) => Math.round(i.getBoundingClientRect().height)),
		sizes: inputs.map((i) => getComputedStyle(i.querySelector('input')).fontSize),
	};
});
check('both colour fields open the settings', field.first && field.heights.length === 2);
check(
	'and are large',
	field.heights.every((h) => h >= 68) && field.sizes.every((f) => f === '36px'),
	`${field.heights} ${field.sizes}`,
);

// a click selects the value, typing replaces it and answers at once
await page.click('.contrast-field:nth-child(2) .contrast-input input');
await sleep(150);
s = await state();
check('focusing Background makes the solid edit it', s.editsBackground);
await page.keyboard.type('#ffffff');
await sleep(120);
s = await state();
check('typing replaces the value', s.bg === '#ffffff', s.bg);
check('and is live', s.ratio === '1.2:1', s.ratio);
check('the strip follows the edited well', s.strip === '#FFFFFF', s.strip);
await page.keyboard.type('zz');
await sleep(600);
check(
	'an unreadable colour turns the field red',
	await page.$eval(
		'.contrast-field:nth-child(2) .contrast-input input',
		(el) => el.getAttribute('aria-invalid') === 'true',
	),
);
await page.click('.contrast-field:nth-child(1) .contrast-input input');
await sleep(150);
await page.keyboard.type('tomato');
await sleep(120);
s = await state();
check('focusing Foreground hands the solid back', !s.editsBackground);
check('reads CSS colour names', s.wells[0] === 'Foreground #FF6347', s.wells[0]);
check('the background kept white', s.wells[1] === 'Background #FFFFFF', s.wells[1]);

// tomato on white: 2.97:1, fails AA and AAA
check('suggestions offered', s.suggestions.filter(Boolean).length >= 2, `${s.suggestions}`);
await page.evaluate(() => document.activeElement?.blur());
await page.click('.contrast-suggestion:not([disabled])');
await sleep(700);
s = await state();
check(
	'a suggestion lifts the ratio to AA',
	parseFloat(s.ratio) >= 4.5,
	s.ratio,
);

await page.click('.contrast-flip');
await sleep(700);
const flipped = await state();
check(
	'Flip swaps the colours',
	flipped.wells[0].endsWith('#FFFFFF') &&
		flipped.wells[1].endsWith(s.wells[0].split(' ')[1]),
	flipped.wells.join(' | '),
);

await page.focus('.contrast-well:nth-of-type(2)');
await page.keyboard.press('Enter');
await sleep(300);
s = await state();
check('the wells take the keyboard', s.editsBackground);

const hue = await page.$('.canon-colour-controls-lit [role="slider"]');
const before = await hue.evaluate((el) => el.getAttribute('aria-valuenow'));
await hue.focus();
await page.keyboard.press('ArrowRight');
await sleep(100);
const after = await hue.evaluate((el) => el.getAttribute('aria-valuenow'));
check('the sliders take arrow keys', before !== after, `${before} ${after}`);

await visit(page, '/tools/contrast-checker?color=ff0000');
s = await state();
check('?color= carries the foreground in', s.fg === '#FF0000', s.fg);

await visit(
	page,
	'/tools/contrast-checker?contrastFg=white&contrastBg=rgb(0,0,0)&contrastWell=1',
);
s = await state();
check(
	'launch flags: colours and well',
	s.ratio === '21:1' && s.editsBackground,
	`${s.ratio} ${s.editsBackground}`,
);

await page.evaluate(() => localStorage.setItem('colour-notation', 'oklch'));
await visit(page, '/tools/contrast-checker');
s = await state();
check(
	'the header notation reaches the fields',
	s.fg.startsWith('oklch(') && s.bg.startsWith('oklch('),
	`${s.fg} ${s.bg}`,
);
await page.evaluate(() => localStorage.removeItem('colour-notation'));

// phone: stacked, the specimen collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/contrast-checker');
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.contrast-checker .canon-split-body');
	const canvas = () =>
		document
			.querySelector('.contrast-checker .canon-canvas')
			.getBoundingClientRect().height;
	const full = canvas();
	body.scrollTop = 800;
	await new Promise((r) => setTimeout(r, 200));
	return {
		full,
		band: canvas(),
		wide:
			document.documentElement.scrollWidth >
			document.documentElement.clientWidth,
	};
});
check(
	'the specimen collapses to 104 px',
	phone.full > 200 && Math.round(phone.band) === 104,
	`${phone.full} ${phone.band}`,
);
check('no horizontal scroll', !phone.wide);
await page.setViewport({ width: 1400, height: 1000 });

await finish(browser);
