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
		const input = document.querySelector('.cc-input input');
		const lines = Object.fromEntries(
			[
				...document.querySelectorAll(
					'.colour-converter .canon-split-main .canon-value-line',
				),
			].map((line) => [
				line
					.querySelector('.canon-value-line-label')
					.textContent.trim(),
				line
					.querySelector('.canon-value-line-value')
					.textContent.trim(),
			]),
		);
		return {
			strip: text('.canon-colour-strip-value'),
			input: input.value,
			placeholder: input.placeholder,
			invalid: input.getAttribute('aria-invalid'),
			lines,
			space: text(
				'.canon-colour-controls [role="radio"][aria-checked="true"]',
			),
			ribbons: document.querySelectorAll('.cc-ribbons').length,
			sliders: document.querySelectorAll('.cc-ribbon[role="slider"]')
				.length,
			lit: [...document.querySelectorAll('.cc-ribbon-letter--lit')].map(
				(l) => l.textContent.trim(),
			),
		};
	});

const type = async (text) => {
	const input = await page.$('.cc-input input');
	await input.focus();
	// the field selects itself on the next frame
	await sleep(50);
	await input.evaluate((el) => el.select());
	await input.type(text);
	await sleep(120);
};

await visit(page, '/tools/colour-converter');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.colour-converter').getBoundingClientRect()
				.height,
	),
);
let s = await state();
check('starts at #3B82F6 in RGB', s.strip === '#3B82F6' && s.space === 'RGB', `${s.strip} ${s.space}`);
check('the field shows the space notation', s.input === 'rgb(59, 130, 246)', s.input);
check('the placeholder is the space example', s.placeholder === '59 130 246', s.placeholder);
check(
	'every web format is listed',
	['HEX', 'RGB', 'Decimal RGB', 'HSL', 'LAB', 'LCH', 'OKLAB', 'OKLCH'].every(
		(label) => label in s.lines,
	),
	Object.keys(s.lines).join(','),
);
check(
	'with the web decimals',
	s.lines.HEX === '#3B82F6' &&
		s.lines.RGB === 'rgb(59, 130, 246)' &&
		s.lines['Decimal RGB'] === 'rgb(0.2314, 0.5098, 0.9647)' &&
		s.lines.HSL === 'hsl(217.2, 91.2%, 59.8%)',
	JSON.stringify(s.lines),
);
check('HSB and CMYK too, and a name', !!s.lines.HSB && !!s.lines.CMYK && !!s.lines.Name, `${s.lines.HSB} ${s.lines.CMYK} ${s.lines.Name}`);
check('a ribbon set per space', s.ribbons === 8, `${s.ribbons}`);
check('25 ribbon sliders', s.sliders === 25, `${s.sliders}`);
check('the sliced channel is lit', s.lit.join() === 'B', s.lit.join());

await type('#ff0000');
s = await state();
check('typing is live', s.strip === '#FF0000', s.strip);
check('the typed text stays while focused', s.input === '#ff0000', s.input);

await type('0, 128, 0');
s = await state();
check('bare numbers read in the space', s.strip === '#008000', s.strip);
await type('0.2314, 0.5098, 0.9647');
s = await state();
check('decimal rgb reads as rgb', s.strip === '#3B82F6', s.strip);
await type('hsl(30 100% 50%)');
s = await state();
check('any functional notation reads', s.strip === '#FF8000', s.strip);
await type('tomato');
s = await state();
check('CSS colour names read', s.strip === '#FF6347', s.strip);
await type('nonsense');
await sleep(600);
s = await state();
check('an unreadable colour turns the field red', s.invalid === 'true');
check('and keeps the last colour', s.strip === '#FF6347', s.strip);

// the space picker is the web's format picker: it reads and rewrites the field
await page.evaluate(() => document.activeElement?.blur());
await page.evaluate(() =>
	[...document.querySelectorAll('.canon-colour-controls [role="radio"]')]
		.find((b) => b.textContent.trim() === 'HSL')
		.click(),
);
await sleep(200);
s = await state();
check('a new space rewrites the field', s.input.startsWith('hsl('), s.input);
check('and keeps the colour', s.strip === '#FF6347', s.strip);
await type('120 100 25');
s = await state();
check('bare numbers now read as HSL', s.strip === '#008000', s.strip);

// a ribbon takes the keys and a press
await page.evaluate(() => {
	const ribbon = document.querySelector('.cc-ribbon[aria-label="RGB Red"]');
	ribbon.focus();
});
await page.keyboard.press('End');
await sleep(150);
s = await state();
check('End on the red ribbon maxes red', s.lines.RGB === 'rgb(255, 128, 0)', s.lines.RGB);
await page.keyboard.press('Home');
await sleep(150);
s = await state();
check('Home zeroes it', s.lines.RGB === 'rgb(0, 128, 0)', s.lines.RGB);
const box = await page.$eval('.cc-ribbon[aria-label="RGB Blue"]', (el) => {
	const r = el.getBoundingClientRect();
	return { x: r.left + r.width, y: r.top + r.height / 2 };
});
await page.mouse.click(box.x - 1, box.y);
await sleep(400);
s = await state();
check('a press at the end of blue sets blue', /rgb\(0, 12[78], 25[45]\)/.test(s.lines.RGB), s.lines.RGB);

const hue = await page.$('.canon-colour-controls-lit [role="slider"]');
const before = (await state()).strip;
await hue.focus();
await page.keyboard.press('ArrowRight');
await sleep(150);
check('the sliders take arrow keys', (await state()).strip !== before);

await page.evaluate(() =>
	document.querySelector('.colour-converter .canon-split-main .canon-value-line').click(),
);
await sleep(200);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('a value line copies', copied === (await state()).lines.Name, copied);
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (t) => t.style.opacity === '1'),
);

await visit(page, '/tools/colour-converter?color=2e7d32');
s = await state();
check('?color= carries a colour in', s.strip === '#2E7D32', s.strip);

await visit(page, '/tools/colour-converter?converterColour=oklch(0.7%200.1%2030)&converterSpace=3');
s = await state();
check(
	'launch flags: colour and space',
	s.space === 'OKLCH' && s.input.startsWith('oklch(0.7000 0.1000 30.0'),
	`${s.space} ${s.input}`,
);

// phone: stacked, the picture collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/colour-converter');
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.colour-converter .canon-split-body');
	const canvas = () =>
		document
			.querySelector('.colour-converter .canon-canvas')
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
await visit(page, '/tools/colour-converter');
const field = await page.evaluate(() => {
	const input = document.querySelector('.cc-input');
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
await page.click('.cc-input input');
await sleep(100);
await page.keyboard.type('#4cb86a');
await sleep(300);
const typed = await page.$eval('.cc-input input', (el) => el.value);
check('a click selects the value, so typing replaces it', typed === '#4cb86a', typed);


// the converted values come first, above the fold
const fold = () =>
	page.evaluate(() => {
		const body = document
			.querySelector('.colour-converter .canon-split-body')
			.getBoundingClientRect();
		const shown = [
			...document.querySelectorAll('.colour-converter .canon-split-main .canon-value-line'),
		]
			.filter((line) => {
				const box = line.getBoundingClientRect();
				return box.top >= body.top && box.bottom <= body.bottom;
			})
			.map((line) => line.querySelector('.canon-value-line-label').textContent.trim());
		const main = [...document.querySelector('.colour-converter .canon-split-main').children];
		const formats = main.findIndex((el) => el.textContent.includes('All Formats'));
		const controls = main.findIndex((el) => el.querySelector('.canon-colour-controls'));
		return { shown, formatsFirst: formats === 1 && controls > formats };
	});
await page.setViewport({ width: 1400, height: 1000 });
await visit(page, '/tools/colour-converter');
let seen = await fold();
check('the formats follow the field, the controls after', seen.formatsFirst);
check('1400 x 1000: every format is above the fold', seen.shown.length === 11, seen.shown.join(','));
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/colour-converter');
seen = await fold();
check(
	'390 x 844: the sRGB formats are above the fold',
	['HEX', 'RGB', 'Decimal RGB', 'HSL', 'HSB'].every((l) => seen.shown.includes(l)),
	seen.shown.join(','),
);

// it expands like the other cube tools
await page.setViewport({ width: 2200, height: 1100 });
await page.evaluate(() => localStorage.setItem('dt-canon-expanded', '[]'));
await visit(page, '/tools/colour-converter');
await page.click('.dt-canon-edge.is-start');
await sleep(500);
const wide = await page.evaluate(() => ({
	expandable: !!document.querySelector('.dt-canon-tool.is-expandable.is-expanded'),
	picture: document.querySelector('.colour-converter .canon-split-sidebar').getBoundingClientRect().width,
	settings: document.querySelector('.colour-converter .canon-split-main').getBoundingClientRect().width,
}));
check(
	'the edge chevron stretches the picture, the settings keep 600 px',
	wide.expandable && wide.picture > 900 && Math.round(wide.settings) === 600,
	`${wide.picture} ${wide.settings}`,
);
await page.evaluate(() => localStorage.setItem('dt-canon-expanded', '[]'));

// all spaces at once: eight solids, one webgl context each, released on the way back
await page.setViewport({ width: 1400, height: 1000 });
await visit(page, '/tools/colour-converter');
const solids = () =>
	page.evaluate(() => ({
		count: document.querySelectorAll('.colour-converter .canon-colour-solid').length,
		gl: document.querySelectorAll('.colour-converter .canon-colour-solid[data-gl="ready"]').length,
		labels: [...document.querySelectorAll('.cc-cell-label')].map((l) => l.textContent.trim()),
		current: document.querySelector('.cc-cell--current .cc-cell-label')?.textContent.trim(),
		pressed: document.querySelector('.cc-grid-toggle').getAttribute('aria-pressed'),
		name: document.querySelector('.cc-grid-toggle').getAttribute('aria-label'),
	}));
let grid = await solids();
check('one solid by default', grid.count === 1 && grid.pressed === 'false', `${grid.count} ${grid.pressed}`);
check('the toggle is named', grid.name === 'All spaces', grid.name);
await page.click('.cc-grid-toggle');
await sleep(300);
grid = await solids();
check('the toggle shows a solid per space', grid.count === 8 && grid.gl === 8 && grid.pressed === 'true', `${grid.count} ${grid.gl}`);
check(
	'each cell names its space, the current one marked',
	grid.labels.join() === 'RGB,HSL,HSB,OKLCH,OKLab,LCH,Lab,CMYK' && grid.current === 'RGB',
	`${grid.labels.join()} ${grid.current}`,
);
const marks = await page.$$eval('.cc-cell .canon-colour-solid-marker--pick', (m) => m.filter((x) => !x.hidden).length);
check('every cell marks the colour', marks === 8, `${marks}`);
const unpicked = (await state()).strip;
const cell = await page.$eval('.cc-cell:nth-child(1) .canon-colour-solid', (el) => {
	const r = el.getBoundingClientRect();
	return { x: r.left + r.width * 0.45, y: r.top + r.height * 0.6 };
});
await page.mouse.click(cell.x, cell.y);
await sleep(300);
check('a press on a cell picks there', (await state()).strip !== unpicked, `${unpicked} -> ${(await state()).strip}`);
await page.click('.cc-grid-toggle');
await sleep(300);
grid = await solids();
check('and back to the one solid', grid.count === 1 && grid.pressed === 'false', `${grid.count}`);
await visit(page, '/tools/colour-converter?converterGrid=1');
check('?converterGrid opens the grid', (await solids()).count === 8);

// G4: the solid starts in RGB with the orbit hint, and drifts after 4 s idle
await visit(page, '/tools/colour-converter');
const axes = () =>
	page.$$eval('.colour-converter .canon-colour-solid-axis', (labels) =>
		labels.map((l) => l.style.translate).join(),
	);
const start = await page.evaluate(() => ({
	space: document
		.querySelector('.canon-colour-controls [role="radio"][aria-checked="true"]')
		?.textContent.trim(),
	hint: document.querySelector('.colour-converter .canon-colour-solid-hint')?.textContent.trim(),
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
			document.querySelector('.colour-converter .canon-canvas-content'),
		).backgroundColor,
		sheet: getComputedStyle(document.querySelector('.dt-sheet')).backgroundColor,
	}));
await page.setViewport({ width: 2200, height: 1100 });
await page.evaluate(() =>
	localStorage.setItem('dt-canon-expanded', JSON.stringify(['colour-converter'])),
);
await visit(page, '/tools/colour-converter');
let fill = await tabFill();
check('expanded, the tab matches the picture', fill.tab === fill.picture, `${fill.tab} ${fill.picture}`);
await page.evaluate(() => localStorage.setItem('dt-canon-expanded', '[]'));
await visit(page, '/tools/colour-converter');
fill = await tabFill();
check('in the column, the tab matches the sheet', fill.tab === fill.sheet, `${fill.tab} ${fill.sheet}`);
await page.setViewport({ width: 1400, height: 1000 });

await finish(browser);
