// the canon px-to-rem: live value, direction swap, base, reference, copy

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
	page.evaluate(() => ({
		field: document.querySelector('.canon-big-number-field-input').value,
		unit: document
			.querySelector('.canon-big-number-field-unit')
			.textContent.trim(),
		result: document
			.querySelector('.px-to-rem-result .canon-figure-said')
			.textContent.replace(/\s+/g, ''),
		current: document
			.querySelector('.px-to-rem-row[aria-current="true"]')
			?.getAttribute('aria-label'),
		copyOff: [...document.querySelectorAll('.px-to-rem button')].find(
			(b) => b.textContent.trim() === 'Copy',
		)?.disabled,
	}));

const field = '.canon-big-number-field-input';
const retype = async (text) => {
	await page.evaluate(() => document.activeElement?.blur());
	await page.click(field);
	await sleep(80);
	await page.keyboard.type(text);
	await sleep(30);
};

await visit(page, '/tools/px-to-rem');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.px-to-rem').getBoundingClientRect()
				.height,
	),
);
let s = await state();
check('starts at 16 px, 1 rem', s.field === '16' && s.result === '1rem', `${s.field} ${s.result}`);
check('the 16 px row is current', s.current === '16px, 1rem', s.current);

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
await page.keyboard.type('2');
await sleep(20);
s = await state();
check('typing replaces it and is live', s.field === '2' && s.result === '0.125rem', `${s.field} ${s.result}`);
await page.keyboard.type('4');
await sleep(20);
s = await state();
check('every keystroke answers', s.result === '1.5rem' && s.current === '24px, 1.5rem', s.result);

await page.keyboard.press('ArrowUp');
await sleep(20);
s = await state();
check('the arrow keys step a pixel', s.field === '25', s.field);

await retype('1,5');
s = await state();
check('a decimal comma counts', s.result === '0.0938rem', s.result);
await retype('x');
s = await state();
check('no number: a dash and Copy off', s.result === '—' && s.copyOff === true, s.result);

await retype('24');
await page.evaluate(() =>
	[...document.querySelectorAll('.px-to-rem [aria-label="Direction"] *')]
		.find((b) => b.textContent.trim() === 'REM → PX')
		.click(),
);
await sleep(50);
s = await state();
check('swapping keeps the pair on screen', s.field === '1.5' && s.unit === 'REM' && s.result === '24px', `${s.field} ${s.unit} ${s.result}`);

await page.evaluate(() => {
	const base = document.querySelector('.px-to-rem .canon-row input');
	base.focus();
	base.select();
});
await page.keyboard.type('10');
await page.keyboard.press('Enter');
await sleep(50);
s = await state();
check('the base drives the result', s.result === '15px', s.result);

await page.evaluate(() =>
	document.querySelector('.px-to-rem-row[aria-label^="40px"]').click(),
);
await sleep(50);
s = await state();
check('a reference row sets the value in rem', s.field === '4' && s.result === '40px', `${s.field} ${s.result}`);

await page.evaluate(() =>
	[...document.querySelectorAll('.px-to-rem button')]
		.find((b) => b.textContent.trim() === 'Copy')
		.click(),
);
await sleep(300);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('Copy copies the result with its unit', copied === '40px', copied);
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (t) => t.style.opacity === '1'),
);

await visit(page, '/tools/px-to-rem?pxValue=2&pxDirection=1&pxBase=10');
s = await state();
check('launch flags', s.field === '2' && s.unit === 'REM' && s.result === '20px', `${s.field} ${s.unit} ${s.result}`);
check(
	'the result is a named output',
	await page.$eval('.px-to-rem-result', (o) => o.tagName === 'OUTPUT' && !!o.getAttribute('aria-label')),
);

const searchFor = (query) =>
	page.$eval(
		'.dt-search-input',
		(input, q) => {
			input.value = q;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		},
		query,
	);
const found = () =>
	page.evaluate(
		() =>
			!!document.querySelector('.canon-sidebar-rows a[href="/tools/px-to-rem"]'),
	);
await searchFor('qqq');
await sleep(200);
check('the drawer search drops the tool for an unrelated query', !(await found()));
for (const query of ['px2rem', 'rem2px', 'px to rem', 'rem-to-px', 'PX2REM']) {
	await searchFor(query);
	await sleep(200);
	check(`the drawer search finds the tool for "${query}"`, await found());
}

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/px-to-rem');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <=
			document.documentElement.clientWidth,
	),
);

await finish(browser);
