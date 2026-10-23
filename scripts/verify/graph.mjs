// needs npm start first

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();

const curves = () =>
	page.$$eval('.graph-curve', (paths) =>
		paths.map((path) => {
			const d = path.getAttribute('d') ?? '';
			return {
				subpaths: (d.match(/M/g) ?? []).length,
				points: (d.match(/[ML]/g) ?? []).length,
			};
		}),
	);

const rows = () => page.$$('.graph-function');

const ranges = () =>
	page.$$eval('.graph-range-field', (els) => els.map((el) => el.value));

async function clickText(selector, text) {
	await page.evaluate(
		(sel, t) =>
			[...document.querySelectorAll(sel)]
				.find((el) => el.textContent.trim() === t)
				?.click(),
		selector,
		text,
	);
	await sleep(400);
}

// the keypad sheet types keyboard keys; Enter is Done
async function typeInto(row, keys) {
	const fields = await page.$$('.graph-field');
	await fields[row].click();
	await page.waitForSelector('dialog.canon-math-input[open]');
	await sleep(500);
	await page.keyboard.down('Meta');
	await page.keyboard.press('Backspace');
	await page.keyboard.up('Meta');
	for (let i = 0; i < 12; i++) await page.keyboard.press('Backspace');
	await page.keyboard.type(keys);
	await page.keyboard.press('Enter');
	await sleep(900);
}

await visit(page, '/tools/graph-calc');
await sleep(800);

const initial = await curves();
check(
	'the default function plots once mathjs loads',
	initial.length === 1 && initial[0].points > 100,
	JSON.stringify(initial),
);

const surface = await page.evaluate(() => ({
	axes: document.querySelector('.graph-axes')?.getAttribute('d') ?? '',
	grid: document.querySelector('.graph-grid-major')?.getAttribute('d') ?? '',
	labels: document.querySelectorAll('.graph-labels text').length,
	tags: document.querySelectorAll('.graph-tag').length,
}));
check(
	'the plane carries axes, grid, tick labels and trace tags',
	surface.axes && surface.grid && surface.labels > 4 && surface.tags === 2,
	`labels ${surface.labels}, tags ${surface.tags}`,
);

await clickText('.canon-button', 'sin(x)');
await clickText('.canon-button', 'tan(x)');
const three = await curves();
check(
	'examples add functions',
	(await rows()).length === 3 && three.length === 3,
	`${three.length} curves`,
);
// six poles from -10 to 10: seven runs
check('tan(x) breaks at every asymptote', three[2]?.subpaths === 7, `${three[2]?.subpaths} subpaths`);

const names = await page.$$eval('.graph-table-name', (els) =>
	els.map((el) => el.textContent.trim()),
);
check('the table has a column per curve', names.join() === 'x,y₁,y₂,y₃', names.join());

await typeInto(0, '1/x');
const inverse = await curves();
check('typed in the keypad, 1/x breaks at zero', inverse[0]?.subpaths === 2, `${inverse[0]?.subpaths} subpaths`);

await typeInto(1, 'x^');
const error = await page.$eval('.graph-function:nth-of-type(2) .canon-status', (el) => el.textContent.trim()).catch(() => '');
check('an unfinished expression says so', error === 'Invalid expression', error);
check('and is not plotted', (await curves()).length === 2);

const relation = await page.$$('.graph-relation');
await relation[0].click();
await sleep(300);
await clickText('.canon-menu-item', '<');
const region = await page.$$eval('.graph-region', (els) => els.length);
check('a relation shades its region', region === 1, `${region} regions`);

const swatch = await page.$$('.graph-swatch');
await swatch[0].click();
await sleep(400);
await page.click('.graph-colour[aria-label="Colour 5"]');
await sleep(400);
const stroke = await page.$eval('.graph-curve', (el) => el.getAttribute('stroke'));
check('a palette pick recolours the curve', stroke === '#8b5cf6', stroke);

const eye = await page.$$('.graph-cell[aria-label="Hide"]');
await eye[0].click();
await sleep(300);
check('hiding drops the curve', (await curves()).length === 1);

const remove = await page.$$('.graph-cell[aria-label="Remove"]');
await remove[1].click();
await sleep(300);
check('remove drops the row', (await rows()).length === 2);

const box = await page.$eval('.graph-plot', (el) => {
	const r = el.getBoundingClientRect();
	return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const atRest = await ranges();
await page.mouse.move(box.x + box.w * 0.25, box.y + box.h * 0.3);
await page.mouse.down();
await page.mouse.move(box.x + box.w * 0.25 - 90, box.y + box.h * 0.3 - 50, { steps: 10 });
await sleep(120);
await page.mouse.up();
await sleep(300);
const panned = await ranges();
check('dragging pans the plane', panned.join() !== atRest.join(), `${atRest.join(' ')} -> ${panned.join(' ')}`);

await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
await page.mouse.wheel({ deltaY: -300 });
await sleep(300);
const zoomed = await ranges();
check('and the wheel zooms it', zoomed.join() !== panned.join(), `${panned.join(' ')} -> ${zoomed.join(' ')}`);

await clickText('.canon-button', 'Trig');
await sleep(700);
const trigRange = await ranges();
check('Trig sets the window', trigRange.join() === '−6.28,6.28,−4,4', trigRange.join());

const traceLine = await page.$eval('.graph-trace', (el) => el.getAttribute('d'));
const lineX = Number(/M([\d.]+)/.exec(traceLine)?.[1]);
await page.mouse.move(box.x + lineX, box.y + box.h * 0.6);
await page.mouse.down();
await page.mouse.move(box.x + lineX + 60, box.y + box.h * 0.6, { steps: 6 });
await page.mouse.up();
await sleep(300);
const traced = await page.$eval('input[aria-label="Trace"]', (el) => el.value);
check('dragging the trace line moves the trace', traced !== '1', traced);

await page.$eval('input[aria-label="Trace"]', (el) => {
	el.value = '2';
	el.dispatchEvent(new Event('input', { bubbles: true }));
	el.blur();
});
await sleep(300);
await page.click('.canon-stepper-plus');
await sleep(600);
const centre = await page.$eval('output[aria-label="Table"]', (el) => el.textContent.trim());
check('a step moves the trace and the table', centre === 'x 3, y₂ −0.1425', centre);

await page.$eval('input[aria-label="X minimum"]', (el) => {
	el.focus();
	el.value = '-1';
	el.dispatchEvent(new Event('input', { bubbles: true }));
	el.blur();
});
await sleep(800);
const typedRange = await ranges();
check('a typed range sets the window', typedRange[0] === '−1' && typedRange[1] === '6.28', typedRange.join());

await page.click('.canon-switch');
await sleep(200);
const grid = await page.$eval('.graph-grid-major', (el) => el.getAttribute('d'));
check('the Grid switch hides the grid', !grid, grid);

await finish(browser);
