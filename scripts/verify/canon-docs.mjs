// the /canon docs: every page through the nav, palette, pager, demos, blocks, phone nav, entry links

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

// node strips typescript
const { docsPages, importLine } = await import('../../app/lib/canon-docs.ts');

const KIT = "Delphi's Canon UI Kit";

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const path = () => new URL(page.url()).pathname;
const heading = () =>
	page.evaluate(() => document.querySelector('.cd-title')?.textContent.trim());
const layout = () =>
	page.evaluate(() => ({
		document:
			document.scrollingElement.scrollHeight <= innerHeight &&
			document.scrollingElement.scrollWidth <= innerWidth,
		pane: [...document.querySelectorAll('.dt-main, .cd-page')].every(
			(el) => el.scrollWidth <= el.clientWidth,
		),
	}));

await visit(page, '/canon');
check('/canon renders the docs', !!(await page.$('.cd-docs')));
check('the bar names the kit', (await page.$eval('.dt-bar-title', (el) => el.textContent.trim())) === KIT);
check('the overview heading is the kit name', (await heading()) === KIT);

const iconed = await page.$$eval('.cd-nav .canon-sidebar-row', (rows) =>
	rows.filter((r) => r.querySelector('svg')).map((r) => r.textContent.trim()),
);
check('the nav is text only, flat like the app drawer', iconed.length === 0, iconed.join(' '));

let walked = 0;
const missed = [];
for (const docs of docsPages) {
	await page.click(`.cd-nav a[href="${docs.url}"]`);
	await page
		.waitForFunction(
			(want) =>
				document.querySelector('.cd-title')?.textContent.trim() === want,
			{ timeout: 5000 },
			docs.kind === 'overview' ? KIT : docs.heading,
		)
		.catch(() => {});
	const seen = await heading();
	const want = docs.kind === 'overview' ? KIT : docs.heading;
	if (path() === docs.url && seen === want) walked++;
	else missed.push(`${docs.url} -> ${path()} "${seen}"`);
}
check(
	'every docs page renders through the nav',
	walked === docsPages.length,
	missed.length ? missed.slice(0, 3).join('; ') : `${walked} pages`,
);

const components = docsPages.filter((p) => p.kind === 'component');
let demos = 0;
for (const docs of components) {
	await page.click(`.cd-nav a[href="${docs.url}"]`);
	await sleep(60);
	const live = await page.evaluate(
		() => document.querySelector('.cd-demo')?.children.length ?? 0,
	);
	if (live > 1) demos++;
}
check('every component page shows a live demo', demos === components.length, `${demos} of ${components.length}`);

for (const url of ['/canon/installation', '/canon/components', '/canon/components/slider', '/canon/blocks/text-tool']) {
	await visit(page, url);
	check(`${url} loads directly`, path() === url && !!(await heading()));
}

// the 404 page has no shell
await page.goto(`${BASE}/canon/components/nope`, { waitUntil: 'networkidle2' });
check(
	'an unknown component is the 404 page',
	!!(await page.waitForSelector('.dt-404-page', { timeout: 10000 }).catch(() => null)),
);

await visit(page, '/canon/components/slider');
check('a component page shows the slider', !!(await page.$('.cd-demo .canon-slider')));
await page.click('.cd-import');
await sleep(200);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('the import line copies', copied === importLine('canon-slider'), copied);
check('and the toast shows', await page.$eval('.canon-toast', (t) => t.style.opacity === '1'));
const ports = await page.$$eval('.cd-ports [data-has="true"]', (els) => els.map((el) => el.textContent.trim()));
check('the platforms list the ports', ports.join() === 'Ember,React,Vue,Svelte,UIKit', ports.join());

await page.click('.cd-next');
await sleep(300);
check('next goes to the following page', path() === '/canon/components/status', path());
await page.click('.cd-previous');
await sleep(300);
check('previous comes back', path() === '/canon/components/slider', path());
await page.goBack();
await sleep(300);
check('the back button works', path() === '/canon/components/status', path());

await page.keyboard.down('Meta');
await page.keyboard.press('k');
await page.keyboard.up('Meta');
await sleep(300);
const palette = await page.evaluate(() => ({
	open: !!document.querySelector('dialog[open] .canon-command'),
	appSearch: document.activeElement?.classList.contains('dt-search-input'),
}));
check('⌘K opens the docs palette', palette.open);
check('and the app search stays put', !palette.appSearch);
await page.keyboard.type('blocks');
await sleep(200);
await page.keyboard.press('Enter');
await sleep(400);
check('the palette navigates', path() === '/canon/blocks', path());
check('and closes', !(await page.$('dialog[open] .canon-command')));

await visit(page, '/canon/blocks/halves');
check('a block page shows the live block', !!(await page.$('.cd-block .canon-split')));
const source = await page.$eval('.cd-source', (el) => el.textContent);
check('and its own source', source.includes('export default class HalvesBlock'));

await visit(page, '/canon/blocks/text-tool');
await page.evaluate(() => {
	const area = document.querySelector('.cd-block textarea');
	Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, 'canon kit');
	area.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(200);
const result = await page.$eval('.cd-block .tt-result-text', (el) => el.textContent.trim());
check('the text tool block converts', result === 'CANON KIT', result);

await visit(page, '/canon/blocks/job-panel');
await page.click('.cd-block .media-job-run');
await page.waitForSelector('.cd-block .media-job-result', { timeout: 10000 }).catch(() => {});
check('the job panel block renders a result', !!(await page.$('.cd-block .media-job-result')));

for (const url of ['/canon', '/canon/components', '/canon/components/slider', '/canon/blocks/readout-band']) {
	await visit(page, url);
	const seen = await layout();
	check(`${url} at 1400: no document scroll`, seen.document && seen.pane);
}

await visit(page, '/');
const row = await page.$('.dt-sidebar a[href="/canon"]');
check('the Elsewhere row links to /canon', !!row && !(await row.evaluate((el) => el.target)));
await row?.click();
await sleep(500);
check('and routes there in the app', path() === '/canon' && !!(await page.$('.cd-docs')));

await visit(page, '/');
check('the hero Canon tile links to /canon', !!(await page.$('.dt-hero-tile[href="/canon"]')));

await (await page.$('xpath///button[contains(@class,"canon-sidebar-row")][contains(., "About")]')).click();
await sleep(400);
await page.click('.dt-about-body a[href="/canon"]');
await sleep(500);
check('the About chip routes to /canon', path() === '/canon');
check('and closes the dialog', !(await page.$('dialog[open] .dt-about-body')));

await page.setViewport({ width: 390, height: 844 });
for (const url of ['/canon', '/canon/components', '/canon/components/slider', '/canon/blocks/halves']) {
	await visit(page, url);
	const seen = await layout();
	check(`${url} at 390: no horizontal or document scroll`, seen.document && seen.pane);
}
// the pager walks every page after the first component
await visit(page, components[0].url);
const wide = [];
for (let i = 0; i < docsPages.length; i++) {
	const seen = await layout();
	if (!seen.document || !seen.pane) wide.push(path());
	if (!(await page.$('.cd-next'))) break;
	await page.click('.cd-next');
	await sleep(80);
}
check('no page scrolls sideways at 390', wide.length === 0, wide.join(' '));

const phone = await page.evaluate(() => ({
	nav: getComputedStyle(document.querySelector('.cd-nav')).display,
	menu: getComputedStyle(document.querySelector('.cd-menu')).display,
	fills:
		document.querySelector('.cd-pane').offsetWidth ===
		document.querySelector('.cd-docs').offsetWidth,
}));
check('the page takes the whole sheet', phone.fills);
check('a phone hides the nav for its button', phone.nav === 'none' && phone.menu !== 'none', JSON.stringify(phone));
await page.click('.cd-menu');
await sleep(500);
check('the button opens the nav sheet', !!(await page.$('dialog[open] .cd-sheet-rows')));
await page.click('dialog[open] .cd-sheet-rows a[href="/canon/installation"]');
await sleep(500);
check('a row navigates', path() === '/canon/installation', path());
check('and closes the sheet', !(await page.$('dialog[open] .cd-sheet-rows')));

await finish(browser);
