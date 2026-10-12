// the canon paper-sizes: find, slots, picture, units, files

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();

const state = () =>
	page.evaluate(() => {
		const picture = document.querySelector('.paper-picture');
		return {
			field: document.querySelector('.paper-find').value,
			label: picture.getAttribute('aria-label'),
			arrangement: picture.dataset.arrangement,
			legend: [...document.querySelectorAll('.paper-legend-line')].map(
				(l) => l.textContent.trim(),
			),
			ratio:
				document
					.querySelector('.paper-ratio .canon-figure-said')
					?.textContent.trim() ?? '',
			series: [
				...document.querySelectorAll(
					'.paper-sizes .canon-jump-heading',
				),
			].map((h) => h.dataset.canonJumpTitle),
			cells: document.querySelectorAll('.paper-sizes .paper-cell')
				.length,
			closest: [
				...document.querySelectorAll(
					'.paper-sizes .paper-cell:has(.paper-cell-detail)',
				),
			].map((c) => c.querySelector('.paper-cell-name').textContent.trim()),
			dpi: !!document.querySelector(
				'.paper-sizes [aria-label="DPI"]',
			),
			empty:
				document
					.querySelector('.paper-sizes .canon-empty-row')
					?.textContent.trim() ?? '',
		};
	});

// focus selects the query, so typing replaces it
const type = async (text) => {
	await page.evaluate(() => document.activeElement?.blur());
	await page.click('.paper-find');
	await sleep(80);
	if (text) await page.keyboard.type(text);
	else await page.keyboard.press('Backspace');
	await sleep(30);
};

const segment = (group, text) =>
	page.evaluate(
		(g, t) =>
			[
				...document.querySelectorAll(
					`.paper-sizes [aria-label="${g}"] [role="radio"], .paper-sizes [aria-label="${g}"] button`,
				),
			]
				.find((b) => b.textContent.trim() === t)
				.click(),
		group,
		text,
	);

await visit(page, '/tools/paper-sizes');
await page.evaluate(() => localStorage.removeItem('paperSizeUnit'));
await visit(page, '/tools/paper-sizes');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.paper-sizes').getBoundingClientRect()
				.height,
	),
);
let s = await state();
check('A4 starts in slot 1', s.legend.join('|') === '1 · A4 · 210 × 297 mm', s.legend.join('|'));
check('the picture is a named button', !!s.label, s.label);

const field = await page.evaluate(() => {
	const input = document.querySelector('.paper-find');
	const first = document.querySelector('.canon-split-main > *');
	return {
		first: first?.contains(input),
		size: parseFloat(getComputedStyle(input).fontSize),
		height: input.getBoundingClientRect().height,
	};
});
check('the find field opens the settings pane', field.first);
check('and is large', field.size >= 28 && field.height >= 60, `${field.size}px, ${field.height}px tall`);

// live: no pause before the lists follow
await type('jis');
s = await state();
check('typing is live: a name filters the series', s.series.join('|') === 'Japanese JIS', s.series.join('|'));
await page.evaluate(() => document.activeElement?.blur());
await page.click('.paper-find');
await sleep(80);
check(
	'focus selects the whole query',
	await page.evaluate(() => {
		const f = document.querySelector('.paper-find');
		return f.selectionStart === 0 && f.selectionEnd === f.value.length;
	}),
);
await page.keyboard.type('nothing like it');
await sleep(30);
s = await state();
check('typing replaces the selection', s.field === 'nothing like it', s.field);
check('no match shows the empty row', s.empty === 'No match' && s.cells === 0, s.empty);

await type('297x210');
s = await state();
check('a size finds the closest, either way up', s.closest[0] === 'A4', s.closest.join('|'));
check('five closest', s.closest.length === 5);

await type('2480x3508@150dpi');
s = await state();
check('a pixel query shows the DPI row', s.dpi);
await segment('DPI', '300 DPI');
await sleep(50);
s = await state();
check('a DPI pick rewrites the pixel query', s.field === '2480x3508@300dpi', s.field);
check('and A4 is closest', s.closest[0] === 'A4', s.closest[0]);

// slots: 2, 1, 2
const pickCell = (name) =>
	page.evaluate(
		(n) =>
			[...document.querySelectorAll('.paper-sizes .paper-cell')]
				.find(
					(c) =>
						!c.querySelector('.paper-cell-detail') &&
						c.querySelector('.paper-cell-name').textContent.trim() === n,
				)
				.click(),
		name,
	);
await type('');
await pickCell('A5');
await sleep(50);
s = await state();
check('a pick fills slot 2', s.legend[1] === '2 · A5 · 148 × 210 mm', s.legend.join('|'));
check('the ratio shows', s.ratio.startsWith('2'), s.ratio);
await pickCell('A3');
await sleep(50);
s = await state();
check('the next pick fills slot 1', s.legend[0] === '1 · A3 · 297 × 420 mm', s.legend.join('|'));
check(
	'picked cells carry their slot',
	await page.evaluate(
		() =>
			document.querySelectorAll('.paper-sizes .paper-cell[aria-current="true"]')
				.length >= 2,
	),
);

// picture: click and keyboard cycle the arrangement
await page.click('.paper-picture');
await sleep(50);
s = await state();
check('a click cycles the arrangement', s.arrangement === 'sideBySide', s.arrangement);
await page.focus('.paper-picture');
await page.keyboard.press('Enter');
await sleep(50);
s = await state();
check('Enter cycles it too', s.arrangement === 'aboveBelow', s.arrangement);

// units persist
await segment('Units', 'in ½');
await sleep(50);
s = await state();
check('units change the legend', s.legend[0] === '1 · A3 · ≈ 11¾ × 16½″', s.legend[0]);
await visit(page, '/tools/paper-sizes');
s = await state();
check('the unit is kept', s.legend[0].endsWith('″'), s.legend[0]);
await page.evaluate(() => localStorage.setItem('paperSizeUnit', 'mm'));
await visit(page, '/tools/paper-sizes');
s = await state();
check('the web tool unit still reads', s.legend[0].endsWith('mm'), s.legend[0]);

// a file pasted anywhere, and dropped
const imageFile = (w, h) => `(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = ${w};
	canvas.height = ${h};
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const data = new DataTransfer();
	data.items.add(new File([blob], 'page.png', { type: 'image/png' }));
	return data;
})()`;
await page.evaluate(`(async () => {
	document.activeElement?.blur();
	const data = await ${imageFile(1240, 1754)};
	document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
})()`);
await sleep(300);
s = await state();
check('a pasted image becomes a pixel query', s.field === '1240x1754@300dpi', s.field);
check('A6 is closest', s.closest[0] === 'A6', s.closest[0]);
await page.evaluate(`(async () => {
	const data = await ${imageFile(2480, 3508)};
	const target = document.querySelector('.paper-sizes .canon-split-main');
	target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }));
	target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
})()`);
await sleep(300);
s = await state();
check('a dropped image too', s.field === '2480x3508@300dpi', s.field);

// launch flags
await visit(page, '/tools/paper-sizes?paperCompare=A4,A3&paperUnit=3&paperFind=letter&paperArrange=1');
s = await state();
check('?paperCompare, ?paperUnit', s.legend.join('|') === '1 · A4 · 595.3 × 841.9 pt|2 · A3 · 841.9 × 1190.6 pt', s.legend.join('|'));
check('?paperFind', s.field === 'letter' && s.series.join('|') === 'US Classic', s.series.join('|'));
check('?paperArrange', s.arrangement === 'sideBySide', s.arrangement);
await page.evaluate(() => localStorage.removeItem('paperSizeUnit'));

// phone
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/paper-sizes?paperCompare=A4,A3');
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.paper-sizes .canon-split-body');
	const canvas = () =>
		document.querySelector('.paper-sizes .canon-canvas').getBoundingClientRect()
			.height;
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
check('the picture collapses to 240 px', phone.full > 240 && Math.round(phone.band) === 240, `${phone.full} ${phone.band}`);
check('no horizontal scroll', !phone.wide);

await finish(browser);
