// vendored select, local keyboard

import { launch, visit, check, sleep, finish } from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/tools/typo-calc');

const trigger = '.dt-typo-picker .dt-select-trigger';
const openContent = () => page.$('.dt-select-content');
const shown = () => page.$eval(trigger, (el) => el.textContent.trim());
const items = () =>
	page.$$eval('.dt-select-item', (els) =>
		els.map((el) => el.textContent.trim()),
	);
const focusedIs = (name) =>
	page.evaluate(
		(n) => document.activeElement?.classList.contains(n) ?? false,
		name,
	);

check('closed to begin with', !(await openContent()));
await page.click(trigger);
await sleep(200);
check('clicking the trigger opens the listbox', await openContent());
check('the listbox is focused', await focusedIs('dt-select-content'));
check(
	'trigger reports expanded',
	(await page.$eval(trigger, (el) => el.getAttribute('aria-expanded'))) ===
		'true',
);
const list = await items();
check(
	'the current value is marked selected',
	(
		await page.$$eval('.dt-select-item', (els) =>
			els
				.filter((el) => el.getAttribute('aria-selected') === 'true')
				.map((el) => el.textContent.trim()),
		)
	).join() === 'px',
);

await page.evaluate(() => {
	[...document.querySelectorAll('.dt-select-item')]
		.find((el) => el.textContent.trim() === 'pc')
		.click();
});
await sleep(250);
check('picking an item closes the listbox', !(await openContent()));
check('the trigger shows the new value', (await shown()) === 'pc');

await page.focus(trigger);
await page.keyboard.press('ArrowDown');
await sleep(200);
check('ArrowDown on the trigger opens the listbox', await openContent());

const active = () =>
	page.$eval('.dt-select-item[data-active="true"]', (el) =>
		el.textContent.trim(),
	);
check('the active item starts on the current value', (await active()) === 'pc');
await page.keyboard.press('ArrowDown');
await sleep(80);
check('ArrowDown moves down the list', (await active()) === 'ag', await active());
await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowUp');
await sleep(80);
check('ArrowUp moves back', (await active()) === 'pt', await active());
await page.keyboard.press('Home');
await sleep(80);
check('Home jumps to the first', (await active()) === list[0]);
await page.keyboard.press('End');
await sleep(80);
check('End jumps to the last', (await active()) === list.at(-1));

await page.keyboard.press('Enter');
await sleep(250);
check('Enter selects the active item', !(await openContent()));
check('the selection took', (await shown()) === list.at(-1));
check('focus returned to the trigger', await focusedIs('dt-select-trigger'));

await page.keyboard.press('ArrowDown');
await sleep(200);
check('reopens', await openContent());
await page.keyboard.press('Escape');
await sleep(250);
check('Escape closes without selecting', !(await openContent()));
check('and leaves the value alone', (await shown()) === list.at(-1));
check('and returns focus to the trigger', await focusedIs('dt-select-trigger'));

// stays without app.scss keyframes
check(
	'the closed listbox is gone from the DOM, not just hidden',
	await page.evaluate(() => !document.querySelector('.dt-select-content')),
);

await page.click(trigger);
await sleep(150);
await page.evaluate(() => {
	document
		.querySelector('.canon-sidebar-row[href="/tools/palette-genny"]')
		?.click();
});
await sleep(600);
check(
	'leaving with the listbox open tears down cleanly',
	await page.$('.dt-palette-frame'),
	'console errors would have failed above',
);

await finish(browser);
