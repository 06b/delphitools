// image-tracer's option hints: the kit CanonTooltip, a manual popover in the top layer

import { launch, visit, check, sleep, finish } from './harness.mjs';

const TRIGGER = '.trace-colours .trace-info';

const { browser, page } = await launch({
	viewport: { width: 1400, height: 900 },
});
await visit(page, '/tools/image-tracer');
await page.waitForSelector(TRIGGER, { timeout: 10000 });

const shown = () =>
	page.evaluate(() => {
		const tip = [...document.querySelectorAll('.canon-tooltip')].find(
			(el) => el.matches(':popover-open'),
		);
		if (!tip) return null;
		const rect = tip.getBoundingClientRect();
		return {
			id: tip.id,
			text: tip.textContent.trim(),
			x: Math.round(rect.x),
			bottom: Math.round(rect.bottom),
			width: Math.round(rect.width),
			background: getComputedStyle(tip).backgroundColor,
		};
	});

check('no tooltip before a hover', (await shown()) === null);

await page.hover(TRIGGER);
await sleep(400);
const tip = await shown();
check('a hover shows one', tip, JSON.stringify(tip));
const trigger = await page.$eval(TRIGGER, (el) => ({
	describedBy: el.getAttribute('aria-describedby'),
	top: Math.round(el.getBoundingClientRect().top),
}));
check('describing its trigger', tip?.id === trigger.describedBy, trigger.describedBy);
check(
	'with the web hint',
	tip?.text.startsWith('Number of colours used to quantise'),
	tip?.text,
);
check('placed above the trigger', tip && tip.bottom <= trigger.top, `${tip?.bottom} ${trigger.top}`);
check(
	'positioned on screen',
	tip && tip.x > 0 && tip.width > 0,
	`x=${tip?.x} w=${tip?.width}`,
);
check(
	'and painted, not transparent',
	tip?.background !== 'rgba(0, 0, 0, 0)',
	tip?.background,
);

await page.mouse.move(5, 895);
await sleep(400);
check('moving away hides it', (await shown()) === null);

await page.focus('.trace-preset select');
await page.keyboard.press('Tab');
await sleep(300);
const focused = await page.evaluate(
	(sel) => document.activeElement === document.querySelector(sel),
	TRIGGER,
);
check('the hint cell takes keyboard focus', focused);
check('keyboard focus opens it too', (await shown()) !== null);

await page.keyboard.press('Escape');
await sleep(300);
check('and Escape closes it', (await shown()) === null);

await finish(browser);
