// the canon inspector panel; needs the dev server (BASE_URL)
import { BASE, check, finish, launch, sleep } from './harness.mjs';

const { browser, page } = await launch({ viewport: { width: 1400, height: 1000 } });
await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__substrata && window.__substrataUi, { timeout: 25000 });
await sleep(600);

const P = '[data-panel=inspector]';
const layers = () => page.evaluate(() => window.__substrata.layers());
const undo = async () => {
	await page.keyboard.down('Meta');
	await page.keyboard.press('z');
	await page.keyboard.up('Meta');
	await sleep(300);
};
const headings = () => page.evaluate((p) => [...document.querySelectorAll(`${p} .sub-ip .canon-heading`)].map((h) => h.textContent.trim()), P);
// the control in the row titled `title`, nth match
const rowSel = (title, inner, nth = 0) =>
	page.evaluateHandle(
		(p, t, i, n) => {
			const rows = [...document.querySelectorAll(`${p} .canon-row`)].filter(
				(r) => r.querySelector('.canon-row-title')?.textContent.trim() === t,
			);
			return rows[n]?.querySelector(i) ?? null;
		},
		P,
		title,
		inner,
		nth,
	);
const fieldValue = async (title, nth = 0) => (await rowSel(title, 'input', nth)).evaluate((el) => el?.value ?? null);
const typeInto = async (title, text, nth = 0) => {
	const el = await rowSel(title, 'input', nth);
	await el.evaluate((e) => {
		e.focus();
		e.select();
	});
	await page.keyboard.type(text);
	await page.keyboard.press('Enter');
	await sleep(300);
};
const clickLabel = async (label) => {
	await page.evaluate((p, l) => document.querySelector(`${p} button[aria-label="${l}"]`)?.click(), P, label);
	await sleep(300);
};
const unnamed = () =>
	page.evaluate((p) => {
		const named = (el) => {
			const by = el.getAttribute('aria-labelledby');
			const ref = by && by.split(' ').map((id) => document.getElementById(id)?.textContent.trim()).join('');
			return Boolean(el.getAttribute('aria-label') || ref || el.textContent.trim() || el.title || el.closest('label')?.textContent.trim());
		};
		return [...document.querySelectorAll(`${p} button, ${p} input, ${p} select, ${p} textarea, ${p} [role=slider]`)]
			.filter((el) => !named(el))
			.map((el) => el.outerHTML.slice(0, 80));
	}, P);
const overflow = () =>
	page.evaluate((p) => {
		const body = document.querySelector(`${p} .sub-rail-body`);
		return body.scrollWidth - body.clientWidth;
	}, P);

await page.evaluate(() => window.__substrataUi.toggle('inspector'));
await sleep(400);

// nothing selected: the artboard
check('panel renders in the rail', await page.evaluate((p) => !!document.querySelector(`.sub-ed-rail ${p}`), P));
let h = await headings();
check('no selection shows the Artboard section only', JSON.stringify(h) === '["Artboard"]', JSON.stringify(h));
check('Width reads the artboard', (await fieldValue('Width')) === '2000', await fieldValue('Width'));
await typeInto('Width', '2400');
check('typed width commits on Enter', (await fieldValue('Width')) === '2400', await fieldValue('Width'));
await typeInto('Width', '*2');
check('an expression acts on the value (*2)', (await fieldValue('Width')) === '4800', await fieldValue('Width'));
await undo();
await undo();
check('each commit is one undo step', (await fieldValue('Width')) === '2000', await fieldValue('Width'));
const hasBackground = () => page.evaluate((p) => [...document.querySelectorAll(`${p} .canon-row-title`)].some((t) => t.textContent.trim() === 'Background'), P);
check('opaque artboard shows Background', await hasBackground());
await (await rowSel('Transparent', 'input')).click();
await sleep(300);
check('Transparent hides Background', !(await hasBackground()));
await undo();
check('artboard: every control has a name', (await unnamed()).length === 0, JSON.stringify(await unnamed()));

// a raster
await page.evaluate(() => window.__substrata.addRaster(400, 300, [{ x: 0, y: 0, w: 400, h: 300, colour: '#3e6b33' }], { x: 1400, y: 400 }));
await sleep(600);
h = await headings();
check(
	'a raster shows Transform, Image, Mask, Align',
	['Transform', 'Image', 'Mask', 'Align', 'Distribute', 'Rotate and flip', 'Group'].every((x) => h.includes(x)),
	JSON.stringify(h),
);
let id = (await layers())[0].id;

const x0 = (await layers())[0].scene.x;
const xField = await rowSel('X', 'input');
await xField.click();
const sel = await xField.evaluate((el) => [el.selectionStart, el.selectionEnd, el.value.length]);
check('focus selects the whole value', sel[0] === 0 && sel[1] === sel[2], JSON.stringify(sel));
await page.keyboard.type('+100');
await page.keyboard.press('Enter');
await sleep(300);
let x1 = (await layers())[0].scene.x;
check('X takes "+100" relative to the value', Math.abs(x1 - x0 - 100) < 0.5, `${x0} -> ${x1}`);

await (await rowSel('Y', 'input')).click();
const y0 = (await layers())[0].scene.y;
await page.keyboard.press('ArrowUp');
await sleep(150);
await page.keyboard.down('Shift');
await page.keyboard.press('ArrowUp');
await page.keyboard.up('Shift');
await sleep(300);
const y1 = (await layers())[0].scene.y;
check('ArrowUp steps 1, Shift+ArrowUp steps 10', Math.abs(y1 - y0 - 11) < 0.5, `${y0} -> ${y1}`);
await page.keyboard.press('Escape');

await (await rowSel('X', 'button[aria-label="Increase"]')).click();
await sleep(300);
check('stepper plus adds 1', Math.abs((await layers())[0].scene.x - x1 - 1) < 0.5);

await typeInto('W', '200');
check('W sets the width from the natural size', (await fieldValue('Scale')) === '50' || (await fieldValue('W')) === '200', await fieldValue('W'));
await typeInto('Scale', '100');
check('Scale ties both axes', (await fieldValue('W')) === '400' && (await fieldValue('H')) === '300', `${await fieldValue('W')} x ${await fieldValue('H')}`);

await typeInto('Name', 'Photo');
check('Name renames the layer', (await layers())[0].name === 'Photo', (await layers())[0].name);

const slider = await rowSel('Opacity', '[role=slider]');
const box = await slider.boundingBox();
// an undo remounts the slider; re-query each read
const readOpacity = async () => (await rowSel('Opacity', '[role=slider]')).evaluate((el) => Number(el.getAttribute('aria-valuenow')));
await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * (0.6 - i * 0.05), box.y + box.height / 2);
await page.mouse.up();
await sleep(300);
const dragged = await readOpacity();
check('a slider drag changes opacity', dragged < 0.95, String(dragged));
await undo();
check('the drag is one undo step', (await readOpacity()) === 1, String(await readOpacity()));
await (await rowSel('Opacity', '[role=slider]')).focus();
await page.keyboard.press('ArrowLeft');
await sleep(200);
check('the slider takes arrow keys', (await readOpacity()) < 1, String(await readOpacity()));
await undo();

const blend = await rowSel('Blend', 'select');
await blend.select('1');
await sleep(300);
const blendTitle = await (await rowSel('Blend', '.canon-menu-cell-title')).evaluate((el) => el.textContent.trim());
check('Blend menu sets the mode', blendTitle === 'Multiply', blendTitle);

await clickLabel('Align left');
check('Align left snaps to the artboard edge', Math.abs((await layers())[0].scene.x - 200) < 0.5, JSON.stringify((await layers())[0].scene));
await clickLabel('Flip horizontal');
const lit = await page.evaluate((p) => document.querySelector(`${p} button[aria-label="Flip horizontal"]`).getAttribute('aria-pressed'), P);
check('Flip horizontal lights its cell', lit === 'true', lit);
const distOff = await page.evaluate((p) => document.querySelector(`${p} button[aria-label="Distribute horizontally"]`).disabled, P);
check('Distribute greys out under 3 layers', distOff);
check('raster: every control has a name', (await unnamed()).length === 0, JSON.stringify(await unnamed()));
check('raster: no sideways overflow', (await overflow()) <= 0, String(await overflow()));

// several layers: shared rows, group
for (const at of [{ x: 300, y: 1100 }, { x: 900, y: 1100 }]) {
	await page.evaluate((p) => window.__substrata.addRaster(100, 100, [{ x: 0, y: 0, w: 100, h: 100, colour: '#cc2200' }], p), at);
	await sleep(500);
}
await page.evaluate(() => window.__substrata.select(window.__substrata.layers().map((l) => l.id)));
await sleep(300);
h = await headings();
check('several layers show Selection', h[0] === 'Selection' && !h.includes('Transform'), JSON.stringify(h));
await page.evaluate((p) => {
	const s = [...document.querySelectorAll(`${p} [role=slider]`)][0];
	s.focus();
}, P);
await page.keyboard.press('Home');
await sleep(300);
await page.evaluate(() => window.__substrata.select([window.__substrata.layers()[1].id]));
await sleep(300);
const other = await (await rowSel('Opacity', '[role=slider]')).evaluate((el) => el.getAttribute('aria-valuenow'));
check('shared opacity reaches every selected layer', other === '0', other);
await undo();
await page.evaluate(() => window.__substrata.select(window.__substrata.layers().map((l) => l.id)));
await sleep(300);
check('Distribute enables with 3 selected', !(await page.evaluate((p) => document.querySelector(`${p} button[aria-label="Distribute horizontally"]`).disabled, P)));
await clickLabel('Group');
h = await headings();
const parents = new Set((await layers()).map((l) => l.parent));
check('Group groups the selection', parents.size === 1 && !parents.has(null), JSON.stringify([...parents]));
check('a group shows Name, Opacity and Layers', !h.includes('Transform') && (await page.evaluate((p) => document.querySelector(`${p} .sub-ip-fact`)?.textContent, P)) === '3');
await clickLabel('Ungroup');
check('Ungroup dissolves it', (await layers()).every((l) => l.parent === null));

// a shape: fill well and the ring
await page.evaluate(() => window.__substrata.select([]));
await page.evaluate(() => {
	window.__substrata.setTool('pieces', 'primitives');
	window.__substrata.toolSettings('pieces', { shape: 'rectangle', fill: '#cc2200', stroke: null, cornerRadius: 0 });
});
const vt = await page.evaluate(() => window.__substrata.vt());
const rect = await page.evaluate(() => {
	const r = document.querySelector('canvas.upper-canvas').getBoundingClientRect();
	return { left: r.left, top: r.top };
});
const toPage = (sx, sy) => ({ x: rect.left + sx * vt[0] + vt[4], y: rect.top + sy * vt[3] + vt[5] });
const a = toPage(1000, 600);
const b = toPage(1300, 800);
await page.mouse.move(a.x, a.y);
await page.mouse.down();
await page.mouse.move(b.x, b.y, { steps: 8 });
await page.mouse.up();
await sleep(400);
await page.evaluate(() => window.__substrata.setTool('move', 'move'));
await sleep(300);
h = await headings();
check('a shape shows the Shape section', h.includes('Shape'), JSON.stringify(h));
const clickRadio = async (t) => {
	await page.evaluate((p, x) => [...document.querySelectorAll(`${p} [role=radio]`)].find((b) => b.textContent.trim() === x)?.click(), P, t);
	await sleep(300);
};
const checked = (t) =>
	page.evaluate((p, x) => [...document.querySelectorAll(`${p} [role=radio]`)].find((b) => b.textContent.trim() === x)?.getAttribute('aria-checked'), P, t);
await clickRadio('Gradient');
check('Fill Gradient shows the gradient editor', (await checked('Linear')) === 'true');
await undo();
check('undo puts the Fill choice back to Solid', (await checked('Solid')) === 'true', await checked('Solid'));
await clickRadio('Gradient');
check('Gradient can be picked again after the undo', (await checked('Linear')) === 'true');
await undo();
const hex = () => fieldValue('Colour');
await typeInto('Colour', '00ff00');
check('the hex field sets the fill', (await hex()) === '00ff00', await hex());
await clickLabel('Fill colour');
const ring = await page.evaluate(() => ({ open: window.__substrataUi.ringOpen, hex: window.__substrataUi.ringTarget?.hex }));
check('the swatch opens the ring aimed at the well', ring.open && ring.hex === '#00ff00', JSON.stringify(ring));
await page.evaluate(() => {
	const t = window.__substrataUi.ringTarget;
	t.send('#0000ff', 1, false);
	t.send('#ff00ff', 1, false);
	t.send('#ffff00', 1, true);
	window.__substrataUi.closeRing();
});
await sleep(300);
check('ring sends write the fill', (await hex()) === 'ffff00', await hex());
await undo();
check('a ring stream is one undo step', (await hex()) === '00ff00', await hex());
await typeInto('Corner', '20');
const preset = await page.evaluate((p) => [...document.querySelectorAll(`${p} .sub-ip-presets .canon-button`)].map((x) => x.textContent.trim()), P);
check('corner presets render', preset.join() === 'Sharp,Subtle,Round,Pill', preset.join());
await page.evaluate((p) => [...document.querySelectorAll(`${p} .sub-ip-presets .canon-button`)].find((x) => x.textContent.trim() === 'Sharp').click(), P);
await sleep(300);
check('a preset sets the corner', (await fieldValue('Corner')) === '0', await fieldValue('Corner'));
await (await rowSel('Stroke', 'input')).click();
await sleep(300);
check('Stroke on shows its colour, width and dash', (await fieldValue('Width')) === '2' && !!(await rowSel('Dashed', 'input')).asElement());
check('shape: every control has a name', (await unnamed()).length === 0, JSON.stringify(await unnamed()));

// text content: a typing burst is one step
await page.evaluate(() => {
	window.__substrata.setTool('text', 'text');
	window.__substrata.toolSettings('text', { fontFamily: 'sans', fontSize: 80, style: 'regular', align: 'left' });
});
const tp = toPage(900, 150);
await page.mouse.click(tp.x, tp.y);
await sleep(300);
await page.keyboard.type('Hi', { delay: 20 });
await page.keyboard.press('Escape');
await sleep(300);
await page.evaluate(() => window.__substrata.setTool('move', 'move'));
const textId = (await layers()).find((l) => l.kind === 'text').id;
await page.evaluate((i) => window.__substrata.select([i]), textId);
await sleep(300);
h = await headings();
check('a text layer shows the Text section', h.includes('Text'), JSON.stringify(h));
const boxWidth = () => page.evaluate(() => window.__substrata.selection().box?.width ?? 0);
const w0 = await boxWidth();
const area = await rowSel('Content', 'textarea');
await area.click();
await page.keyboard.press('End');
await page.keyboard.type(' there', { delay: 15 });
await sleep(900);
await area.evaluate((e) => e.blur());
await sleep(200);
const w1 = await boxWidth();
check('Content edits the text on the canvas', w1 > w0 * 1.5, `${w0} -> ${w1}`);
await undo();
const back = await area.evaluate((e) => e.value);
check('the typing burst is one undo step', back === 'Hi' && (await boxWidth()) === w0, back);
check('text: every control has a name', (await unnamed()).length === 0, JSON.stringify(await unnamed()));

// the phone tray
await page.setViewport({ width: 390, height: 844 });
await sleep(600);
if (!(await page.evaluate((p) => !!document.querySelector(p), P))) await page.evaluate(() => window.__substrataUi.toggle('inspector', true));
await sleep(400);
const tray = await page.evaluate((p) => {
	const el = document.querySelector(p);
	const r = el?.getBoundingClientRect();
	return { tray: !!el?.closest('.sub-ed-rail.is-tray'), right: r?.right, doc: document.documentElement.scrollWidth };
}, P);
check('phone: the inspector sits in the tray', tray.tray && tray.right <= 390 && tray.doc <= 390, JSON.stringify(tray));
check('phone: no sideways overflow', (await overflow()) <= 0, String(await overflow()));

await finish(browser);
