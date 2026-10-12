// the canon large-type: the display is the editor, live fit, caret, themes, marquee, size

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();

const editor = '.lt-editor';
const state = () =>
	page.evaluate(() => ({
		cells: [...document.querySelectorAll('.lt-cell .lt-glyph')].map(
			(g) => g.textContent,
		),
		count: document.querySelector('.large-type .canon-status')
			?.textContent.trim(),
		size: parseFloat(
			getComputedStyle(document.querySelector('.lt-stage'))
				.getPropertyValue('--lt-size'),
		),
		caret: (() => {
			const c = document.querySelector('.lt-caret');
			return c ? c.style.translate : undefined;
		})(),
		readout: [...document.querySelectorAll('.large-type .canon-slider')]
			.at(-1)
			?.textContent.trim(),
	}));

await visit(page, '/tools/large-type');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.large-type').getBoundingClientRect()
				.height,
	),
);
const empty = await page.evaluate(() => {
	const e = document.querySelector('.lt-editor');
	const pane = document.querySelector('.canon-split-sidebar');
	return {
		inPicture: pane.contains(e),
		placeholder: e.placeholder,
		dashed: getComputedStyle(e).borderTopStyle,
		label: e.getAttribute('aria-label'),
	};
});
check('the editor is in the picture pane', empty.inPicture);
check('empty, it is the dashed placeholder box', empty.dashed === 'dashed' && empty.placeholder === 'Type or paste', empty.dashed);
check('the editor is named', empty.label === 'Text');

await page.click(editor);
await page.keyboard.type('AB');
await sleep(30);
let s = await state();
check('typing shows each character live', s.cells.join('') === 'AB' && s.count === '2 characters', `${s.cells} ${s.count}`);
const big = s.size;
await page.keyboard.type('CDEFGHIJ');
await sleep(30);
s = await state();
check('maximum shrinks the type to fit', s.size < big, `${big} → ${s.size}`);
check('the size slider reads the fitted size', s.readout?.includes(`${Math.round(s.size)} px`), s.readout);
check('a caret is drawn while focused', !!s.caret);
const typedEnd = s.caret;
await page.keyboard.press('Home');
await sleep(30);
s = await state();
check('the caret follows the keys', s.caret && s.caret !== typedEnd, `${typedEnd} → ${s.caret}`);
await page.keyboard.type('1 #');
await sleep(30);
s = await state();
check('typing at the caret inserts there', s.cells.join('') === '1␣#ABCDEFGHIJ', s.cells.join(''));
const kinds = await page.evaluate(() =>
	[...document.querySelectorAll('.lt-cell .lt-glyph')]
		.slice(0, 3)
		.map((g) => g.className.match(/lt-glyph--(\w+)/)[1]),
);
check('colours mark digits, spaces and symbols', kinds.join() === 'digit,space,special', kinds.join());

// a click on the third cell's right half puts the caret after it, once the cells settle
await sleep(700);
const box = await page.evaluate(() => {
	const r = document.querySelectorAll('.lt-cell')[2].getBoundingClientRect();
	return { x: r.right - 4, y: r.top + r.height / 2 };
});
await page.mouse.click(box.x, box.y);
await sleep(50);
check(
	'a click on a cell places the caret beside it',
	await page.$eval(editor, (e) => e.selectionStart === 3 && e.selectionEnd === 3),
);
await page.keyboard.press('Backspace');
await sleep(30);
s = await state();
check('and editing works there', s.cells.join('') === '1␣ABCDEFGHIJ', s.cells.join(''));

await page.evaluate(() =>
	document.querySelector('.lt-swatch[aria-label="Night"]').click(),
);
await sleep(50);
check(
	'a theme recolours the display',
	await page.evaluate(
		() =>
			getComputedStyle(document.querySelector('.lt-stage'))
				.backgroundColor === 'rgb(0, 0, 0)' &&
			document
				.querySelector('.lt-swatch[aria-label="Night"]')
				.getAttribute('aria-checked') === 'true',
	),
);

const toggle = (title) =>
	page.evaluate((title) => {
		const row = [...document.querySelectorAll('.large-type .canon-row')].find(
			(r) => r.querySelector('.canon-row-title')?.textContent.trim() === title,
		);
		row.querySelector('input').click();
	}, title);
await toggle('Positions');
await sleep(30);
check('Positions hides the numbers', (await page.$$('.lt-position')).length === 0);
await toggle('Colours');
await sleep(30);
check(
	'Colours off sets digits as letters and hides the legend',
	await page.evaluate(
		() =>
			document.querySelector('.lt-cell .lt-glyph').className.includes('letter') &&
			!document.querySelector('.lt-legend'),
	),
);

await page.evaluate(() => {
	const slider = [...document.querySelectorAll('.large-type .canon-slider')].at(-1);
	slider.focus();
});
await page.keyboard.press('ArrowRight');
await sleep(30);
const maximumOff = await page.evaluate(() => {
	const row = [...document.querySelectorAll('.large-type .canon-row')].find(
		(r) => r.querySelector('.canon-row-title')?.textContent.trim() === 'Maximum',
	);
	return !row.querySelector('input').checked;
});
check('a size step turns Maximum off', maximumOff);

await toggle('Marquee');
await sleep(400);
const first = await page.$eval('.lt-marquee', (m) => m.style.translate);
await sleep(300);
const later = await page.$eval('.lt-marquee', (m) => m.style.translate);
check('the marquee moves', first !== later, `${first} → ${later}`);
check(
	'Speed shows with the marquee',
	await page.evaluate(() =>
		[...document.querySelectorAll('.large-type .canon-row-title')].some(
			(t) => t.textContent.trim() === 'Speed',
		),
	),
);
await toggle('Marquee');

// headless Chrome ignores Cmd+V; insertText takes the same native path into the textarea
await page.click(editor);
await page.evaluate(() => {
	const e = document.querySelector('.lt-editor');
	e.select();
	document.execCommand('insertText', false, 'PASTED');
});
await sleep(50);
s = await state();
check('text dropped into the editor replaces the selection', s.cells.join('') === 'PASTED', s.cells.join(''));
check(
	'Full Screen is on with text',
	await page.evaluate(
		() =>
			![...document.querySelectorAll('.large-type button')].find(
				(b) => b.textContent.trim() === 'Full Screen',
			).disabled,
	),
);

await visit(page, '/tools/large-type?ltText=12%20ab&ltTheme=4&ltPositions=no&ltSize=60');
s = await state();
check('launch flags', s.cells.join('') === '12␣ab' && s.size === 60 && (await page.$$('.lt-position')).length === 0, `${s.cells} ${s.size}`);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/large-type?ltText=Hello');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <=
			document.documentElement.clientWidth,
	),
);

await finish(browser);
