// canon editor frame: column, rail, title, bar, compact fan, phone row

import { launch, check, finish, sleep, BASE } from './harness.mjs';

async function open(page, width, height) {
	await page.setViewport({ width, height });
	await page.goto(`${BASE}/editor`, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__substrata, { timeout: 25000 });
	await page.evaluate(() => localStorage.clear());
	await page.reload({ waitUntil: 'load' });
	await page.waitForFunction(() => window.__substrataUi, { timeout: 25000 });
	await page.evaluate(() =>
		window.__substrata.addRaster(800, 1000, [
			{ x: 0, y: 0, w: 800, h: 1000, colour: '#7a9cc0' },
		]),
	);
	await sleep(600);
}

const rect = (page, sel) =>
	page.evaluate((s) => {
		const r = document.querySelector(s)?.getBoundingClientRect();
		return r && { l: r.left, t: r.top, r: r.right, b: r.bottom };
	}, sel);

const click = (page, label) =>
	page.evaluate((l) => {
		const b = [...document.querySelectorAll('.sub-ed button')].find(
			(x) => (x.getAttribute('aria-label') ?? x.title) === l,
		);
		b?.click();
		return !!b;
	}, label);

const { browser, page } = await launch();
// unsaved scenes ask before leaving
page.on('dialog', (d) => void d.accept());

// wide
await open(page, 1400, 1000);
const ed = await rect(page, '.sub-ed');
check('editor fills the window', ed.l === 0 && ed.t === 0 && ed.r === 1400 && ed.b === 1000);
check(
	'document does not scroll',
	await page.evaluate(
		() => document.scrollingElement.scrollHeight <= innerHeight,
	),
);
const column = await rect(page, '.sub-ed-column');
check('column on the trailing edge, 16 px in', column.r === 1384, JSON.stringify(column));
const tools = await page.$$eval('.sub-ed-tools .sub-cell', (c) => c.length);
check('full omnibar shows seven tools', tools === 7, String(tools));
const unnamed = await page.$$eval('.sub-ed button', (bs) =>
	bs.filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim())).length,
);
check('every button is named', unnamed === 0, String(unnamed));
const title = await rect(page, '.sub-ed-title');
check('title centred', Math.abs((title.l + title.r) / 2 - 700) < 1, JSON.stringify(title));

const board = await page.evaluate(() => {
	const vt = window.__substrata.vt();
	return vt;
});
check('canvas viewport readable', Array.isArray(board), JSON.stringify(board));

await click(page, 'Layers');
await click(page, 'FX');
await click(page, 'Inspector');
await sleep(300);
const order = await page.$$eval('.sub-ed-rail [data-panel]', (ps) =>
	ps.map((p) => p.dataset.panel),
);
check('rail keeps the column order', order.join() === 'layers,inspector,fx', order.join());
const rail = await rect(page, '.sub-ed-rail');
check('rail sits left of the column', rail.r + 8 === column.l, `${rail.r} ${column.l}`);
await page.evaluate(() =>
	document
		.querySelector('[data-panel=fx] .sub-panel-header [aria-label=Close]')
		.click(),
);
await sleep(200);
check(
	'close cell closes its panel',
	(await page.$$('.sub-ed-rail [data-panel=fx]')).length === 0,
);

await click(page, 'Crop');
await sleep(100);
check(
	'crop tool selected',
	await page.evaluate(() =>
		document.querySelector('[aria-label=Crop]').classList.contains('canon-button--filled'),
	),
);
await page.keyboard.press('v');
await sleep(100);
check(
	'V goes back to move',
	await page.evaluate(() =>
		document.querySelector('.sub-ed-tools [aria-label=Move]').classList.contains('canon-button--filled'),
	),
);

// bar dragged to the leading edge
const bar = await rect(page, '.sub-ed-bar .sub-cells');
await page.mouse.move(bar.l + 4, (bar.t + bar.b) / 2);
await page.mouse.down();
await page.mouse.move(200, 500, { steps: 8 });
await page.mouse.move(30, 500, { steps: 8 });
await page.mouse.up();
await sleep(200);
check(
	'bar dropped on the leading edge',
	await page.evaluate(() => window.__substrataUi.settingsEdge === 'leading'),
);
const barNow = await rect(page, '.sub-ed-bar .sub-cells');
check('bar lies along the leading edge', barNow.l === 16, JSON.stringify(barNow));
await page.evaluate(() => window.__substrataUi.setSettingsEdge('bottom'));

await click(page, 'Hide Tools');
await sleep(100);
check('tools tab hides the omnibar', (await page.$$('.sub-ed-omni.is-hidden')).length === 1);
await click(page, 'Show Tools');

// compact
await open(page, 1200, 680);
check('short window: compact column', (await page.$$('.sub-ed.is-compact')).length === 1);
check('compact: one tool cell', (await page.$$eval('.sub-ed-tools .sub-cell', (c) => c.length)) === 1);
check('compact: no redo', !(await click(page, 'Redo')));
await page.evaluate(() => document.querySelector('.sub-ed-tools .sub-cell').click());
await sleep(400);
check('tool key blooms seven tools', (await page.$$('.sub-ed-bloom .sub-cell')).length === 7);
await page.evaluate(() =>
	document.querySelector('.sub-ed-bloom [aria-label=Text]').click(),
);
await sleep(200);
check('picking from the fan closes it', (await page.$$('.sub-ed-bloom')).length === 0);
check(
	'fan picked text',
	await page.evaluate(
		() => document.querySelector('.sub-ed-tools .sub-cell').getAttribute('aria-label') === 'Text',
	),
);

// phone
await open(page, 390, 844);
check('narrow portrait: phone layout', (await page.$$('.sub-ed.is-phone')).length === 1);
const row = await rect(page, '.sub-ed-row');
check('bottom row 16 px from the edges', row.l === 16 && row.r === 374 && row.b === 828, JSON.stringify(row));
await click(page, 'Layers');
await click(page, 'Inspector');
await sleep(300);
const tray = await page.$$eval('.sub-ed-rail [data-panel]', (ps) => ps.map((p) => p.dataset.panel));
check('tray holds the last opened panel only', tray.join() === 'inspector', tray.join());
const trayRect = await rect(page, '.sub-ed-rail');
check('tray ends above the row', trayRect.b + 8 <= row.t, `${trayRect.b} ${row.t}`);
check(
	'no horizontal scroll',
	await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth),
);

await finish(browser);
