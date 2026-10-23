// the canon palette-genny: reels, locking, count, category and strategy, widen, edit, menu, export

import { BASE, launch, visit, check, sleep, finish } from './harness.mjs';

// descriptions from app/lib/palette-strategies.ts
const DESCRIPTIONS = {
	'random-cohesive': 'Random cohesive palette',
	analogous: 'Adjacent hues on the colour wheel',
	monochromatic: 'Single hue, varied lightness',
};

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);
await page.evaluateOnNewDocument(() =>
	localStorage.setItem('colour-notation', 'hex'),
);
const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

const state = () =>
	page.evaluate(() => {
		const all = (sel) => [...document.querySelectorAll(sel)];
		const text = (el) => el?.textContent.replace(/\s+/g, ' ').trim() ?? '';
		const pressed = (sel) =>
			text(document.querySelector(`${sel} [aria-pressed="true"], ${sel} .canon-button--selected, ${sel} [aria-checked="true"]`));
		return {
			fills: all('.pg-col').map((el) => el.style.backgroundColor),
			values: all('.pg-col-value').map(text),
			names: all('.pg-col-name').map(text),
			rows: all('.pg-row').length,
			rowValues: all('.pg-row-value').map((el) => text(el.querySelector('.canon-value-line-value') ?? el)),
			locks: all('.pg-col-lamp').map((el) => el.getAttribute('aria-pressed')),
			rowLocks: all('.pg-row-lock').map((el) => el.getAttribute('aria-pressed')),
			reels: all('.pg-reel').length,
			wide: all('.pg-col-widen').map((el) => el.getAttribute('aria-pressed')),
			info: all('.pg-info-line').length,
			contrasts: all('.pg-info-contrast').length,
			count: document.querySelector('.pg-count input')?.value,
			category: pressed('.pg-categories'),
			strategy: pressed('.pg-strategies'),
			strategies: all('.pg-strategies button').map(text),
			description: text(document.querySelector('.pg-description')),
			css: text(document.querySelector('.pg-css')),
			shades: all('.pg-row-shades').map((a) => a.getAttribute('href')),
		};
	});

await visit(page, '/tools/palette-genny');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.palette-genny').getBoundingClientRect()
				.height,
	),
);
let s = await state();
check('five columns by default', s.fills.length === 5, `${s.fills.length}`);
check('the list mirrors the columns', s.rows === 5 && s.rowValues.join() === s.values.join(), s.rowValues.join(' '));
check('values read as hex', s.values.every((v) => /^#[\da-f]{6}$/i.test(v)), s.values.join(' '));
check('every column is named', s.names.length === 5 && s.names.every((n) => n.length > 0));
check('opens on Random, Random', s.category === 'Random' && s.strategy === 'Random', `${s.category} / ${s.strategy}`);
check('with its description', s.description === DESCRIPTIONS['random-cohesive'], s.description);
check('the CSS block carries every colour', s.values.every((v) => s.css.includes(v)));
check('each row links to Tailwind shades', s.shades.length === 5 && s.shades.every((h) => h.includes('tailwind-shades')));

await page.click('.pg-regenerate');
await sleep(150);
check('Regenerate spins the unlocked columns', (await state()).reels === 5, `${(await state()).reels} reels`);
await sleep(1200);
const generated = await state();
check('and replaces the palette', generated.values.join() !== s.values.join(), generated.values.join(' '));
check('keeping the count', generated.values.length === 5);
check('the reels are gone once landed', generated.reels === 0);

await page.click('.pg-col-lamp');
await sleep(250);
s = await state();
check('the lamp locks its column', s.locks[0] === 'true');
check('and the list shows it', s.rowLocks[0] === 'true');
const kept = s.values[0];
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('Space');
await sleep(150);
check('Space regenerates, the locked column holds still', (await state()).reels === 4);
await sleep(1200);
s = await state();
check('a locked colour survives', s.values[0] === kept, `${kept} -> ${s.values[0]}`);
check('the rest change', s.values.slice(1).join() !== generated.values.slice(1).join());
await page.click('.pg-row-lock');
await sleep(250);
check('the list unlocks it too', (await state()).locks[0] === 'false');

await page.click('.pg-count button:last-of-type');
await sleep(300);
s = await state();
check('plus adds a column', s.fills.length === 6 && s.count === '6', `${s.fills.length} ${s.count}`);
await page.click('.pg-count button:first-of-type');
await sleep(300);
check('minus takes it back', (await state()).fills.length === 5);

const before = (await state()).values;
await page.evaluate(() =>
	[...document.querySelectorAll('.pg-categories button')]
		.find((b) => b.textContent.trim() === 'Theory')
		.click(),
);
await sleep(1300);
s = await state();
check('a category picks its first strategy', s.category === 'Theory' && s.strategy === 'Analogous', `${s.category} / ${s.strategy}`);
check('and lists its strategies', s.strategies.join() === 'Analogous,Complementary,Triadic,Split-Comp,Tetradic,Mono', s.strategies.join());
check('the description follows', s.description === DESCRIPTIONS.analogous, s.description);
check('and the palette regenerates', s.values.join() !== before.join());
await page.evaluate(() =>
	[...document.querySelectorAll('.pg-strategies button')]
		.find((b) => b.textContent.trim() === 'Mono')
		.click(),
);
await sleep(1300);
s = await state();
check('a strategy is picked', s.strategy === 'Mono' && s.description === DESCRIPTIONS.monochromatic, s.strategy);

await page.click('.pg-col:nth-child(2) .pg-col-widen');
await sleep(700);
s = await state();
check('a tap widens the column', s.wide[1] === 'true');
check('to its values and contrast', s.info === 5 && s.contrasts === 2, `${s.info} ${s.contrasts}`);
await page.click('.pg-info-line:nth-child(2)');
await sleep(300);
check('an info line copies its value', /^rgb\(/.test(await clipboard()), await clipboard());
// the info covers the middle of a widened column; a tap above it narrows
const top = await page.$eval('.pg-col:nth-child(2)', (el) => {
	const r = el.getBoundingClientRect();
	return { x: r.x + r.width / 2, y: r.y + 30 };
});
await page.mouse.click(top.x, top.y);
await sleep(700);
check('a second tap narrows it', (await state()).wide.every((w) => w === 'false'));

// a press in the middle, between the info lines, narrows it too, animated
const colWidths = () =>
	page.$$eval('.pg-col', (cols) => cols.map((c) => c.getBoundingClientRect().width));
await page.click('.pg-col:nth-child(2) .pg-col-widen');
await sleep(700);
const opened = await colWidths();
const middle = await page.$eval('.pg-col:nth-child(2)', (el) => {
	const r = el.getBoundingClientRect();
	return { x: r.x + r.width / 2, y: r.y + r.height * 0.55 };
});
const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, middle);
check('the middle of a widened column is the narrow target', hit === 'pg-col-widen', hit);
await page.mouse.click(middle.x, middle.y);
await sleep(250);
const midway = await colWidths();
await sleep(600);
const closed = await colWidths();
check('a press in the middle narrows it', (await state()).wide.every((w) => w === 'false'));
check(
	'narrowing animates back to equal columns',
	midway[1] < opened[1] - 4 && midway[1] > closed[1] + 4 && Math.max(...closed) - Math.min(...closed) < 2,
	`${Math.round(opened[1])} ${Math.round(midway[1])} ${Math.round(closed[1])}`,
);
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await page.click('.pg-col:nth-child(2) .pg-col-widen');
await sleep(50);
await page.mouse.click(middle.x, middle.y);
await sleep(50);
const still = await colWidths();
check('reduced motion: narrows at once', Math.max(...still) - Math.min(...still) < 2, still.map(Math.round).join());
await page.emulateMediaFeatures([]);

// G2: the reels do not scroll, so the wheel over them scrolls the page
const scrollers = ['.dt-main', '.palette-genny .canon-split-main', '.palette-genny .canon-split-body'];
const scrolled = () =>
	page.evaluate(
		(qs) => qs.map((q) => document.querySelector(q)?.scrollTop ?? 0).reduce((a, b) => a + b, 0),
		scrollers,
	);
const reelsAt = await page.$eval('.pg-reels', (el) => {
	const r = el.getBoundingClientRect();
	return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const scrollBefore = await scrolled();
await page.mouse.move(reelsAt.x, reelsAt.y);
await page.mouse.wheel({ deltaY: 300 });
await sleep(400);
const scrollAfter = await scrolled();
check('the wheel over the reels scrolls the page', scrollAfter > scrollBefore, `${scrollBefore} -> ${scrollAfter}`);
await page.evaluate(
	(qs) =>
		qs.forEach((q) => {
			const e = document.querySelector(q);
			if (e) e.scrollTop = 0;
		}),
	scrollers,
);

await page.evaluate(() => {
	const input = document.querySelectorAll('.pg-col-picker')[2];
	input.value = '#123456';
	input.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(400);
s = await state();
check('the picker edits the colour', s.values[2] === '#123456' && s.rowValues[2] === '#123456', s.values[2]);
check('and a picked colour locks', s.locks[2] === 'true');

const box = await page.$eval('.pg-col:nth-child(4)', (el) => {
	const r = el.getBoundingClientRect();
	return { x: r.x + r.width / 2, y: r.y + r.height / 3 };
});
await page.mouse.click(box.x, box.y, { button: 'right' });
await sleep(400);
const items = await page.$$eval('[role="menuitem"]', (els) =>
	els.filter((el) => el.checkVisibility()).map((el) => el.textContent.trim()),
);
check('a secondary click opens the column menu', items.join() === 'Copy,Edit colour,Lock,Remove', items.join());
const fourth = (await state()).values[3];
await page.evaluate(() =>
	[...document.querySelectorAll('[role="menuitem"]')]
		.find((el) => el.checkVisibility() && el.textContent.trim() === 'Remove')
		.click(),
);
await sleep(400);
s = await state();
check('Remove takes the column out', s.fills.length === 4 && !s.values.includes(fourth), s.values.join(' '));

await page.click('.pg-row-value');
await sleep(300);
check('a list value copies', (await clipboard()) === s.values[0], await clipboard());
await page.click('.pg-copy-all');
await sleep(300);
check('Copy Colours copies the list', (await clipboard()) === s.values.join(', '), await clipboard());
await page.click('.pg-json');
await sleep(300);
check('JSON copies an array', JSON.parse(await clipboard()).join() === s.values.join());

await page.click('.pg-row-remove');
await page.click('.pg-row-remove');
await sleep(300);
s = await state();
check('rows remove down to two', s.fills.length === 2);
check('then Remove is disabled', await page.$eval('.pg-row-remove', (el) => el.disabled));

// notation
await page.click('.dt-notation-trigger');
await sleep(250);
await page.evaluate(() =>
	[...document.querySelectorAll('.dt-notation-option')]
		.find((el) => el.textContent.trim() === 'OKLCH')
		.click(),
);
await sleep(400);
s = await state();
check('columns and list follow the header notation', [...s.values, ...s.rowValues].every((v) => v.startsWith('oklch(')), s.values[0]);
check('and the CSS block too', s.css.includes('--palette-1: oklch('));

// launch flags
await visit(page, '/tools/palette-genny?gennyStrategy=bauhaus&colors=1a2744,2c4a7c,c9a227&gennyLocked=1&gennyFocus=0');
s = await state();
check('?gennyStrategy picks the strategy', s.category === 'Cultural' && s.strategy === 'Bauhaus', `${s.category} ${s.strategy}`);
check('?gennyLocked locks', s.locks.join() === 'false,true,false');
check('?gennyFocus widens', s.wide[0] === 'true');

// reduced motion: no reels
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await page.click('.pg-regenerate');
await sleep(100);
check(
	'reduced motion: no reel runs',
	await page.evaluate(() => [...document.querySelectorAll('.pg-reel')].every((el) => getComputedStyle(el).display === 'none')),
);
await page.emulateMediaFeatures([]);

// phone
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/palette-genny');
check(
	'phone: no sideways scroll',
	await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
);
check(
	'phone: the reels are first and large',
	(await page.$eval('.palette-genny .canon-canvas', (el) => el.getBoundingClientRect().height)) > 300,
);

await finish(browser);
