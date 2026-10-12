import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, launch, visit, check, sleep, finish } from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const state = () =>
	page.evaluate(() => {
		const said = (el) =>
			el.querySelector('.canon-figure-said').textContent.trim();
		return {
			figures: Object.fromEntries(
				[...document.querySelectorAll('.wc-figure')].map((f) => [
					f.getAttribute('aria-label'),
					said(f),
				]),
			),
			head: said(document.querySelector('.wc-picture-head')),
			tiles: [...document.querySelectorAll('.canon-tiles-tile')].map(
				(t) => t.textContent.replace(/\s+/g, ' ').trim(),
			),
			frequent: [...document.querySelectorAll('.wc-frequent')].map(
				(r) => r.getAttribute('aria-label'),
			),
			text: document.querySelector('.wc-editor').value,
		};
	});

const button = (label) =>
	page.evaluateHandle(
		(l) =>
			[...document.querySelectorAll('.word-counter button')].find(
				(b) =>
					b.getAttribute('aria-label') === l ||
					b.textContent.trim() === l,
			),
		label,
	);

await visit(page, '/tools/word-counter');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.word-counter').getBoundingClientRect()
				.height,
	),
);
const editor = await page.evaluate(() => {
	const area = document.querySelector('.wc-editor');
	return {
		inPicture: !!area.closest('.canon-split-sidebar .canon-canvas'),
		dashed: getComputedStyle(area).borderTopStyle,
		height: area.getBoundingClientRect().height,
	};
});
check('the editor is the picture', editor.inPicture);
check(
	'empty, it is the dashed box',
	editor.dashed === 'dashed' && editor.height >= 240,
	`${editor.dashed} ${editor.height}`,
);
let s = await state();
check('empty: zero words', s.figures.Words === '0' && s.head === '0words');
check('no frequent words yet', s.frequent.length === 0);
check(
	'Copy Stats and Clear wait for text',
	(await (await button('Copy Stats')).evaluate((b) => b.disabled)) &&
		(await (await button('Clear')).evaluate((b) => b.disabled)),
);

await page.click('.wc-editor');
await page.keyboard.type('The cat sat. The cat ran!\n\nA dog barked at the cat.');
s = await state();
check(
	'counts are live on each keystroke',
	s.figures.Words === '12' &&
		s.figures.Sentences === '3' &&
		s.figures.Paragraphs === '2',
	JSON.stringify(s.figures),
);
check('the head figure follows', s.head === '12words', s.head);
check(
	'tiles: no spaces, lines, average word, times',
	s.tiles.join('|') ===
		'No Spaces 39|Lines 3|Avg Word 3.3 chars|Reading time 4 sec|Speaking time 5 sec',
	s.tiles.join('|'),
);
check(
	'most frequent: the, then cat, ties alphabetical',
	s.frequent.slice(0, 3).join('|') === 'cat ×3|the ×3|barked ×1',
	s.frequent.join('|'),
);
const font = await page.$eval('.wc-editor', (el) =>
	parseFloat(getComputedStyle(el).fontSize),
);
check('the text is set large', font >= 17, `${font}`);
check(
	'typed text is not dashed',
	(await page.$eval('.wc-editor', (el) => getComputedStyle(el).borderTopStyle)) ===
		'none',
);

await (await button('Copy Stats')).click();
await sleep(300);
const report = await page.evaluate(() => navigator.clipboard.readText());
check(
	'Copy Stats copies the report',
	report.startsWith('Words: 12\nCharacters: 51\n'),
	JSON.stringify(report.slice(0, 40)),
);
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (t) => t.style.opacity === '1'),
);

await page.evaluate(() =>
	navigator.clipboard.writeText(
		'alpha beta gamma delta epsilon zeta theta iota kappa lambda',
	),
);
await (await button('Paste')).click();
await sleep(200);
s = await state();
check('Paste replaces the text from the clipboard', s.figures.Words === '10');
check('six or more words fold behind Show more', s.frequent.length === 5);
await (await button('Show more')).click();
await sleep(100);
s = await state();
check('Show more lists them all', s.frequent.length === 10);
check('and turns into Show fewer', !!(await (await button('Show fewer')).asElement()));

await (await button('Clear')).click();
await sleep(100);
s = await state();
check('Clear empties the text', s.text === '' && s.figures.Words === '0');

const dir = mkdtempSync(join(tmpdir(), 'wc-'));
const file = join(dir, 'note.txt');
writeFileSync(file, 'one two three four');
await (await page.$('.wc-file')).uploadFile(file);
await sleep(300);
s = await state();
check('Files reads a text file', s.text === 'one two three four');

await page.evaluate(() => {
	const data = new DataTransfer();
	data.items.add(new File(['five six'], 'drop.txt', { type: 'text/plain' }));
	const target = document.querySelector('.wc-editor');
	for (const type of ['dragover', 'drop'])
		target.dispatchEvent(
			new DragEvent(type, {
				dataTransfer: data,
				bubbles: true,
				cancelable: true,
			}),
		);
});
await sleep(300);
s = await state();
check('a dropped file replaces the text', s.text === 'five six', s.text);

await visit(page, '/tools/word-counter?wcText=hello%20there%20world&wcMore=1');
s = await state();
check('launch flag: text', s.figures.Words === '3' && s.text === 'hello there world');

// phone: stacked, the editor collapses as the counts scroll up
await page.setViewport({ width: 390, height: 844 });
await visit(
	page,
	`/tools/word-counter?wcText=${encodeURIComponent('lorem ipsum dolor sit amet '.repeat(200))}`,
);
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.word-counter .canon-split-body');
	const canvas = () =>
		document
			.querySelector('.word-counter .canon-canvas')
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
	'the editor collapses to 150 px',
	phone.full > 150 && Math.round(phone.band) === 150,
	`${phone.full} ${phone.band}`,
);
check('no horizontal scroll', !phone.wide);

await finish(browser);
