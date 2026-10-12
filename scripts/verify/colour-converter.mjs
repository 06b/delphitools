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

await finish(browser);
