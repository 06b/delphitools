// the canon sci-calc: display, keypad, typed keys, paste, history tape, constants, copy, layouts

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
		expression: document
			.querySelector('.sci-expression')
			.textContent.replace(/\s+/g, ''),
		readout: document
			.querySelector('.sci-readout')
			.textContent.replace(/\s+/g, ''),
		kind: [...document.querySelector('.sci-readout').classList]
			.find((c) => c.startsWith('sci-readout--'))
			?.slice(13),
		tape: [...document.querySelectorAll('.sci-tape .sci-tape-row')].map(
			(r) => r.textContent.replace(/\s+/g, ''),
		),
	}));
const key = (id) =>
	page.evaluate((id) => document.querySelector(`.sci-key[data-key="${id}"]`).click(), id);
const keys = async (...ids) => {
	for (const id of ids) await key(id);
	await sleep(30);
};
const typeText = async (text) => {
	await page.evaluate(() => document.activeElement?.blur());
	await page.keyboard.type(text);
	await sleep(50);
};

await visit(page, '/tools/sci-calc');
await sleep(800);
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.sci-calc').getBoundingClientRect().height,
	),
);
check(
	'the tool page does not scroll',
	await page.evaluate(() => {
		const main = document.querySelector('.sci-calc .canon-split-main');
		return main.scrollHeight <= main.clientHeight + 1;
	}),
);
let s = await state();
check('idle reads 0', s.readout === '0' && s.kind === 'idle', JSON.stringify(s));

await keys('7', '×', '6');
s = await state();
check('keys type and preview the value faint', s.expression === '7×6' && s.readout === '42' && s.kind === 'preview', JSON.stringify(s));
await key('=');
await sleep(50);
s = await state();
check('= lights the result', s.readout === '42' && s.kind === 'result', JSON.stringify(s));
check('and adds it to the tape', s.tape[0] === '7×6=42', s.tape.join());
await key('5');
s = await state();
check('a digit after a result starts afresh', s.expression === '5', s.expression);
await keys('C', 'Ans', '+', '1', '=');
s = await state();
check('Ans recalls the last answer', s.readout === '43', s.readout);
await keys('+', '2');
s = await state();
check('an operator carries the result on', s.expression === '43+2' && s.readout === '45', JSON.stringify(s));

await keys('C', 'sin', '3', '0', '=');
s = await state();
check('degrees: sin 30 is 0.5', s.readout === '0.5', s.readout);
await page.evaluate(() =>
	[...document.querySelectorAll('.sci-modes button')]
		.find((b) => b.textContent.trim() === 'RAD')
		.click(),
);
await keys('C', 'π', '=');
s = await state();
check('radians and π', s.readout.startsWith('3.14159265'), s.readout);
await page.evaluate(() =>
	[...document.querySelectorAll('.sci-modes button')]
		.find((b) => b.textContent.trim() === 'DEG')
		.click(),
);

await keys('C', '2', 'sin');
s = await state();
check('a function after a digit gets a times sign, brackets close faint', s.expression === '2×sin()', s.expression);
await keys('C', '1', '÷', '0', '=');
s = await state();
check('1÷0 is infinite, a failure', s.readout === '∞' && s.kind === 'failure', JSON.stringify(s));
await keys('C', '2', '+', '=');
s = await state();
check('an unfinished expression fails', s.readout === 'Error' && s.kind === 'failure', JSON.stringify(s));

await keys('C');
await typeText('12*3-4');
s = await state();
check('typed keys from the keyboard', s.expression === '12×3−4' && s.readout === '32', JSON.stringify(s));
await page.keyboard.press('Backspace');
await typeText('5');
await page.keyboard.press('Enter');
await sleep(50);
s = await state();
check('Backspace and Enter', s.readout === '31' && s.kind === 'result', JSON.stringify(s));
await page.keyboard.press('Escape');
await sleep(30);
s = await state();
check('Escape clears', s.expression === '' && s.readout === '0', JSON.stringify(s));
await typeText('2^10');
s = await state();
check('^ types a power, raised', s.readout === '1024', s.readout);
check(
	'the exponent is raised in the display',
	await page.evaluate(() => !!document.querySelector('.sci-expression .is-raised')),
);
await page.keyboard.press('Escape');

await page.evaluate(() => {
	const data = new DataTransfer();
	data.setData('text/plain', '3 * (4 + 5)');
	document
		.querySelector('.sci-calc')
		.dispatchEvent(
			new ClipboardEvent('paste', {
				clipboardData: data,
				bubbles: true,
				cancelable: true,
			}),
		);
});
await sleep(50);
s = await state();
check('paste types an expression', s.expression === '3×(4+5)' && s.readout === '27', JSON.stringify(s));

await page.evaluate(() =>
	[...document.querySelectorAll('.sci-modes button')]
		.find((b) => b.textContent.trim() === 'Copy')
		.click(),
);
await sleep(200);
let copied = await page.evaluate(() => navigator.clipboard.readText());
check('Copy copies the reading', copied === '27', copied);

await keys('C');
await page.evaluate(() => document.querySelector('.sci-tape .sci-tape-row').click());
await sleep(50);
s = await state();
check('a tape row takes its expression back', s.expression === '12×3−5' && s.kind === 'preview', JSON.stringify(s));
const before = s.tape.length;
check('the tape keeps every result', before >= 5, String(before));

await key('Const');
await sleep(500);
check('Const opens the constants', !!(await page.$('dialog[open] .canon-command')));
await page.keyboard.type('golden');
await sleep(100);
await page.keyboard.press('Enter');
await sleep(500);
s = await state();
check('a constant is typed in', s.expression.endsWith('1.618033989'), s.expression);
check('and the dialog closes', !(await page.$('dialog[open]')));

await page.evaluate(() =>
	[...document.querySelectorAll('.sci-tape .canon-button')]
		.find((b) => b.textContent.trim() === 'Clear')
		.click(),
);
await sleep(50);
s = await state();
check('Clear empties the tape', s.tape.length === 0, String(s.tape.length));

const hold = await page.$('.sci-key[data-key="⌫"]');
await keys('C', '1', '2', '3', '4', '5', '6', '7', '8');
const box = await hold.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await sleep(900);
await page.mouse.up();
await sleep(50);
s = await state();
check('holding ⌫ deletes again and again', s.expression.length < 5, s.expression);

check(
	'every key is named',
	await page.evaluate(() =>
		[...document.querySelectorAll('.sci-key')].every(
			(k) => (k.getAttribute('aria-label') ?? k.textContent).trim(),
		),
	),
);

await visit(page, '/tools/sci-calc?sciKeys=sin 30 ) %2B √ 2 × π =');
await sleep(800);
s = await state();
check('launch keys', s.readout === '3.006628275', JSON.stringify(s));

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/sci-calc');
await sleep(800);
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <=
			document.documentElement.clientWidth,
	),
);
const phone = await page.evaluate(() => ({
	tape: !!document.querySelector('.sci-tape'),
	history: [...document.querySelectorAll('.sci-modes button')].some(
		(b) => b.getAttribute('aria-label') === 'History',
	),
	scrolls: (() => {
		// the sticker sits below, as on iOS; the calculator itself must fit
		const body = document.querySelector('.sci-calc .canon-split-body');
		const keys = document.querySelector('.sci-keypad');
		return keys.getBoundingClientRect().bottom > body.getBoundingClientRect().top + body.clientHeight + 1;
	})(),
	tall: !document.querySelector('.sci-keypad--wide'),
}));
check('stacked: the tape leaves for a History button', !phone.tape && phone.history, JSON.stringify(phone));
check('stacked: the calculator fits without scrolling', !phone.scrolls);
check('stacked: functions over the digits', phone.tall);
await page.evaluate(() =>
	document
		.querySelector('.sci-modes button[aria-label="History"]')
		.click(),
);
await sleep(500);
check(
	'History opens the tape in a sheet',
	!!(await page.$('dialog[open] .canon-empty-row')),
);

await page.setViewport({ width: 1400, height: 520 });
await visit(page, '/tools/sci-calc');
await sleep(800);
check(
	'short and wide: the blocks sit side by side',
	!!(await page.$('.sci-keypad--wide')),
);

await finish(browser);
