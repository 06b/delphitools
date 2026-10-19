// workflow step picker: kit menu keyboard

import { launch, visit, check, sleep, finish } from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/workflows');
await page.waitForSelector('.dt-wf-custom .dt-wf-pick-trigger', { timeout: 15000 });

const trigger = '.dt-wf-custom .dt-wf-pick-trigger';
const openMenu = () =>
	page.evaluate(() => !!document.querySelector('.dt-wf-pick-list:popover-open'));
const shown = () => page.$eval(trigger, (el) => el.textContent.trim());
const items = () =>
	page.$$eval('.dt-wf-pick-list:popover-open .canon-menu-item', (els) =>
		els.map((el) => el.textContent.trim()),
	);
const active = () =>
	page.evaluate(() =>
		document.activeElement?.classList.contains('canon-menu-item')
			? document.activeElement.textContent.trim()
			: null,
	);
const triggerFocused = () =>
	page.evaluate(
		(sel) => document.activeElement === document.querySelector(sel),
		trigger,
	);

check('closed to begin with', !(await openMenu()));
await page.click(trigger);
await sleep(200);
check('clicking the trigger opens the menu', await openMenu());
check('focus moves into the menu', (await active()) !== null);
check(
	'trigger reports expanded',
	(await page.$eval(trigger, (el) => el.getAttribute('aria-expanded'))) ===
		'true',
);
const list = await items();
const before = await shown();
const checked = await page.$$eval(
	'.dt-wf-pick-list:popover-open .canon-menu-item',
	(els) =>
		els
			.filter((el) => el.getAttribute('aria-checked') === 'true')
			.map((el) => el.textContent.trim()),
);
check(
	'the current value is checked, none under a placeholder',
	list.includes(before)
		? checked.length === 1 && checked[0] === before
		: checked.length === 0,
	`${checked} vs ${before}`,
);
check('enough items to walk', list.length >= 4, String(list.length));
const picked = (list.indexOf(before) + 2) % (list.length - 1) || 1;

await page.evaluate((i) => {
	document
		.querySelectorAll('.dt-wf-pick-list:popover-open .canon-menu-item')
		[i].click();
}, picked);
await sleep(250);
check('picking an item closes the menu', !(await openMenu()));
check('the trigger shows the new value', (await shown()) === list[picked]);

await page.focus(trigger);
await page.keyboard.press('ArrowDown');
await sleep(200);
check('ArrowDown on the trigger opens the menu', await openMenu());
check('focus starts on the current value', (await active()) === list[picked], await active());
await page.keyboard.press('ArrowDown');
await sleep(80);
check('ArrowDown moves down the list', (await active()) === list[picked + 1], await active());
await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowUp');
await sleep(80);
check('ArrowUp moves back', (await active()) === list[picked - 1], await active());
await page.keyboard.press('Home');
await sleep(80);
check('Home jumps to the first', (await active()) === list[0]);
await page.keyboard.press('End');
await sleep(80);
check('End jumps to the last', (await active()) === list.at(-1));
const letter = list[0][0];
await page.keyboard.press(letter.toLowerCase());
await sleep(80);
check(
	'typing a letter jumps to an item that starts with it',
	(await active())?.toLowerCase().startsWith(letter.toLowerCase()),
	await active(),
);
await page.keyboard.press('End');
await sleep(80);

await page.keyboard.press('Enter');
await sleep(250);
check('Enter selects the focused item', !(await openMenu()));
check('the selection took', (await shown()) === list.at(-1));
check('focus returned to the trigger', await triggerFocused());

await page.keyboard.press('ArrowDown');
await sleep(200);
check('reopens', await openMenu());
await page.keyboard.press('Escape');
await sleep(250);
check('Escape closes without selecting', !(await openMenu()));
check('and leaves the value alone', (await shown()) === list.at(-1));
check('and returns focus to the trigger', await triggerFocused());

await page.click(trigger);
await sleep(150);
await page.evaluate(() => {
	document
		.querySelector('.canon-sidebar-row[href="/tools/base-converter"]')
		?.click();
});
await sleep(600);
check(
	'leaving with the menu open tears down cleanly',
	await page.evaluate(
		() =>
			location.pathname === '/tools/base-converter' &&
			!document.querySelector('.dt-wf-pick-list'),
	),
	'console errors would have failed above',
);

await finish(browser);
