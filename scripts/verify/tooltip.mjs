// unmount rides animationend; app.scss keyframes

import { launch, visit, check, sleep, finish } from './harness.mjs';

const TRIGGER = '.dt-code-type';

const { browser, page } = await launch({
	viewport: { width: 1400, height: 900 },
});
await visit(page, '/tools/code-genny');

const count = () =>
	page.$$eval('.dt-tooltip', (els) => els.length).catch(() => 0);

check('no tooltip before a hover', (await count()) === 0);

await page.hover(TRIGGER);
await sleep(600);

const shown = await page.evaluate(() => {
	const tip = document.querySelector('.dt-tooltip');
	if (!tip) return null;
	const rect = tip.getBoundingClientRect();
	return {
		text: tip.textContent.trim(),
		side: tip.dataset.side,
		x: Math.round(rect.x),
		width: Math.round(rect.width),
		inBody: tip.parentElement === document.body,
		background: getComputedStyle(tip).backgroundColor,
	};
});
check('a hover shows one', shown, JSON.stringify(shown));
const name = await page.$eval(TRIGGER, (el) => el.textContent.trim());
check('naming its trigger', shown?.text.startsWith(name), shown?.text);
check('placed on the requested side', shown?.side === 'bottom', shown?.side);
check('portalled to the body', shown?.inBody);
check(
	'positioned on screen',
	shown && shown.x > 0 && shown.width > 0,
	`x=${shown?.x} w=${shown?.width}`,
);
check(
	'and painted, not transparent',
	shown?.background !== 'rgba(0, 0, 0, 0)',
	shown?.background,
);

await page.mouse.move(5, 895);
await sleep(900);
check(
	'moving away unmounts it rather than hiding it',
	(await count()) === 0,
	'without the exit keyframes this stays at 1 forever',
);

await page.evaluate((sel) => document.querySelector(sel).focus(), TRIGGER);
await sleep(500);
check('keyboard focus opens it too', (await count()) === 1, `${await count()}`);

await page.evaluate(() => document.activeElement.blur());
await sleep(900);
check('and blur closes it', (await count()) === 0);

await finish(browser);
