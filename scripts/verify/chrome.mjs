import { launch, visit, check, sleep, finish } from './harness.mjs';

const TOGGLE = '.dt-tab';
const ROW = '.canon-sidebar-row';

const { browser, page } = await launch({
	viewport: { width: 1400, height: 1000 },
});
await visit(page, '/');

const shell = await page.evaluate(() => ({
	window: !!document.querySelector('.dt-frame'),
	sidebar: !!document.querySelector('.canon-sidebar'),
	rows: document.querySelectorAll('.canon-sidebar-row').length,
	headings: document.querySelectorAll('.canon-sidebar .canon-heading')
		.length,
	title: document.querySelector('.dt-bar-title')?.textContent.trim(),
	theme: !!document.querySelector("button[aria-label='Toggle theme']"),
}));
check('window and sidebar render', shell.window && shell.sidebar);
check('every tool has a row', shell.rows >= 55, `${shell.rows}`);
check('rows are grouped by category', shell.headings >= 5, `${shell.headings}`);
check('the home route names itself', shell.title === 'Home', shell.title);
check('the theme toggle is present', shell.theme);

await page.type('.dt-search-input', 'palette');
await sleep(400);
const filtered = await page.evaluate(() => ({
	rows: [...document.querySelectorAll('.canon-sidebar-row')].map((el) =>
		el.textContent.trim(),
	),
	headings: [
		...document.querySelectorAll('.canon-sidebar .canon-heading'),
	].map((el) => el.textContent.trim()),
}));
check(
	'search narrows the list',
	filtered.rows.length > 0 && filtered.rows.length < shell.rows,
	`${filtered.rows.length} of ${shell.rows}`,
);
check(
	'and every survivor matches',
	filtered.rows.every((label) => /palette/i.test(label)),
	filtered.rows.join(', '),
);
check(
	'empty groups are dropped',
	filtered.headings.length < shell.headings,
	filtered.headings.join(', '),
);

await page.$eval('.dt-search-input', (el) => {
	el.value = '';
	el.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(300);
check(
	'clearing restores the full list',
	(await page.$$eval(ROW, (els) => els.length)) === shell.rows,
);

const width = () =>
	page.$eval('.dt-drawer', (el) =>
		Math.round(el.getBoundingClientRect().width),
	);

const expanded = await width();
check('starts open on a wide window', expanded === 184 + 56, `${expanded}`);
await page.click(TOGGLE);
await sleep(500);
check('the tab slides the drawer shut', (await width()) === 56, 'to the band');
check(
	'which makes it inert',
	await page.$eval('.dt-drawer', (el) => el.inert),
);
check(
	'and persists to a cookie',
	await page.evaluate(() => /sidebar_state=false/.test(document.cookie)),
	await page.evaluate(() => document.cookie),
);

const tab = await (await page.$(TOGGLE)).boundingBox();
await page.mouse.move(tab.x + 20, tab.y + 40);
await page.mouse.down();
for (let i = 1; i <= 10; i += 1) {
	await page.mouse.move(tab.x + 20 + i * 15, tab.y + 40);
	await sleep(16);
}
const midDrag = await width();
await page.mouse.up();
await sleep(500);
check('a drag follows the pointer', midDrag === 150 + 56, `${midDrag}`);
check('and past halfway it opens', (await width()) === expanded);

await page.click(`${ROW}[href="/tools/px-to-rem"]`);
await sleep(600);
const tool = await page.evaluate(() => ({
	url: location.pathname,
	title: document.querySelector('.dt-bar-title')?.textContent.trim(),
	current: document
		.querySelector('.canon-sidebar-row[aria-current="page"]')
		?.textContent.trim(),
	h1: document.querySelectorAll('h1').length,
	scrolls: document.scrollingElement.scrollHeight <= innerHeight,
}));
check('a row click routes in the app', tool.url === '/tools/px-to-rem');
check('a tool route names the tool', tool.title === 'PX to REM', tool.title);
check('and marks its row current', tool.current === 'PX to REM', tool.current);
check('exactly one h1', tool.h1 === 1, `${tool.h1}`);
const shown = (sel) =>
	page.$$eval(sel, (els) =>
		els.filter((el) => el.getClientRects().length > 0).map((el) => el.textContent.trim()),
	);
const barDetail = await shown('.dt-bar-detail');
check('the bar describes the tool', barDetail.length === 1 && barDetail[0].length > 0, barDetail.join());
check('the drawer leaves that to the bar', (await shown('.dt-nav-detail')).length === 0);
check('the document does not scroll, the main pane does', tool.scrolls);

await page.goto('http://localhost:3000/nope', { waitUntil: 'networkidle2' });
await sleep(600);
check(
	'an unknown route renders the 404',
	await page.$('.dt-404-page'),
	await page.$eval('.dt-404-code', (el) => el.textContent.trim()),
);

await visit(page, '/tools/px-to-rem');

// lucide-static bakes 24px attrs
const icons = await page.$$eval('.canon-sidebar-row-icon svg', (els) =>
	els.slice(0, 6).map((el) => Math.round(el.getBoundingClientRect().width)),
);
check(
	'icons size to the row, not to the SVG attribute',
	icons.length > 0 && icons.every((w) => w !== 24),
	icons.join(' '),
);

check(
	'body text uses the self-hosted face',
	await page.evaluate(() =>
		getComputedStyle(document.body).fontFamily.includes(
			'Open Sans Condensed',
		),
	),
	await page.evaluate(
		() => getComputedStyle(document.body).fontFamily.split(',')[0],
	),
);

// crayon.sr-only uses deprecated clip
const srOnly = await page.evaluate(() => {
	const el = document.querySelector('.dt-sr-only');
	if (!el) return null;
	const r = el.getBoundingClientRect();
	return {
		w: Math.round(r.width),
		h: Math.round(r.height),
		clip: getComputedStyle(el).clipPath,
	};
});
check(
	'screen-reader-only text is clipped, not merely small',
	srOnly && srOnly.w <= 1 && srOnly.h <= 1 && srOnly.clip !== 'none',
	JSON.stringify(srOnly),
);

await page.setViewport({ width: 390, height: 844 });
await sleep(500);
await visit(page, '/tools/px-to-rem');
const box = (selector) =>
	page.$eval(selector, (el) => {
		const { x, y, width, height } = el.getBoundingClientRect();
		return [x, y, width, height].map(Math.round);
	});
const [, , sheetWidth, sheetHeight] = await box('.dt-sheet');
check('a phone gets the full width', sheetWidth === 390, `${sheetWidth}`);
check('and the band along the bottom', sheetHeight === 844 - 56, `${sheetHeight}`);
const [, barTop] = await box('.dt-bar');
const [, tabTop] = await box('.dt-tab');
check('the bar and the tab sit in the band', barTop === 788 && tabTop === 788, `${barTop} ${tabTop}`);
await page.click(TOGGLE);
await sleep(500);
const [, drawerTop, , drawerHeight] = await box('.dt-drawer');
check('the tab slides the drawer up', drawerHeight === Math.round(844 * 0.7), `${drawerHeight}`);
check('pushing the page up with it', drawerTop + drawerHeight === 844 && (await box('.dt-tab'))[1] === drawerTop);
check('the document does not scroll', await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight));
const navDetail = await shown('.dt-nav-detail');
check('the current row describes the tool', navDetail.length > 0 && navDetail[0] === barDetail[0], navDetail.join());
await page.setViewport({ width: 1400, height: 844 });
await sleep(500);
check('open on a phone is shut on a wide window', (await box('.dt-drawer'))[2] === 56);
await page.setViewport({ width: 390, height: 844 });
await sleep(500);
check('and back again', (await box('.dt-drawer'))[3] === Math.round(844 * 0.7));
await page.click(TOGGLE);
await sleep(500);
const phoneTab = await (await page.$(TOGGLE)).boundingBox();
await page.mouse.move(phoneTab.x + 40, phoneTab.y + 20);
await page.mouse.down();
for (let i = 1; i <= 10; i += 1) {
	await page.mouse.move(phoneTab.x + 40, phoneTab.y + 20 - i * 15);
	await sleep(16);
}
const phoneDrag = (await box('.dt-drawer'))[3];
await page.mouse.up();
await sleep(500);
check('a drag up follows the pointer', phoneDrag === 150 + 56, `${phoneDrag}`);
check('and short of halfway it shuts', (await box('.dt-drawer'))[3] === 56);

await page.setViewport({ width: 2200, height: 1100 });
await visit(page, '/tools/graph-calc');
const panes = () =>
	page.evaluate(() =>
		['.dt-canon-tool > .canon-split', '.canon-split-main'].map((s) =>
			Math.round(document.querySelector(s).getBoundingClientRect().width),
		),
	);
const [column] = await panes();
check('a canon tool stops at 1200 px', column === 1200, `${column}`);
await page.click('.dt-canon-edge.is-start');
await sleep(400);
const [wide, settings] = await panes();
check('expanding gives the picture the room, less the chevron gutters', wide > 1800, `${wide}`);
check('and keeps the settings at 600 px', settings === 600, `${settings}`);
await page.reload({ waitUntil: 'networkidle2' });
await sleep(600);
check('and survives a reload', (await panes())[0] > 1800);
await visit(page, '/tools/regex-tester');
check('only expands tools get the chevrons', !(await page.$('.dt-canon-edge.is-start')));

await finish(browser);
