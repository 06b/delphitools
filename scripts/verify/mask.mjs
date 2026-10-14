// needs `npm start` on :3000
import { BASE, check, finish, launch, sleep } from './harness.mjs';

const { browser, page } = await launch({ viewport: { width: 1460, height: 900 } });
await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__substrata, { timeout: 25000 });
await sleep(600);

const vt = await page.evaluate(() => window.__substrata.vt());
const rect = await page.evaluate(() => {
	const r = document.querySelector('canvas.upper-canvas').getBoundingClientRect();
	return { left: r.left, top: r.top };
});
const toPage = (sx, sy) => ({ x: rect.left + sx * vt[0] + vt[4], y: rect.top + sy * vt[3] + vt[5] });
const sample = (sx, sy) => {
	const p = toPage(sx, sy);
	return page.evaluate(([x, y]) => window.__substrata.samplePixel(x, y), [p.x - rect.left, p.y - rect.top]);
};
const near = (px, rgba, tol = 12) => !!px && rgba.every((v, i) => Math.abs(px[i] - v) <= tol);
const layers = () => page.evaluate(() => window.__substrata.layers());
const undo = async () => {
	await page.keyboard.down('Meta');
	await page.keyboard.press('z');
	await page.keyboard.up('Meta');
	await sleep(300);
};
const drag = async (x0, y0, x1, y1) => {
	const a = toPage(x0, y0);
	const b = toPage(x1, y1);
	await page.mouse.move(a.x, a.y);
	await page.mouse.down();
	await page.mouse.move(b.x, b.y, { steps: 8 });
	await page.mouse.up();
	await sleep(300);
};

const GREEN = [62, 107, 51, 255];
const WHITE = [255, 255, 255, 255];
// apex at top centre
const TRI = { d: 'M50 4L96 96L4 96Z', label: 'Tri' };

// spans 600..1000 x 300..600
await page.evaluate(() =>
	window.__substrata.addRaster(400, 300, [{ x: 0, y: 0, w: 400, h: 300, colour: '#3e6b33' }], { x: 800, y: 450 }),
);
await sleep(700);
let ls = await layers();
check('setup: raster added without a mask', ls.length === 1 && ls[0].mask === null, JSON.stringify(ls[0]?.mask));
const id = ls[0].id;

await page.evaluate((lid, mask) => window.__substrata.setMask(lid, mask), id, TRI);
await sleep(300);
ls = await layers();
check('rig: setMask round-trips', ls[0]?.mask?.label === 'Tri', JSON.stringify(ls[0]?.mask));
let px = await sample(620, 320);
check('mask: corner outside the triangle shows artboard white', near(px, WHITE), px?.join(','));
px = await sample(800, 550);
check('mask: inside the triangle keeps the fill', near(px, GREEN), px?.join(','));

await undo();
ls = await layers();
px = await sample(620, 320);
check('undo: one step clears the mask and the pixels', ls[0]?.mask === null && near(px, GREEN), `mask=${JSON.stringify(ls[0]?.mask)} px=${px?.join(',')}`);

await page.evaluate((lid, mask) => {
	window.__substrata.setMask(lid, mask);
	window.__substrata.setCrop(lid, { x: 0, y: 0, w: 200, h: 300 });
}, id, TRI);
await sleep(300);
px = await sample(700, 550);
check('mask + crop: kept region keeps the fill', near(px, GREEN), px?.join(','));
px = await sample(950, 550);
check('mask + crop: cropped half is white inside the triangle', near(px, WHITE), px?.join(','));
px = await sample(620, 320);
check('mask + crop: masked corner is white inside the crop', near(px, WHITE), px?.join(','));

await page.evaluate((lid) => window.__substrata.setCrop(lid, null), id);
await sleep(300);
px = await sample(950, 550);
check('crop cleared: the mask alone shows the right half again', near(px, GREEN), px?.join(','));

await page.evaluate(() => window.__substrata.setTool('move', 'move'));
await drag(800, 450, 1000, 450);
ls = await layers();
px = await sample(820, 320);
const kept = await sample(1000, 550);
check(
	'move: mask survives the drag',
	ls[0]?.mask?.label === 'Tri' && Math.abs(ls[0]?.scene.x - 1000) < 3 && near(px, WHITE) && near(kept, GREEN),
	`mask=${ls[0]?.mask?.label} scene=${JSON.stringify(ls[0]?.scene)} corner=${px?.join(',')} kept=${kept?.join(',')}`,
);

const P = '[data-panel=inspector]';
await page.evaluate(() => window.__substrataUi.toggle('inspector'));
await sleep(400);
const maskRow = () =>
	page.evaluate((p) => {
		const head = [...document.querySelectorAll(`${p} .canon-heading`)].find((h) => h.textContent.trim() === 'Mask');
		return head?.nextElementSibling?.querySelector('.canon-row-title')?.textContent.trim() ?? null;
	}, P);
const section = { label: await maskRow(), grid: await page.evaluate((p) => !!document.querySelector(`${p} .sub-ip-mask-grid`), P) };
check('inspector shows the current mask', section.label === 'Tri' && !section.grid, JSON.stringify(section));
await page.evaluate((p) => [...document.querySelectorAll(`${p} .sub-ip-mask button`)].find((b) => /shapes/i.test(b.textContent)).click(), P);
await sleep(400);
const cells = await page.evaluate(() => document.querySelectorAll('.sub-ip-mask-grid .dt-masker-cell').length);
check('shapes button unfolds the grid', cells === 336, `${cells}`);
await page.evaluate(() => document.querySelector('.dt-masker-cell[title="Heart 1"]').click());
await sleep(400);
ls = await layers();
const shown = await maskRow();
check('picking a cell writes the layer mask', ls[0]?.mask?.label === 'Heart 1' && shown === 'Heart 1', `${ls[0]?.mask?.label} / ${shown}`);
await page.evaluate((p) => document.querySelector(`${p} button[aria-label="Clear mask"]`).click(), P);
await sleep(300);
ls = await layers();
check('clear button removes the mask', ls[0]?.mask === null, JSON.stringify(ls[0]?.mask));

await finish(browser);
