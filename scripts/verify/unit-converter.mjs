// the canon unit-converter: the value field first, every category with its
// instrument, from/to by menu and by row, swap, copy, launch flags, phone

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const field = '.uc-field .canon-big-number-field-input';

const state = () =>
	page.evaluate(() => {
		const q = (s) => document.querySelector(s);
		const rows = [...document.querySelectorAll('.uc-row')];
		const of = (role) =>
			rows.find((r) => r.classList.contains(`uc-row--${role}`));
		return {
			field: q('.uc-field .canon-big-number-field-input').value,
			unit: q('.uc-field .canon-big-number-field-unit')?.textContent.trim(),
			figure: q('.uc-result .canon-figure-said').textContent.trim(),
			input: q('.uc-input .canon-figure-said').textContent.trim(),
			from: of('from')?.querySelector('.uc-plate').textContent.trim(),
			to: of('to')?.querySelector('.uc-plate').textContent.trim(),
			toValue: of('to')?.querySelector('.uc-value').textContent.trim(),
			rows: rows.length,
			drawing: q('.uc-drawing').innerHTML.length,
			reference: [...document.querySelectorAll('.canon-tiles-tile')].map(
				(t) => t.textContent.replace(/\s+/g, ' ').trim(),
			),
			copyOff: [...document.querySelectorAll('.unit-converter button')].find(
				(b) => b.textContent.trim() === 'Copy',
			)?.disabled,
		};
	});

const retype = async (text) => {
	await page.evaluate(() => document.activeElement?.blur());
	await page.click(field);
	await sleep(80);
	await page.keyboard.type(text);
	await sleep(60);
};

const pick = (title) =>
	page.evaluate(
		(t) =>
			[...document.querySelectorAll('[aria-label="Category"] [role="radio"]')]
				.find((b) => b.textContent.trim() === t)
				.click(),
		title,
	);

const clickRow = (symbol) =>
	page.evaluate(
		(s) =>
			[...document.querySelectorAll('.uc-row')]
				.find((r) => r.querySelector('.uc-plate').textContent.trim() === s)
				.click(),
		symbol,
	);

await visit(page, '/tools/unit-converter');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.unit-converter').getBoundingClientRect().height,
	),
);
const layout = await page.evaluate(() => {
	const input = document.querySelector('.uc-field .canon-big-number-field-input');
	const first = document.querySelector('.canon-split-sidebar .canon-rows > *');
	return { first: first?.contains(input), size: parseFloat(getComputedStyle(input).fontSize) };
});
check('the value field opens the settings pane', layout.first);
check('in the big-number size', layout.size >= 28, `${layout.size}px`);
let s = await state();
check('opens on 1 km to miles', s.field === '1' && s.from === 'km' && s.to === 'mi' && s.figure === '0.6214 mi', JSON.stringify(s));
check('the tape is drawn', s.drawing > 500, String(s.drawing));

await page.evaluate(() => document.activeElement?.blur());
await page.click(field);
await sleep(80);
check(
	'focus selects the whole value',
	await page.evaluate(() => {
		const f = document.querySelector('.uc-field .canon-big-number-field-input');
		return f.selectionStart === 0 && f.selectionEnd === f.value.length;
	}),
);
await page.keyboard.type('5');
await sleep(40);
s = await state();
check('typing replaces it and is live', s.field === '5' && s.figure === '3.1069 mi' && s.toValue === '3.1069', `${s.field} ${s.figure}`);
await page.keyboard.press('ArrowUp');
await sleep(40);
s = await state();
check('the arrow keys step', s.field === '6', s.field);
await retype('2,5');
s = await state();
check('a decimal comma counts', s.input === '2.5 km', s.input);
await retype('x');
s = await state();
check('no number: a dash and Copy off', s.figure === '—' && s.copyOff === true, s.figure);

await retype('10');
await clickRow('m');
await sleep(60);
s = await state();
check('a row click sets from first', s.from === 'm' && s.to === 'mi' && s.unit === 'm', `${s.from} ${s.to}`);
await clickRow('ft');
await sleep(60);
s = await state();
check('then to', s.from === 'm' && s.to === 'ft' && s.toValue === '32.8084', `${s.from} ${s.to} ${s.toValue}`);
check('the quick reference follows', s.reference.join('|') === '1 m 3.2808 ft|1 ft 0.3048 m', s.reference.join('|'));

await page.evaluate(() =>
	[...document.querySelectorAll('.unit-converter button')]
		.find((b) => b.textContent.trim() === 'Swap')
		.click(),
);
await sleep(60);
s = await state();
check('Swap turns the pair round', s.from === 'ft' && s.to === 'm', `${s.from} ${s.to}`);

await page.evaluate(() =>
	[...document.querySelectorAll('.unit-converter button')]
		.find((b) => b.textContent.trim() === 'Copy')
		.click(),
);
await sleep(300);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('Copy copies the result', copied === '3.048', copied);
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (t) => t.style.opacity === '1'),
);

const instruments = {
	Weight: 'kg lb',
	Temperature: '°C °F',
	Data: 'GB MB',
	Speed: 'km/h mph',
	Volume: 'L gal',
	Area: 'm² ft²',
	Time: 'hr min',
	Pressure: 'bar psi',
	Length: 'km mi',
};
for (const [name, pair] of Object.entries(instruments)) {
	await pick(name);
	await sleep(120);
	s = await state();
	check(`${name} opens on its pair and draws`, `${s.from} ${s.to}` === pair && s.drawing > 300, `${s.from} ${s.to} ${s.drawing}`);
}
check(
	'every web category is there',
	await page.evaluate(
		() =>
			['Length', 'Weight', 'Data', 'Temperature', 'Speed', 'Area', 'Volume'].every((n) =>
				[...document.querySelectorAll('[aria-label="Category"] [role="radio"]')].some(
					(b) => b.textContent.trim() === n,
				),
			),
	),
);

await pick('Temperature');
await retype('-40');
s = await state();
check('temperatures go below zero', s.figure === '-40 °F', s.figure);
await retype('-273.15');
await page.keyboard.press('ArrowDown');
await sleep(40);
s = await state();
check('and stop at absolute zero', s.field === '-273.15', s.field);
check('the reference is the formula', s.reference[0] === '°F °C × 1.8 + 32', s.reference[0]);

await visit(page, '/tools/unit-converter?ucCategory=Data&ucFrom=KB&ucTo=B&ucValue=2');
s = await state();
check('launch flags, binary prefixes', s.figure === '2048 B', s.figure);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/unit-converter?ucCategory=Weight&ucValue=20');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
	),
);

await finish(browser);
