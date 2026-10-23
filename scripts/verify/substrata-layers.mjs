// the canon layers panel and layer menu card: rows, fold, keys, card,
// canvas menu, pin; needs the dev server (BASE_URL)
import { BASE, check, finish, launch, sleep } from './harness.mjs';

const { browser, page } = await launch({
	viewport: { width: 1400, height: 1000 },
});

const open = async () => {
	await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle2' });
	await page.waitForFunction(
		() => window.__substrata && window.__substrataUi,
		{ timeout: 20000 },
	);
	await sleep(300);
};
const layers = () => page.evaluate(() => window.__substrata.layers());
const ids = async () => (await layers()).map((l) => l.id);
const rowIds = () =>
	page.evaluate(() =>
		[...document.querySelectorAll('.sub-layer-row')].map(
			(r) => r.dataset.layerRow,
		),
	);
const has = (sel) => page.evaluate((s) => !!document.querySelector(s), sel);
const attr = (sel, name) =>
	page.evaluate(
		([s, n]) => document.querySelector(s)?.getAttribute(n) ?? null,
		[sel, name],
	);
const main = (id) => `.sub-layer-main[data-layer-id="${id}"]`;
const row = (id) => `.sub-layer-row[data-layer-row="${id}"]`;
const clickText = (sel, text) =>
	page.evaluate(
		([s, t]) => {
			const el = [...document.querySelectorAll(s)].find(
				(e) => e.textContent.trim() === t,
			);
			el?.click();
			return !!el;
		},
		[sel, text],
	);
const press = async (key, mods = []) => {
	for (const m of mods) await page.keyboard.down(m);
	await page.keyboard.press(key);
	for (const m of mods.reverse()) await page.keyboard.up(m);
	await sleep(250);
};
const focusedId = () =>
	page.evaluate(() => document.activeElement?.dataset?.layerId ?? null);
const addRasters = () =>
	page.evaluate(async () => {
		const s = window.__substrata;
		for (const [w, h, colour] of [
			[600, 400, '#6a8fb5'],
			[200, 200, '#e0a040'],
			[300, 120, '#2f5d3a'],
		])
			await s.addRaster(w, h, [{ x: 0, y: 0, w, h, colour }]);
	});

await open();
await page.evaluate(() => {
	localStorage.clear();
	window.__substrataUi.toggle('layers');
});
await sleep(300);
check('panel: opens in the rail', await has('.sub-rail-panel[data-panel="layers"]'));
check(
	'panel: empty row before any layer',
	await page.evaluate(() =>
		document.querySelector('.sub-layers-empty')?.textContent.includes('Add an image'),
	),
);
const headerLabels = await page.evaluate(() =>
	[
		...document.querySelectorAll(
			'.sub-rail-panel[data-panel="layers"] .sub-panel-header button',
		),
	].map((b) => b.getAttribute('aria-label') ?? b.textContent.trim()),
);
check(
	'header: Add Layer, Select, Pin, Close',
	['Add Layer', 'Select', 'Pin', 'Close'].every((l) => headerLabels.includes(l)),
	headerLabels.join(','),
);
check('pin: pinned by default, as iOS', (await attr('[aria-label="Pin"]', 'aria-pressed')) === 'true');

await addRasters();
await sleep(400);
let all = await ids();
let shown = await rowIds();
check('rows: one per layer, top of the stack first', shown.join() === [...all].reverse().join(), shown.join());
const [bottom, middle, top] = all;
check('row: kind and blend subtitle', (await page.$eval(`${row(top)} .sub-layer-kind`, (e) => e.textContent.trim())) === 'Image · Normal');

const unnamed = await page.evaluate(() =>
	[...document.querySelectorAll('.sub-rail-panel[data-panel="layers"] button')]
		.filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim()))
		.map((b) => b.className),
);
check('a11y: every panel button has a name', unnamed.length === 0, unnamed.join(' '));

// tap: select and fold out; second tap folds away
await page.click(main(middle));
await sleep(250);
check('tap: selects the row', (await attr(main(middle), 'aria-pressed')) === 'true');
check('tap: active row has the leading bar', await has(`${row(middle)}.is-active`));
check('tap: folds out opacity and blend', await has('.sub-layer-fold .canon-slider'));
const before = (await layers()).find((l) => l.id === middle)?.scene;
await page.focus('.sub-layer-fold .canon-slider');
await press('ArrowLeft');
await press('ArrowLeft');
check('fold: arrow keys set opacity', Math.abs(+(await attr('.sub-layer-fold .canon-slider', 'aria-valuenow')) - 0.9) < 1e-6);
await page.evaluate(() => {
	const sel = document.querySelector('.sub-layer-fold select');
	sel.value = [...sel.options].find((o) => o.textContent === 'Multiply').value;
	sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await sleep(250);
check('fold: blend writes the layer', (await page.$eval(`${row(middle)} .sub-layer-kind`, (e) => e.textContent.trim())) === 'Image · Multiply');
await press('z', ['Meta']);
await press('z', ['Meta']);
await press('z', ['Meta']);
check('fold: arrows on the slider leave the layer in place', (await layers()).find((l) => l.id === middle)?.scene.x === before.x);
check('fold: undo restores blend and opacity', (await page.$eval(`${row(middle)} .sub-layer-kind`, (e) => e.textContent.trim())) === 'Image · Normal' && Math.abs(+(await attr('.sub-layer-fold .canon-slider', 'aria-valuenow')) - 1) < 1e-6);
await page.click(main(middle));
await sleep(250);
check('tap again: folds away', !(await has('.sub-layer-fold')));

// lamp and lock
await page.click(`${row(top)} .sub-layer-lamp`);
await sleep(200);
check('lamp: hides the layer', await has(`${row(top)}.is-hidden`));
await page.click(`${row(top)} .sub-layer-lamp`);
await page.click(`${row(top)} .sub-layer-toggle`);
await sleep(200);
check('lock: locks the layer', await has(`${row(top)} .sub-layer-toggle.is-on`));
await page.click(`${row(top)} .sub-layer-toggle`);
await sleep(150);

// keyboard: arrows move the selection, shift extends, alt restacks
await page.focus(main(top));
await press('ArrowDown');
check('keys: ArrowDown selects the next row', (await attr(main(middle), 'aria-pressed')) === 'true' && (await focusedId()) === middle);
await press('ArrowDown', ['Shift']);
check('keys: Shift+ArrowDown extends', (await attr(main(middle), 'aria-pressed')) === 'true' && (await attr(main(bottom), 'aria-pressed')) === 'true');
await press('ArrowUp');
await press('ArrowUp', ['Alt']);
all = await ids();
check('keys: Alt+ArrowUp brings the layer forward', all[2] === middle, all.join());
check('keys: focus stays on the moved row', (await focusedId()) === middle);
await press('Enter');
check('rename: Enter opens the field', await has(`${row(middle)} .sub-layer-rename`));
await page.keyboard.type('Sun');
await press('Enter');
check('rename: Enter writes the name', (await layers()).find((l) => l.id === middle)?.name === 'Sun');
check('rename: focus back on the row', (await focusedId()) === middle);

// the menu card from the keyboard
await press('F10', ['Shift']);
check('menu: Shift+F10 opens the card', await has('[data-layer-menu]'));
check('menu: card is beside the panel', await page.evaluate(() => {
	const card = document.querySelector('.sub-card').getBoundingClientRect();
	const panel = document.querySelector('.sub-rail-panel').getBoundingClientRect();
	return card.right <= panel.left;
}));
await press('Escape');
check('menu: Esc closes it', !(await has('[data-layer-menu]')));
check('menu: focus back on the row', (await focusedId()) === middle);
await press('ContextMenu');
check('menu: context-menu key opens it', await has('[data-layer-menu]'));
await clickText('.sub-menu-card', 'Visible');
await sleep(200);
check('menu: Visible lamp hides, card stays', await has(`${row(middle)}.is-hidden`) && (await has('[data-layer-menu]')));
await clickText('.sub-menu-card', 'Visible');
await clickText('.sub-menu-row-title', 'More Options');
await sleep(200);
check('menu: More Options grows the card', await has('[data-layer-menu] .sub-menu-row') && (await clickText('.sub-menu-row-title', 'Duplicate')));
await sleep(300);
check('menu: Duplicate adds a layer and closes', (await ids()).length === 4 && !(await has('[data-layer-menu]')));
await press('z', ['Meta']);

// right click on a row, then restack and delete from the card
await page.click(main(bottom), { button: 'right' });
await sleep(250);
check('right click: opens the card on that row', await has('[data-layer-menu]') && (await attr(main(bottom), 'aria-pressed')) === 'true');
await clickText('.sub-menu-row-title', 'More Options');
await clickText('.sub-menu-row-title', 'Bring to Front');
await sleep(250);
all = await ids();
check('menu: Bring to Front restacks', all[all.length - 1] === bottom, all.join());
await press('z', ['Meta']);

// select mode, group from the card, fold the group
await page.click('[data-panel="layers"] [aria-label="Select"]');
await page.click(main(top));
await sleep(150);
const picked = await page.evaluate(() => document.querySelectorAll('.sub-layer-main[aria-pressed="true"]').length);
check('select mode: taps pick several', picked >= 2, String(picked));
await page.click(main(bottom), { button: 'right' });
await sleep(200);
await clickText('.sub-menu-row-title', 'More Options');
await clickText('.sub-menu-row-title', 'Group');
await sleep(300);
check('menu: Group makes a group row', await has('.sub-layer-thumb.is-group'));
const groupRows = (await rowIds()).length;
await page.click('.sub-layer-row:has(.sub-layer-thumb.is-group) .sub-layer-toggle');
await sleep(200);
check('group: chevron folds the children away', (await rowIds()).length < groupRows);
await page.focus('.sub-layer-row:has(.sub-layer-thumb.is-group) .sub-layer-main');
await press('ArrowRight');
check('group: ArrowRight opens it again', (await rowIds()).length === groupRows);
await press('z', ['Meta']);

// pointer drag restack
const order0 = await rowIds();
const from = await page.$eval(row(order0[0]), (e) => { const r = e.getBoundingClientRect(); return { x: r.left + 120, y: r.top + r.height / 2 }; });
const to = await page.$eval(row(order0[2]), (e) => { const r = e.getBoundingClientRect(); return { x: r.left + 120, y: r.bottom - 4 }; });
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(from.x, from.y + 10, { steps: 3 });
await page.mouse.move(to.x, to.y, { steps: 12 });
await sleep(200);
await page.mouse.up();
await sleep(400);
const order1 = await rowIds();
check('drag: a row dragged down restacks', order1[2] === order0[0], order1.join());

// canvas right clicks anchor at the pointer
await page.evaluate(() => window.__substrata.setTool('move'));
const shot = (await layers()).find((l) => l.id === top)?.screen;
const canvasBox = await page.$eval('canvas.upper-canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top }; });
await page.mouse.click(canvasBox.x + shot.x, canvasBox.y + shot.y, { button: 'right' });
await sleep(300);
const cardAt = await page.evaluate(() => document.querySelector('.sub-card')?.getBoundingClientRect().left ?? -1);
check('canvas: right click on a layer opens the card at the pointer', (await has('[data-layer-menu]')) && Math.abs(cardAt - (canvasBox.x + shot.x + 8)) < 2, String(cardAt));
await press('Escape');
await page.mouse.click(60, 900, { button: 'right' });
await sleep(300);
check('canvas: empty canvas gets the canvas card', await has('[data-canvas-menu]'));
const gridBefore = await page.evaluate(() => [...document.querySelectorAll('.sub-menu-card')].find((b) => b.textContent.includes('Grid'))?.getAttribute('aria-pressed'));
await clickText('.sub-menu-card', 'Grid');
await sleep(150);
const gridAfter = await page.evaluate(() => [...document.querySelectorAll('.sub-menu-card')].find((b) => b.textContent.includes('Grid'))?.getAttribute('aria-pressed'));
check('canvas card: Grid lamp latches', gridBefore !== gridAfter, `${gridBefore}→${gridAfter}`);
await clickText('.sub-menu-card', 'Grid');
await page.mouse.click(30, 980);
await sleep(200);
check('canvas card: a click outside closes it', !(await has('[data-canvas-menu]')));

// add layer card
await page.click('[data-panel="layers"] [aria-label="Add Layer"]');
await sleep(200);
check('add: card offers Image, Text, Shape', await page.evaluate(() => ['Image', 'Text', 'Shape'].every((t) => [...document.querySelectorAll('.sub-lm-add .sub-menu-card')].some((b) => b.textContent.trim() === t))));
await clickText('.sub-lm-add .sub-menu-card', 'Text');
await sleep(200);
check('add: Text picks the text tool', await has('.sub-ed-tools [title="Text"].canon-button--filled'));
await page.evaluate(() => window.__substrata.setTool('move'));

// unpinned: a press outside closes the panel; pinned it stays
await page.click('[data-panel="layers"] [aria-label="Pin"]');
await sleep(100);
await page.mouse.click(60, 900);
await sleep(250);
check('unpinned: a press outside closes the panel', !(await has('.sub-rail-panel[data-panel="layers"]')));
await page.evaluate(() => window.__substrataUi.toggle('layers'));
await sleep(200);
await page.click('[data-panel="layers"] [aria-label="Pin"]');
await page.mouse.click(60, 900);
await sleep(250);
check('pinned: the panel stays', await has('.sub-rail-panel[data-panel="layers"]'));

// phone: the panel in the tray, no sideways scroll
await page.setViewport({ width: 390, height: 844 });
await sleep(500);
const phone = await page.evaluate(() => {
	const p = document.querySelector('.sub-rail-panel[data-panel="layers"]')?.getBoundingClientRect();
	return { fits: !!p && p.left >= 0 && p.right <= innerWidth, scroll: document.documentElement.scrollWidth <= innerWidth };
});
check('phone: panel fits the width', phone.fits && phone.scroll, JSON.stringify(phone));
const first = (await rowIds())[0];
await page.click(main(first), { button: 'right' });
await sleep(300);
const card = await page.evaluate(() => { const r = document.querySelector('.sub-card')?.getBoundingClientRect(); return r && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
check('phone: the card stays on screen', card === true);

await finish(browser);
