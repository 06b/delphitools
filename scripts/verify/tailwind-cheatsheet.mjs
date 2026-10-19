// needs npm start first

import { BASE, launch, visit, check, sleep, finish } from './harness.mjs';

// node strips .ts types
const { TOTAL_CLASSES, filterCheatsheet } = await import(
	'../../app/components/tools/tailwind-cheatsheet/data.ts'
);

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
await visit(page, '/tools/tailwind-cheatsheet');

const names = () =>
	page.$$eval('.tw-item-name', (els) => els.map((el) => el.textContent.trim()));
const stage = () =>
	page.evaluate(() => ({
		caption: document.querySelector('.tw-stage-caption')?.textContent.trim(),
		name: document.querySelector('.tw-stage-name')?.textContent.trim(),
		css: document.querySelector('.tw-stage-css')?.textContent.trim(),
		example: document.querySelector('.tw-stage-example')?.textContent.trim(),
		lit: [...document.querySelectorAll('.tw-item-body--lit .tw-item-name')].map((el) =>
			el.textContent.trim(),
		),
	}));
const typeSearch = async (text) => {
	await page.$eval('.tw-search-field', (el) => {
		el.value = '';
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await page.type('.tw-search-field', text);
	await sleep(50);
};

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.tailwind-cheatsheet').getBoundingClientRect().height,
	),
);
check('one item per class', (await names()).length === TOTAL_CLASSES, TOTAL_CLASSES);
check('every item has a drawing', (await page.$$eval('.tw-thumb > svg', (els) => els.length)) === TOTAL_CLASSES);
check(
	'one jump heading per category, with the count',
	(await page.$$eval('.canon-jump-heading', (els) => els.map((el) => el.dataset.canonJumpTitle))).join('|') ===
		filterCheatsheet('').map((c) => `${c.name} · ${c.items.length}`).join('|'),
);
let s = await stage();
check('p-4 is lit at the start', s.name === 'p-4' && s.caption === 'Spacing' && s.lit.join() === 'p-4', JSON.stringify(s));

const field = await page.evaluate(() => {
	const browser = document.querySelector('.tw-browser');
	const input = document.querySelector('.tw-search-field');
	const box = input.getBoundingClientRect();
	return {
		first: browser.firstElementChild.contains(input),
		height: box.height,
		size: parseFloat(getComputedStyle(input).fontSize),
		label: input.getAttribute('aria-label'),
	};
});
check('the search opens the browser', field.first);
check('at primary height and big-number size', field.height >= 68 && field.size >= 32, JSON.stringify(field));
check('the search is named', field.label === 'Search');

await typeSearch('JUSTIFY-BETWEEN');
check('search is live and case folded', (await names()).join() === 'justify-between');
check('the stage follows the first match', (await stage()).name === 'justify-between');
await typeSearch('group-hover:visible');
s = await stage();
check('examples match', (await names()).join() === 'group-hover:');
check('the stage reads the example', s.example === 'e.g. group-hover:visible', s.example);
await typeSearch('space-evenly');
check(
	'css matches',
	(await page.$$eval('.canon-jump-heading', (els) => els.map((el) => el.dataset.canonJumpTitle))).join() ===
		'Alignment · 1',
);
await typeSearch('zzz');
check(
	'a miss shows the web wording',
	(await page.$eval('.tw-browser .canon-empty-row', (el) => el.textContent.trim())) ===
		'No classes found matching “zzz”',
);
await page.click('.tw-search-clear');
await sleep(100);
check('Clear restores every class', (await names()).length === TOTAL_CLASSES);
check('and lights the first', (await stage()).name === 'sm:');

await page.$$eval('.tw-item-body', (els) =>
	els.find((el) => el.querySelector('.tw-item-name').textContent.trim() === 'rotate-45')?.click(),
);
await sleep(300);
s = await stage();
check('an item puts its class on the stage', s.name === 'rotate-45' && s.css === 'transform: rotate(45deg)', s.name);
check(
	'the item is lit and pressed',
	await page.$eval('.tw-item-body--lit', (el) => el.getAttribute('aria-pressed') === 'true' && el.textContent.includes('rotate-45')),
);
check(
	'a transform moves on the stage',
	await page.evaluate(() => {
		const moving = document.querySelector('.tw-stage [data-tw-move]');
		return !!moving && moving.getAnimations().length > 0;
	}),
);
check(
	'wide, the stage shows the category, the lit one framed',
	await page.evaluate(
		() =>
			getComputedStyle(document.querySelector('.tw-stage-siblings')).display !== 'none' &&
			document.querySelectorAll('.tw-stage-sibling').length === 18 &&
			document.querySelectorAll('.tw-stage-sibling--lit').length === 1,
	),
);
check(
	'wide, classes are cards',
	await page.$eval('.tw-items', (el) => getComputedStyle(el).display === 'grid'),
);

await page.$$eval('.tw-item-copy', (els) =>
	els.find((el) => el.getAttribute('aria-label') === 'Copy mx-auto')?.click(),
);
await sleep(300);
check('copy writes the class', (await page.evaluate(() => navigator.clipboard.readText())) === 'mx-auto');
check('and the toast confirms', await page.$eval('.canon-toast', (t) => t.style.opacity === '1'));

await page.focus('.tw-search-field');
await page.keyboard.type('flex');
await page.click('.tw-item-body');
await page.click('.tw-search-field');
await sleep(100);
check(
	'focus selects the whole search',
	await page.$eval('.tw-search-field', (el) => el.selectionStart === 0 && el.selectionEnd === el.value.length && el.value.length > 0),
);

await page.click('.canon-jump-heading-button');
await sleep(400);
check('a heading opens the jump grid', !!(await page.$('dialog[open]')));
await page.keyboard.press('Escape');
await sleep(300);

await visit(page, '/tools/tailwind-cheatsheet?twSearch=gap&twSelect=gap-4');
check(
	'launch flags: search and selection',
	(await names()).every((n) => n.includes('gap')) && (await stage()).name === 'gap-4',
);

await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await visit(page, '/tools/tailwind-cheatsheet?twSelect=animate-spin');
check(
	'reduced motion draws the class still',
	await page.evaluate(
		() =>
			!document.querySelector('.tw-stage [data-tw-move]') &&
			document.querySelector('.tw-stage-specimen path') !== null,
	),
);
const jumpCheck = async (label) => {
	await page.click('.tw-stage-jump');
	await sleep(1500);
	const state = await page.evaluate(() => {
		const heading = document.querySelector('[data-tw-category="Backgrounds"]');
		const body = document.querySelector('.tailwind-cheatsheet .canon-split-body');
		const banner = document.querySelector('.tailwind-cheatsheet .canon-split-banner');
		const top = heading.getBoundingClientRect().top;
		return {
			focused: document.activeElement === heading.querySelector('button'),
			named: document.querySelector('.tw-stage-jump').getAttribute('aria-label'),
			inView: top >= banner.getBoundingClientRect().bottom - 1 && top < body.getBoundingClientRect().bottom,
			top: Math.round(top),
		};
	});
	check(label, state.focused && state.inView && state.named === 'Backgrounds', JSON.stringify(state));
};
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await visit(page, '/tools/tailwind-cheatsheet?twSelect=bg-current');
await jumpCheck('the stage jumps to its section and focuses the heading (reduced motion)');
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/tailwind-cheatsheet?twSelect=bg-current');
await jumpCheck('on a phone the stage jumps below the collapsed band');
await visit(page, '/tools/tailwind-cheatsheet');
check(
	'a phone lists rows',
	await page.$eval('.tw-items', (el) => getComputedStyle(el).display === 'flex'),
);
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
			document.querySelector('.tailwind-cheatsheet .canon-split-body').scrollWidth <=
				document.querySelector('.tailwind-cheatsheet .canon-split-body').clientWidth,
	),
);
const band = async () => page.$eval('.tailwind-cheatsheet .canon-split-banner', (el) => el.getBoundingClientRect().height);
const full = await band();
await page.$eval('.tailwind-cheatsheet .canon-split-body', (el) => (el.scrollTop = 600));
await sleep(200);
check('the stage collapses on scroll', (await band()) === 116 && full === 196, `${full} -> ${await band()}`);

await finish(browser);
