// the canon base-converter: the number typed in the picture, bases, word
// sizes, lamps, bitwise operations, copy, launch flags, phone layout

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const field = '.bc-entry .canon-big-number-field-input';

const state = () =>
	page.evaluate(() => {
		const q = (s) => document.querySelector(s);
		const lines = (rows) =>
			Object.fromEntries(
				[...(rows?.querySelectorAll('.canon-value-line') ?? [])].map(
					(l) => [
						l.querySelector('.canon-value-line-label').textContent.trim(),
						l.querySelector('.canon-value-line-value').textContent.trim(),
					],
				),
			);
		const [values, operation] = document.querySelectorAll('.bc-values');
		return {
			field: q('.bc-entry .canon-big-number-field-input').value,
			unit: q('.bc-entry .canon-big-number-field-unit')?.textContent.trim(),
			status: q('.bc-entry-status')?.textContent.trim(),
			figure: q('.bc-figure .canon-figure-said').textContent.trim(),
			caption: q('.bc-caption').textContent.trim(),
			values: lines(values),
			results: lines(operation),
			operands: document.querySelectorAll('.bc-operand').length,
			lamps: document.querySelectorAll('.bc-operand')[0]?.querySelectorAll('.bc-lamp').length,
			lit: [...(document.querySelectorAll('.bc-operand')[0]?.querySelectorAll('.bc-lamp') ?? [])]
				.filter((l) => l.classList.contains('bc-lamp--on')).length,
			word: q('[aria-label="Word size"] [aria-checked="true"]')?.textContent.trim(),
			b: q('.bc-operand-field')?.value,
		};
	});

const retype = async (text) => {
	await page.evaluate(() => document.activeElement?.blur());
	await page.click(field);
	await sleep(80);
	await page.keyboard.type(text);
	await sleep(40);
};

const pick = (group, title) =>
	page.evaluate(
		(g, t) =>
			[...document.querySelectorAll(`[aria-label="${g}"] [role="radio"]`)]
				.find((b) => b.textContent.trim() === t)
				.click(),
		group,
		title,
	);

await visit(page, '/tools/base-converter');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.base-converter').getBoundingClientRect().height,
	),
);
const layout = await page.evaluate(() => {
	const input = document.querySelector('.bc-entry .canon-big-number-field-input');
	const picture = document.querySelector('.canon-split-sidebar .canon-canvas');
	return {
		inPicture: picture?.contains(input),
		size: parseFloat(getComputedStyle(input).fontSize),
	};
});
check('the number is typed in the picture', layout.inPicture);
check('in the big-number size', layout.size >= 28, `${layout.size}px`);

let s = await state();
check('starts empty with a dash', s.field === '' && s.figure === '—' && s.values.Decimal === '—', JSON.stringify(s));
check('16 bits of lamps', s.caption === '16 bits' && s.lamps === 16, `${s.caption} ${s.lamps}`);

await retype('255');
s = await state();
check('typing is live', s.figure === '255' && s.values.Hexadecimal === '0xFF', `${s.figure} ${s.values.Hexadecimal}`);
check('every base reads, prefixed', s.values.Binary === '0b11111111' && s.values.Octal === '0o377', JSON.stringify(s.values));
check('eight lamps lit', s.lit === 8, String(s.lit));

await page.evaluate(() => document.activeElement?.blur());
await page.click(field);
await sleep(80);
check(
	'focus selects the whole value',
	await page.evaluate(() => {
		const f = document.querySelector('.bc-entry .canon-big-number-field-input');
		return f.selectionStart === 0 && f.selectionEnd === f.value.length;
	}),
);
await page.keyboard.type('12a');
await sleep(40);
s = await state();
check(
	'a foreign digit says why',
	s.status === 'a is not a digit in Decimal, which takes 0 to 9' && s.values.Decimal === '—',
	s.status,
);
check(
	'the entry turns red',
	await page.evaluate(() => !!document.querySelector('.bc-entry--error')),
);

await retype('0xff');
s = await state();
check('a prefix picks its own base', s.unit === 'HEX' && s.values.Decimal === '255', `${s.unit} ${s.values.Decimal}`);

await pick('Base', 'Hexadecimal');
await sleep(60);
s = await state();
check('a new base rewrites the number in it', s.field === 'FF' && s.unit === 'HEX', `${s.field} ${s.unit}`);

await page.click(field);
await page.keyboard.press('ArrowUp');
await sleep(40);
s = await state();
check('the arrow keys step', s.field === '100' && s.values.Decimal === '256', s.field);

await page.click('.bc-operand [aria-label="Bit 0"]');
await sleep(40);
s = await state();
check('a lamp flips its bit', s.field === '101' && s.values.Decimal === '257', s.field);
check(
	'lamps are named, pressed buttons',
	await page.$eval(
		'.bc-operand [aria-label="Bit 0"]',
		(b) => b.tagName === 'BUTTON' && b.getAttribute('aria-pressed') === 'true',
	),
);

check(
	'8 bits is off while the number needs 16',
	await page.evaluate(
		() =>
			[...document.querySelectorAll('[aria-label="Word size"] [role="radio"]')]
				.find((b) => b.textContent.trim() === '8').disabled,
	),
);
await pick('Word size', '32');
await sleep(80);
s = await state();
check('a larger word shows more lamps', s.lamps === 32 && s.caption === '32 bits', `${s.lamps}`);

await retype('FFFFFFFFFFFFFFFF');
s = await state();
check('the word grows to hold the number', s.word === '64' && s.lamps === 64, `${s.word} ${s.lamps}`);
await retype('1FFFFFFFFFFFFFFFF');
s = await state();
check('past 64 bits says so', s.status === 'Larger than 64 bits', s.status);

await retype('BEEF');
await pick('Word size', '16');
await sleep(60);
await page.evaluate(() =>
	[...document.querySelectorAll('.bc-values .canon-value-line')]
		.find((l) => l.textContent.includes('Hexadecimal'))
		.click(),
);
await sleep(300);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('a value line copies the prefixed value', copied === '0xBEEF', copied);
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (t) => t.style.opacity === '1'),
);

await page.click('.bc-values .canon-switch');
await sleep(80);
s = await state();
check('Bitwise sets the register as a sum', s.operands === 3, String(s.operands));
check('AND waits for B', s.results.Decimal === '—', JSON.stringify(s.results));
await page.click('.bc-operand-field');
await page.keyboard.type('FF0F');
await sleep(40);
s = await state();
check('A AND B, live', s.results.Hexadecimal === '0xBE0F' && s.figure === '48655', `${s.results.Hexadecimal} ${s.figure}`);
await page.evaluate(() =>
	document.querySelectorAll('.bc-operand')[1].querySelector('[aria-label="Bit 4"]').click(),
);
await sleep(40);
s = await state();
check('a lamp of B flips B', s.b === 'FF1F' && s.results.Hexadecimal === '0xBE0F', `${s.b} ${s.results.Hexadecimal}`);

await pick('Operation', 'NOT');
await sleep(60);
s = await state();
check('NOT drops B and flips within the word', s.b === undefined && s.operands === 2 && s.results.Hexadecimal === '0x4110', `${s.operands} ${s.results.Hexadecimal}`);

await pick('Operation', '<<');
await sleep(60);
await page.evaluate(() => {
	const shift = [...document.querySelectorAll('.canon-row')]
		.find((r) => r.textContent.includes('Shift'))
		.querySelector('input');
	shift.focus();
	shift.select();
});
await page.keyboard.type('4');
await page.keyboard.press('Enter');
await sleep(60);
s = await state();
check('a shift keeps to the word', s.results.Hexadecimal === '0xEEF0', s.results.Hexadecimal);
check(
	'the result row is not editable',
	await page.evaluate(
		() =>
			document.querySelector('.bc-operand--result').getAttribute('aria-hidden') === 'true' &&
			!document.querySelector('.bc-operand--result button'),
	),
);

await visit(page, '/tools/base-converter?baseValue=12&baseRadix=1&baseWord=32&baseBitwise=1&baseOp=2&baseB=A&baseShift=3');
s = await state();
check(
	'launch flags',
	s.field === '12' && s.unit === 'HEX' && s.word === '32' && s.b === 'A' && s.results.Hexadecimal === '0x18',
	JSON.stringify({ f: s.field, u: s.unit, w: s.word, b: s.b, r: s.results.Hexadecimal }),
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/base-converter?baseValue=48879');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
	),
);
const band = async () =>
	page.$eval('.canon-split-sidebar .canon-canvas', (c) => c.getBoundingClientRect().height);
const full = await band();
await page.evaluate(() => {
	document.querySelector('.canon-split-body').scrollTop = 400;
});
await sleep(200);
const collapsed = await band();
check('the picture collapses as the page scrolls', collapsed < full && collapsed >= 198, `${full} → ${collapsed}`);
check(
	'the lamps still fit the band',
	await page.evaluate(() => {
		const area = document.querySelector('.bc-area').getBoundingClientRect();
		const lamps = [...document.querySelectorAll('.bc-lamp')].map((l) => l.getBoundingClientRect());
		return lamps.every((l) => l.right <= area.right + 1 && l.left >= area.left - 1);
	}),
);

await finish(browser);
