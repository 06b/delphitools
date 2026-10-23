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
		const input = document.querySelector('.hg-input input');
		const disc = document.querySelector('.hg-wheel-control');
		return {
			input: input.value,
			invalid: input.getAttribute('aria-invalid'),
			hue: disc.getAttribute('aria-valuenow'),
			figure: text('.hg-wheel-figure'),
			beads: document.querySelectorAll('.hg-wheel-bead').length,
			strip: [
				...document.querySelectorAll('.canon-colour-strip .canon-swatch'),
			].map((s) => s.textContent.trim()),
			swatches: document.querySelectorAll('.canon-palette-card-swatch')
				.length,
			mode: text('.canon-palette-card [role="radio"][aria-checked="true"]'),
			space: text('.harmony-genny .canon-row [role="radio"][aria-checked="true"]'),
			description: text('.hg-description'),
			lines: [
				...document.querySelectorAll(
					'.harmony-genny .canon-split-main .canon-rows .canon-value-line',
				),
			].map((l) => [
				l.querySelector('.canon-value-line-label').textContent.trim(),
				l.querySelector('.canon-value-line-value').textContent.trim(),
			]),
			css: text('.canon-code-block code, .canon-code-block pre'),
		};
	});

const type = async (text) => {
	const input = await page.$('.hg-input input');
	await input.focus();
	await sleep(50);
	await input.evaluate((el) => el.select());
	await input.type(text);
	await sleep(150);
};

const pickMode = (title) =>
	page.evaluate(
		(t) =>
			[...document.querySelectorAll('.canon-palette-card [role="radio"]')]
				.find((b) => b.textContent.trim() === t)
				.click(),
		title,
	);

await visit(page, '/tools/harmony-genny');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.harmony-genny').getBoundingClientRect()
				.height,
	),
);
let s = await state();
check('starts at #3B82F6, Complementary, OKLCH', s.input === '#3B82F6' && s.mode === 'Complementary' && s.space === 'OKLCH', `${s.input} ${s.mode} ${s.space}`);
check('two beads, two swatches, two lines', s.beads === 2 && s.swatches === 2 && s.lines.length === 2, `${s.beads} ${s.swatches} ${s.lines.length}`);
check('the strip shows the harmony', s.strip.length === 2 && s.strip[0] === '#3B82F6', s.strip.join());
check('lines label Base and +180°', s.lines[0][0] === 'Base' && s.lines[1][0] === '+180°', s.lines.map((l) => l[0]).join());
check('the web description shows', s.description === 'Two colours opposite on the colour wheel', s.description);
check('the CSS block lists the colours', s.css.includes('--harmony-2:'), s.css);
check('the wheel reads its hue', s.figure === `${s.hue}°`, `${s.figure} ${s.hue}`);

await pickMode('Pentadic');
await sleep(100);
s = await state();
check('Pentadic: five beads and swatches', s.beads === 5 && s.swatches === 5, `${s.beads} ${s.swatches}`);
await pickMode('Monochromatic');
await sleep(100);
s = await state();
check('Monochromatic labels lightness', s.lines[0][0].startsWith('L ') && s.lines[2][0] === 'Base', s.lines.map((l) => l[0]).join());
await pickMode('Triadic');
await sleep(100);

await type('#ff0000');
s = await state();
check('typing is live', s.lines[0][1] === '#FF0000', s.lines[0][1]);
await type('tomato');
s = await state();
check('CSS names read', s.lines[0][1] === '#FF6347', s.lines[0][1]);
await type('nonsense');
await sleep(600);
s = await state();
check('an unreadable colour turns the field red', s.invalid === 'true');
check('and keeps the last colour', s.lines[0][1] === '#FF6347');

const before = (await state()).hue;
await page.focus('.hg-wheel-control');
await page.keyboard.press('ArrowRight');
await sleep(100);
s = await state();
check('the wheel takes arrow keys', Number(s.hue) === (Number(before) + 1) % 360, `${before} ${s.hue}`);
await page.keyboard.press('PageUp');
await sleep(100);
s = await state();
check('Page keys step a notch', Number(s.hue) % 15 === 0, s.hue);

// a drag on the plane turns the rule
const disc = await page.$eval('.hg-wheel-disc', (el) => {
	const r = el.getBoundingClientRect();
	return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
});
const hueBefore = Number((await state()).hue);
await page.mouse.move(disc.x, disc.y - disc.w * 0.3);
await page.mouse.down();
await page.mouse.move(disc.x + disc.w * 0.3, disc.y, { steps: 6 });
await page.mouse.up();
await sleep(100);
s = await state();
check(
	'a quarter-turn drag turns the hue by 90°',
	Math.abs(((Number(s.hue) - hueBefore + 360) % 360) - 90) <= 2,
	`${hueBefore} -> ${s.hue}`,
);

await page.evaluate(() =>
	[...document.querySelectorAll('.harmony-genny .canon-row [role="radio"]')]
		.find((b) => b.textContent.trim() === 'HSL')
		.click(),
);
await sleep(100);
s = await state();
check('HSL calls the second slider Saturation', await page.evaluate(() => [...document.querySelectorAll('.harmony-genny .canon-row')].some((r) => r.textContent.includes('Saturation'))));

const slider = await page.evaluateHandle(() =>
	[...document.querySelectorAll('.harmony-genny .canon-split-main [role="slider"]')].at(-1),
);
const sliderBefore = await slider.evaluate((el) => el.getAttribute('aria-valuenow'));
await slider.focus();
await page.keyboard.press('ArrowRight');
await sleep(100);
check('the hue slider takes arrow keys', (await slider.evaluate((el) => el.getAttribute('aria-valuenow'))) !== sliderBefore);

await page.evaluate(() =>
	[...document.querySelectorAll('.canon-palette-card .canon-button')]
		.find((b) => b.textContent.includes('Copy All'))
		.click(),
);
await sleep(200);
const copied = await page.evaluate(() => navigator.clipboard.readText());
s = await state();
check('Copy All copies the list', copied === s.lines.map((l) => l[1]).join(', '), copied);
check('and the toast shows', await page.$eval('.canon-toast', (t) => t.style.opacity === '1'));

await visit(page, '/tools/harmony-genny?color=ff0000');
s = await state();
check('?color= carries a colour in', s.input === '#FF0000', s.input);

await visit(page, '/tools/harmony-genny?harmonyColour=rgb(0,128,0)&harmonyMode=2&harmonySpace=1');
s = await state();
check('launch flags: colour, mode and space', s.input === '#008000' && s.mode === 'Triadic' && s.space === 'LCH', `${s.input} ${s.mode} ${s.space}`);

await page.evaluate(() => localStorage.setItem('colour-notation', 'oklch'));
await visit(page, '/tools/harmony-genny');
s = await state();
check('the header notation reaches the field, lines and CSS', s.input.startsWith('oklch(') && s.lines[0][1].startsWith('oklch(') && s.css.includes('oklch('), `${s.input} ${s.lines[0][1]}`);
await page.evaluate(() => localStorage.removeItem('colour-notation'));

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/harmony-genny');
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.harmony-genny .canon-split-body');
	const canvas = () =>
		document.querySelector('.harmony-genny .canon-canvas').getBoundingClientRect().height;
	const full = canvas();
	body.scrollTop = 800;
	await new Promise((r) => setTimeout(r, 200));
	return {
		full,
		band: canvas(),
		wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
	};
});
check('the picture collapses to 240 px', phone.full > 240 && Math.round(phone.band) === 240, `${phone.full} ${phone.band}`);
check('no horizontal scroll', !phone.wide);

await page.setViewport({ width: 1400, height: 1000 });
await visit(page, '/tools/harmony-genny');
const field = await page.evaluate(() => {
	const input = document.querySelector('.hg-input');
	const first = document.querySelector('.canon-split-main > *');
	return {
		first: first?.contains(input),
		height: Math.round(input.getBoundingClientRect().height),
		size: getComputedStyle(input.querySelector('input')).fontSize,
	};
});
check('the colour field opens the settings', field.first);
check('and is large', field.height >= 68 && field.size === '36px', `${field.height} ${field.size}`);
await page.click('.hg-input input');
await sleep(100);
await page.keyboard.type('#4cb86a');
await sleep(300);
const typed = await page.$eval('.hg-input input', (el) => el.value);
check('a click selects the value, so typing replaces it', typed === '#4cb86a', typed);

// the plane paints at CSS size x device pixel ratio, again on resize and ratio change
const backing = () =>
	page.$eval('.hg-wheel-plane', (c) => ({
		width: c.width,
		height: c.height,
		css: c.clientWidth,
		ratio: devicePixelRatio,
	}));
const sharp = (b) => b.width === Math.round(b.css * b.ratio) && b.height === b.width;
await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 2 });
await visit(page, '/tools/harmony-genny');
await sleep(300);
const plane = await backing();
check('DPR 2: backing = CSS size x 2', plane.ratio === 2 && sharp(plane), JSON.stringify(plane));
await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 2 });
await sleep(400);
const smaller = await backing();
check('a resize repaints at the new size', smaller.css !== plane.css && sharp(smaller), JSON.stringify(smaller));
// ponytail: emulated DPR changes dispatch no matchMedia change event in headless Chrome, so the ratio listener is untested here

await finish(browser);
