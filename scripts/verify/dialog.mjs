import { launch, visit, check, sleep, finish } from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/');

const about = '.dt-about';
const aboutRow =
	'xpath///button[contains(@class,"canon-sidebar-row")][contains(., "About")]';

const isOpen = (sel) =>
	page.evaluate((s) => document.querySelector(s)?.open ?? false, sel);
const focusInside = (sel) =>
	page.evaluate(
		(s) => document.querySelector(s)?.contains(document.activeElement),
		sel,
	);
const focused = () =>
	page.evaluate(
		() =>
			document.activeElement?.className ||
			document.activeElement?.tagName,
	);
const footerButton = (sel, text) =>
	page.evaluate(
		(s, t) =>
			[...document.querySelectorAll(`${s} .canon-dialog-footer button`)]
				.find((b) => b.textContent.trim() === t)
				?.click(),
		sel,
		text,
	);

// about, in the drawer
check('the dialog element is in the DOM from the start', await page.$(about));
check('but closed', !(await isOpen(about)));

await (await page.$(aboutRow)).click();
await sleep(500);
check('the trigger opens it', await isOpen(about));
check(
	'with its content',
	(await page.$$(`${about} .dt-chips a`)).length > 0,
);
check('focus moves inside', await focusInside(about), await focused());
check(
	'it is in the top layer with a ::backdrop',
	await page.evaluate((s) => {
		const backdrop = getComputedStyle(
			document.querySelector(s),
			'::backdrop',
		);
		return (
			backdrop.backgroundColor !== '' &&
			backdrop.backgroundColor !== 'rgba(0, 0, 0, 0)'
		);
	}, about),
);
check(
	'a click behind it cannot reach the page',
	await page.evaluate(() => {
		const link = document.querySelector('.canon-sidebar-row');
		const rect = link.getBoundingClientRect();
		const hit = document.elementFromPoint(rect.x + 4, rect.y + 4);
		return hit !== link && !link.contains(hit);
	}),
);
await page.keyboard.press('Tab');
check('Tab keeps focus inside', await focusInside(about), await focused());

await page.keyboard.press('Escape');
await sleep(500);
check('Escape closes it', !(await isOpen(about)));
check(
	'and focus returns to the trigger',
	(await focused())?.includes('canon-sidebar-row'),
	await focused(),
);

await (await page.$(aboutRow)).click();
await sleep(400);
await footerButton(about, 'Close');
await sleep(500);
check('the close button closes it too', !(await isOpen(about)));
check(
	'and also returns focus',
	(await focused())?.includes('canon-sidebar-row'),
	await focused(),
);

// colour palette, inside about
await (await page.$(aboutRow)).click();
await sleep(400);
await page.click('.dt-palette-trigger');
await page.waitForSelector('.dt-palette-dialog .dt-swatch', { timeout: 10000 });
check('the palette opens over about', await isOpen('.dt-palette-dialog'));
check(
	'with swatches',
	(await page.$$('.dt-palette-dialog .dt-swatch')).length > 0,
);
check('focus moves into the palette', await focusInside('.dt-palette-dialog'));
await page.keyboard.press('Escape');
await sleep(500);
check(
	'Escape closes the palette only',
	!(await isOpen('.dt-palette-dialog')) && (await isOpen(about)),
);
check(
	'focus returns to the palette trigger',
	await page.evaluate(() =>
		document.activeElement?.classList.contains('dt-palette-trigger'),
	),
	await focused(),
);
await page.keyboard.press('Escape');
await sleep(500);
check('a second Escape closes about', !(await isOpen(about)));

// changelog, in the hero
await page.click('.dt-hero-link');
await sleep(400);
check('the changelog opens', await isOpen('.dt-cl'));
check('focus moves inside', await focusInside('.dt-cl'), await focused());
const tabs = () =>
	page.$$eval('.dt-cl-tab', (els) =>
		els.map((el) => ({
			text: el.textContent.trim(),
			selected: el.getAttribute('aria-selected') === 'true',
			disabled: el.disabled,
		})),
	);
// 2.0.0 fills all three tabs
await page.select('.dt-cl-version', '2.0.0');
await sleep(100);
const enabled = (await tabs()).filter((t) => !t.disabled);
check('2.0.0 fills three tabs', enabled.length === 3, enabled.length);
const selectedTab = async () =>
	(await tabs()).find((t) => t.selected)?.text;
await page.focus('.dt-cl-tab[aria-selected="true"]');
await page.keyboard.press('End');
await sleep(100);
check(
	'End selects the last enabled tab',
	(await selectedTab()) === enabled.at(-1).text,
	await selectedTab(),
);
await page.keyboard.press('Home');
await sleep(100);
check(
	'Home selects the first enabled tab',
	(await selectedTab()) === enabled[0].text,
	await selectedTab(),
);
await page.keyboard.press('ArrowRight');
await sleep(100);
check(
	'ArrowRight moves to the next enabled tab',
	(await selectedTab()) === enabled[1 % enabled.length].text,
	await selectedTab(),
);
check(
	'focus follows the selected tab',
	await page.evaluate(
		() => document.activeElement?.getAttribute('aria-selected') === 'true',
	),
);
await page.keyboard.press('ArrowLeft');
await sleep(100);
check(
	'ArrowLeft moves back',
	(await selectedTab()) === enabled[0].text,
	await selectedTab(),
);
check(
	'the panel is labelled by the selected tab',
	await page.evaluate(() => {
		const panel = document.querySelector('.dt-cl [role="tabpanel"]');
		const tab = document.getElementById(
			panel?.getAttribute('aria-labelledby') ?? '',
		);
		return tab?.getAttribute('aria-selected') === 'true';
	}),
);
await page.keyboard.press('Escape');
await sleep(500);
check('Escape closes the changelog', !(await isOpen('.dt-cl')));
check(
	'focus returns to its link',
	await page.evaluate(() =>
		document.activeElement?.classList.contains('dt-hero-link'),
	),
	await focused(),
);

// what's new, in the hero
await page.click('.dt-hero-reveal');
await sleep(100);
await page.click('.dt-hero-pill');
await sleep(400);
check("the what's-new dialog opens", await isOpen('.dt-wn'));
check('focus moves inside', await focusInside('.dt-wn'), await focused());
await footerButton('.dt-wn', 'Next');
await sleep(100);
check(
	'Next steps on',
	await page.$eval('.dt-wn-dot.is-active', (el) =>
		[...el.parentElement.children].indexOf(el),
	) === 1,
);
await page.keyboard.press('Escape');
await sleep(500);
check("Escape closes what's new", !(await isOpen('.dt-wn')));
check(
	'focus returns to the pill',
	await page.evaluate(() =>
		document.activeElement?.classList.contains('dt-hero-pill'),
	),
	await focused(),
);
await page.click('.dt-hero-pill');
await sleep(400);
check(
	'it reopens on the first step',
	await page.$eval('.dt-wn-dot.is-active', (el) =>
		[...el.parentElement.children].indexOf(el),
	) === 0,
);
await page.keyboard.press('Escape');
await sleep(500);

// route-leave teardown
await (await page.$(aboutRow)).click();
await sleep(300);
await page.evaluate(() => {
	document.querySelector(
		'.canon-sidebar-row[href="/tools/palette-genny"]',
	)?.click();
});
await sleep(700);
check(
	'navigating with it open tears down cleanly',
	await page.$('.palette-genny'),
	'console errors would have failed above',
);

await finish(browser);
