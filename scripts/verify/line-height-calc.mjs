import { BASE, launch, visit, check, sleep, finish } from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);
await visit(page, '/tools/line-height-calc');

const state = () =>
	page.evaluate(() => {
		const values = [
			...document.querySelectorAll('.canon-value-line-value'),
		].map((v) => v.textContent.trim());
		const preset = document.querySelector(
			'.canon-segmented [aria-checked="true"]',
		);
		const picture = document.querySelector('.line-height-calc-picture');
		return {
			field: document.querySelector('.canon-big-number-field-input')
				.value,
			ratio: document.querySelector('.canon-decimal-field-input').value,
			preset: preset?.textContent.trim(),
			values,
			current: document
				.querySelector('.line-height-calc-row[aria-current="true"]')
				?.getAttribute('aria-label'),
			box: picture?.style.getPropertyValue('--line-height-calc-box'),
			others: document.querySelectorAll('.line-height-calc-other')
				.length,
			sheet: document
				.querySelector('.dt-canon-tool')
				.getBoundingClientRect().height,
			split: document
				.querySelector('.line-height-calc')
				.getBoundingClientRect().height,
		};
	});

let s = await state();
check('the split fills the sheet', s.split === s.sheet, `${s.split}`);
check('starts at 16 px, Normal', s.field === '16' && s.preset === 'Normal');
check(
	'results',
	s.values.join('|') === '24px|8px|line-height: 1.5;|.lineSpacing(8)',
	s.values.join('|'),
);
check('the 16 px row is current', s.current === '16px, 24px, 8px');
check('only the selected value, no comparison columns', s.others === 0, `${s.others}`);

await page.click('.canon-big-number-field .canon-stepper-plus');
await sleep(100);
s = await state();
check('+ steps a pixel', s.field === '17' && s.values[0] === '25.5px');

const field = await page.$('.canon-big-number-field-input');
await field.evaluate((el) => el.select());
await field.type('20');
await sleep(600);
s = await state();
check('typing settles after a pause', s.values[0] === '30px', s.values[0]);

await page.evaluate(() =>
	[...document.querySelectorAll('.canon-segmented button')]
		.find((b) => b.textContent.trim() === 'Custom')
		.click(),
);
await sleep(100);
s = await state();
check(
	'Custom keeps the ratio',
	s.preset === 'Custom' && s.ratio === '1.5',
	`${s.preset} ${s.ratio}`,
);

const ratio = await page.$('.canon-decimal-field-input');
await ratio.evaluate((el) => el.select());
await ratio.type('2');
await page.keyboard.press('Enter');
await sleep(100);
s = await state();
check('a typed ratio lights its preset', s.preset === 'Loose', s.preset);
check('and drives the result', s.values[2] === 'line-height: 2;');

await page.evaluate(() =>
	document
		.querySelector('.line-height-calc-row[aria-label^="48px"]')
		.click(),
);
await sleep(700);
s = await state();
check('a row sets the size', s.field === '48' && s.values[0] === '96px');
check(
	'two boxes fit the picture',
	parseFloat(s.box) * 2 <= 220,
	`box ${s.box}`,
);

await page.click('.canon-value-line');
await sleep(200);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('a result line copies', copied === '96px', copied);
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (t) => t.style.opacity === '1'),
);

await finish(browser);
