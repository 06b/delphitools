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
		const text = (sel) =>
			document.querySelector(sel)?.textContent.trim() ?? '';
		const values = [
			...document.querySelectorAll(
				'.canon-rows .canon-value-line-value',
			),
		].map((v) => v.textContent.trim());
		const input = document.querySelector(
			'.colour-atlas-input input',
		);
		return {
			strip: text('.canon-colour-strip-value'),
			name: text('.canon-colour-strip-name'),
			input: input.value,
			invalid: input.getAttribute('aria-invalid'),
			values,
			harmony: text(
				'.canon-palette-card [role="radio"][aria-checked="true"]',
			),
			swatches: [
				...document.querySelectorAll('.canon-palette-card'),
			].map(
				(card) =>
					card.querySelectorAll(
						'.canon-palette-card-swatch',
					).length,
			),
			marks: [
				...document.querySelectorAll(
					'.canon-colour-solid-marker--mark',
				),
			].filter((m) => !m.hidden).length,
			vision: document.querySelectorAll(
				'.canon-colour-card--row',
			).length,
			contrast: [
				...document.querySelectorAll(
					'.colour-atlas-contrast-ratio',
				),
			].map((r) => r.textContent.trim()),
			links: [
				...document.querySelectorAll(
					'.dt-atlas-open [data-tool]',
				),
			].map((a) => a.getAttribute('href')),
			search: location.search,
		};
	});

await visit(page, '/tools/colour-atlas');
const fills = await page.evaluate(() => {
	const sheet = document.querySelector('.dt-canon-tool');
	const split = document.querySelector('.colour-atlas');
	return (
		sheet.getBoundingClientRect().height ===
		split.getBoundingClientRect().height
	);
});
check('the split fills the sheet', fills);
let s = await state();
check('starts at #3B82F6', s.strip === '#3B82F6', s.strip);
check('nearest name in the strip', s.name.length > 0, s.name);
check('ten notation lines, four vision lines', s.values.length === 14, `${s.values.length}`);
check(
	'notation rows in iOS order',
	s.values.slice(0, 3).join('|') ===
		'#3B82F6|rgb(59, 130, 246)|rgb(0.2314, 0.5098, 0.9647)',
	s.values.slice(0, 3).join('|'),
);
check('contrast on white and black', s.contrast.join('|') === '3.67:1|5.7:1');
check('Complement leads, one mark', s.harmony === 'Complement' && s.marks === 1);
check(
	'harmony, tints and shades',
	s.swatches.join(',') === '2,9,9',
	s.swatches.join(','),
);
check('four vision cards', s.vision === 4);
check('six open-in tools', s.links.length === 6);
check(
	'open-in carries the colour',
	s.links.every((href) => href.includes('color=3B82F6')),
	s.links[0],
);
check('the URL is untouched before a change', !s.search.includes('color'));
check(
	'the solid is named, with a live reading',
	await page.evaluate(
		() =>
			!!document
				.querySelector('.canon-colour-solid')
				.getAttribute('aria-label') &&
			document
				.querySelector('.canon-colour-solid-value')
				.textContent.includes('#3B82F6'),
	),
);

// typing answers on each keystroke, before the kit's 400 ms pause
const input = await page.$('.colour-atlas-input input');
await input.evaluate((el) => el.select());
await input.type('#00ff00');
await sleep(120);
s = await state();
check('typing is live', s.strip === '#00FF00', s.strip);
check('the typed text stays while focused', s.input === '#00ff00', s.input);
await input.evaluate((el) => el.select());
await input.type('nonsense');
await sleep(600);
s = await state();
check('an unreadable colour turns the field red', s.invalid === 'true');
check('and keeps the last colour', s.strip === '#00FF00');
await input.evaluate((el) => el.select());
await input.type('tomato');
await sleep(100);
s = await state();
check('reads CSS colour names', s.strip === '#FF6347', s.strip);
await page.keyboard.press('Tab');
await sleep(500);
s = await state();
check(
	'the URL follows after a pause',
	s.search.includes('color=FF6347'),
	s.search,
);

// paste anywhere outside a field
await page.evaluate(() => {
	document.activeElement?.blur();
	const data = new DataTransfer();
	data.setData('text/plain', 'rebeccapurple');
	document.body.dispatchEvent(
		new ClipboardEvent('paste', {
			clipboardData: data,
			bubbles: true,
			cancelable: true,
		}),
	);
});
await sleep(100);
s = await state();
check('a pasted colour name is read', s.strip === '#663399', s.strip);
check(
	'open-in follows',
	s.links.every((href) => href.includes('color=663399')),
);

await page.evaluate(() =>
	[...document.querySelectorAll('.canon-palette-card [role="radio"]')]
		.find((b) => b.textContent.trim() === 'Triad')
		.click(),
);
await sleep(100);
s = await state();
check('Triad: three swatches, two marks', s.swatches[0] === 3 && s.marks === 2);

const hue = await page.$('.canon-colour-controls-lit [role="slider"]');
const before = await hue.evaluate((el) => el.getAttribute('aria-valuenow'));
await hue.focus();
await page.keyboard.press('ArrowRight');
await sleep(100);
const after = await hue.evaluate((el) => el.getAttribute('aria-valuenow'));
s = await state();
check('the hue slider takes arrow keys', before !== after, `${before} ${after}`);
check('and moves the colour', s.strip !== '#663399', s.strip);

await page.evaluate(() =>
	document.querySelector('.canon-rows .canon-value-line').click(),
);
await sleep(200);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('a notation line copies', copied === s.values[0], copied);
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (t) => t.style.opacity === '1'),
);

await visit(page, '/tools/colour-atlas?color=ff0000');
s = await state();
check('?color= carries a colour in', s.strip === '#FF0000', s.strip);

await visit(page, '/tools/colour-atlas?atlasColour=rgb(0,128,0)&atlasHarmony=3');
s = await state();
check(
	'launch flags: colour and harmony',
	s.strip === '#008000' && s.harmony === 'Split',
	`${s.strip} ${s.harmony}`,
);

await page.evaluate(() => localStorage.setItem('colour-notation', 'oklch'));
await visit(page, '/tools/colour-atlas');
s = await state();
check(
	'the header notation reaches the strip and the field',
	s.strip.startsWith('oklch(') && s.input.startsWith('oklch('),
	`${s.strip} ${s.input}`,
);
await page.evaluate(() => localStorage.removeItem('colour-notation'));

// phone: stacked, the picture collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/colour-atlas');
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.colour-atlas .canon-split-body');
	const canvas = () =>
		document
			.querySelector('.colour-atlas .canon-canvas')
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
	'the picture collapses to 240 px',
	phone.full > 240 && Math.round(phone.band) === 240,
	`${phone.full} ${phone.band}`,
);
check('no horizontal scroll', !phone.wide);

await page.setViewport({ width: 1400, height: 1000 });
await page.goto(`${BASE}/tools/colour-atlas`, { waitUntil: 'networkidle2' });
await sleep(600);
const field = await page.evaluate(() => {
	const input = document.querySelector('.colour-atlas-input');
	const first = document.querySelector('.canon-split-main > *');
	return {
		first: first?.contains(input),
		height: Math.round(input.getBoundingClientRect().height),
		size: getComputedStyle(input.querySelector('input')).fontSize,
	};
});
check('the colour field opens the settings', field.first);
check(
	'and is large',
	field.height >= 68 && field.size === '36px',
	`${field.height} ${field.size}`,
);

await page.click('.colour-atlas-input input');
await sleep(100);
await page.keyboard.type('#4cb86a');
await sleep(300);
const typed = await page.$eval('.colour-atlas-input input', (el) => el.value);
check('a click selects the value, so typing replaces it', typed === '#4cb86a', typed);


// G4: the solid starts in RGB with the orbit hint, and drifts after 4 s idle
await visit(page, '/tools/colour-atlas');
const axes = () =>
	page.$$eval('.colour-atlas .canon-colour-solid-axis', (labels) =>
		labels.map((l) => l.style.translate).join(),
	);
const start = await page.evaluate(() => ({
	space: document
		.querySelector('.canon-colour-controls [role="radio"][aria-checked="true"]')
		?.textContent.trim(),
	hint: document.querySelector('.colour-atlas .canon-colour-solid-hint')?.textContent.trim(),
}));
check('the solid starts in RGB', start.space === 'RGB', start.space);
check('with the orbit hint', start.hint === 'Drag to orbit', start.hint);
const still = await axes();
await sleep(5500);
check('and drifts after 4 s idle', still !== '' && (await axes()) !== still);

// expanded, the folder tab takes the picture's colour
const tabFill = () =>
	page.evaluate(() => ({
		tab: getComputedStyle(document.querySelector('.dt-tab')).backgroundColor,
		picture: getComputedStyle(
			document.querySelector('.colour-atlas .canon-canvas-content'),
		).backgroundColor,
		sheet: getComputedStyle(document.querySelector('.dt-sheet')).backgroundColor,
	}));
await page.setViewport({ width: 2200, height: 1100 });
await page.evaluate(() =>
	localStorage.setItem('dt-canon-expanded', JSON.stringify(['colour-atlas'])),
);
await visit(page, '/tools/colour-atlas');
let fill = await tabFill();
check('expanded, the tab matches the picture', fill.tab === fill.picture, `${fill.tab} ${fill.picture}`);
await page.evaluate(() => localStorage.setItem('dt-canon-expanded', '[]'));
await visit(page, '/tools/colour-atlas');
fill = await tabFill();
check('in the column, the tab matches the sheet', fill.tab === fill.sheet, `${fill.tab} ${fill.sheet}`);
await page.setViewport({ width: 1400, height: 1000 });

await finish(browser);
