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
		const input = document.querySelector('.tw-input input');
		return {
			input: input.value,
			invalid: input.getAttribute('aria-invalid'),
			ramp: text('.tw-ramp-reading'),
			columns: document.querySelectorAll('.tw-ramp-column').length,
			first: getComputedStyle(document.querySelector('.tw-ramp-column'))
				.backgroundColor,
			tag: text('.tw-ramp-tag'),
			mode: text('.tailwind-shades [role="radio"][aria-checked="true"]'),
			description: text('.tw-description'),
			name: document.querySelector('.tw-name').value,
			lines: [
				...document.querySelectorAll(
					'.tailwind-shades .canon-split-main .canon-value-line',
				),
			].map((l) => [
				l.querySelector('.canon-value-line-label').textContent.trim(),
				l.querySelector('.canon-value-line-value').textContent.trim(),
			]),
			blocks: [...document.querySelectorAll('.canon-code-block')].map(
				(b) => b.textContent,
			),
		};
	});

const type = async (selector, text) => {
	const input = await page.$(selector);
	await input.focus();
	await sleep(50);
	await input.evaluate((el) => el.select());
	await input.type(text);
	await sleep(150);
};

await visit(page, '/tools/tailwind-shades');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.tailwind-shades').getBoundingClientRect()
				.height,
	),
);
let s = await state();
check('starts at #3B82F6, Classic', s.input === '#3B82F6' && s.mode === 'Classic', `${s.input} ${s.mode}`);
check('eleven columns and lines, 50 to 950', s.columns === 11 && s.lines.length === 11 && s.lines[0][0] === '50' && s.lines[10][0] === '950', `${s.columns} ${s.lines.length}`);
check('the ramp places the base', /^Base ≈ \d+, #3B82F6$/.test(s.ramp) && s.tag.startsWith('Base ≈'), s.ramp);
check('the web mode description shows', s.description === 'Standard Tailwind-style generation with uniform hue', s.description);
check('three code blocks, named primary', s.blocks.length === 3 && s.blocks.every((b) => b.includes('primary')), `${s.blocks.length}`);
check('the OKLCH block', s.blocks[1].includes('--primary-500: oklch('), s.blocks[1].slice(0, 80));
check('the Tailwind config', s.blocks[2].includes("primary: {") && s.blocks[2].includes("500: '#"), s.blocks[2].slice(0, 60));

await type('.tw-input input', '#e11d48');
s = await state();
check('typing is live', s.ramp.endsWith('#E11D48'), s.ramp);
await type('.tw-input input', 'tomato');
s = await state();
check('CSS names read', s.ramp.endsWith('#FF6347'), s.ramp);
await type('.tw-input input', 'nonsense');
await sleep(600);
s = await state();
check('an unreadable colour turns the field red', s.invalid === 'true');
check('and keeps the last colour', s.ramp.endsWith('#FF6347'));

await type('.tw-name', 'Brand Ink!');
s = await state();
check('the name keeps CSS characters only', s.name === 'brandink', s.name);
check('and reaches the blocks', s.blocks[0].includes('--brandink-50:'), s.blocks[0].slice(0, 40));

await page.evaluate(() =>
	[...document.querySelectorAll('.tailwind-shades [role="radio"]')]
		.find((b) => b.textContent.trim() === 'Muted')
		.click(),
);
await sleep(100);
const muted = await state();
check('Muted changes the shades and the description', muted.lines[5][1] !== s.lines[5][1] && muted.description === 'Subtle, desaturated tones throughout', `${muted.lines[5][1]} ${muted.description}`);

await page.evaluate(() =>
	document.querySelector('.tailwind-shades .canon-split-main .canon-value-line').click(),
);
await sleep(200);
const copied = await page.evaluate(() => navigator.clipboard.readText());
s = await state();
check('a shade line copies', copied === s.lines[0][1], copied);
check('and the toast shows', await page.$eval('.canon-toast', (t) => t.style.opacity === '1'));

await visit(page, '/tools/tailwind-shades?color=ff0000');
s = await state();
check('?color= carries a colour in', s.input === '#FF0000', s.input);
await visit(page, '/tools/tailwind-shades?tailwindColour=rgb(0,128,0)&tailwindMode=3');
s = await state();
check('launch flags: colour and mode', s.input === '#008000' && s.mode === 'Vivid', `${s.input} ${s.mode}`);

await page.evaluate(() => localStorage.setItem('colour-notation', 'oklch'));
await visit(page, '/tools/tailwind-shades');
s = await state();
check('the header notation reaches the field, lines and blocks', s.input.startsWith('oklch(') && s.lines[0][1].startsWith('oklch(') && s.blocks[0].includes('oklch('), `${s.input} ${s.lines[0][1]}`);
await page.evaluate(() => localStorage.removeItem('colour-notation'));

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/tailwind-shades');
const phone = await page.evaluate(() => ({
	wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
	hexes: getComputedStyle(document.querySelector('.tw-ramp-hex')).display,
}));
check('no horizontal scroll', !phone.wide);
check('narrow columns hide the hexes', phone.hexes === 'none', phone.hexes);

await page.setViewport({ width: 1400, height: 1000 });
await visit(page, '/tools/tailwind-shades');
const field = await page.evaluate(() => {
	const input = document.querySelector('.tw-input');
	const first = document.querySelector('.canon-split-sidebar > *');
	return {
		first: first?.contains(input),
		height: Math.round(input.getBoundingClientRect().height),
		size: getComputedStyle(input.querySelector('input')).fontSize,
		hexes: getComputedStyle(document.querySelector('.tw-ramp-hex')).display,
	};
});
check('the colour field opens the settings', field.first);
check('and is large', field.height >= 68 && field.size === '36px', `${field.height} ${field.size}`);
check('wide columns show the hexes', field.hexes === 'block', field.hexes);
await page.click('.tw-input input');
await sleep(100);
await page.keyboard.type('#4cb86a');
await sleep(300);
const typed = await page.$eval('.tw-input input', (el) => el.value);
check('a click selects the value, so typing replaces it', typed === '#4cb86a', typed);

await finish(browser);
