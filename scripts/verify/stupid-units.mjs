import { launch, visit, check, sleep, finish } from './harness.mjs';

const { browser, page } = await launch();

const state = () =>
	page.evaluate(() => {
		const rows = [...document.querySelectorAll('.stupid-units-row')];
		const amount = (name) =>
			rows
				.find(
					(r) =>
						r.querySelector('.stupid-units-unit').textContent.trim() ===
						name,
				)
				?.querySelector('.stupid-units-amount')
				.textContent.trim();
		return {
			count: rows.length,
			lit: rows
				.filter((r) => r.getAttribute('aria-pressed') === 'true')
				.map((r) => r.querySelector('.stupid-units-unit').textContent.trim()),
			value: document.querySelector('.canon-big-number-field-input').value,
			unit: document
				.querySelector('.canon-big-number-field-unit')
				.textContent.trim(),
			heading: document
				.querySelector('.canon-split-main .canon-heading')
				.textContent.trim(),
			eiffel: amount('Eiffel Tower'),
			banana: amount('Banana'),
			amount,
		};
	});

await visit(page, '/tools/stupid-units');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.stupid-units').getBoundingClientRect()
				.height,
	),
);
let s = await state();
check(
	'opens on 1 Banana in Length',
	s.value === '1' && s.unit === 'Banana' && s.heading === 'Length',
	`${s.value} ${s.unit} ${s.heading}`,
);
check('Banana is the lit row', s.lit.join() === 'Banana');
check('1 banana is 1 banana', s.banana === '1');

const field = await page.evaluate(() => {
	const first = document.querySelector('.canon-split-sidebar > *');
	const input = document.querySelector('.canon-big-number-field-input');
	return {
		first: first.contains(input),
		size: parseFloat(getComputedStyle(input).fontSize),
	};
});
check('the amount opens the settings, large', field.first && field.size >= 32, `${field.size}`);

await page.click('.canon-big-number-field-input');
await sleep(100);
await page.keyboard.type('1833');
s = await state();
check('a click selects, typing replaces, live', s.value === '1833', s.value);
check(
	'1833 bananas are nearly an Eiffel Tower',
	s.eiffel === '0.9998', s.eiffel,
);
await page.keyboard.press('ArrowUp');
s = await state();
check('arrow keys step the amount', s.value === '1834', s.value);

await page.evaluate(() =>
	[...document.querySelectorAll('.stupid-units-row')]
		.find((r) => r.textContent.includes('Eiffel Tower'))
		.click(),
);
await sleep(100);
s = await state();
check(
	'a row becomes the unit, the quantity kept',
	s.lit.join() === 'Eiffel Tower' && s.unit === 'Eiffel Tower' && s.value === '1',
	`${s.lit} ${s.unit} ${s.value}`,
);

await page.evaluate(() =>
	[...document.querySelectorAll('.stupid-units [role="radio"]')]
		.find((b) => b.textContent.trim() === 'Mass')
		.click(),
);
await sleep(100);
s = await state();
check('Mass lists its units', s.heading === 'Mass' && s.count > 10, `${s.heading} ${s.count}`);

await page.focus('.canon-big-number-field-input');
await page.evaluate(() => {
	const input = document.querySelector('.canon-big-number-field-input');
	input.value = 'abc';
	input.dispatchEvent(new Event('input', { bubbles: true }));
});
s = await state();
check(
	'no number: dashes',
	(await page.$$eval('.stupid-units-amount', (els) =>
		els.every((el) => el.textContent.trim() === '—'),
	)),
);

await visit(page, '/tools/stupid-units?suCategory=time&suUnit=moment&suValue=2');
s = await state();
check(
	'query flags: category, unit, value',
	s.heading === 'Time' && s.unit === 'Moment' && s.value === '2',
	`${s.heading} ${s.unit} ${s.value}`,
);

await visit(page, '/experiments');
check(
	'still listed in the experiments',
	await page.evaluate(
		() => !!document.querySelector('a[href="/tools/stupid-units"]'),
	),
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/stupid-units');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <=
			document.documentElement.clientWidth,
	),
);

await finish(browser);
