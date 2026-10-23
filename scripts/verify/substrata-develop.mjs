// canon develop view: picture, histogram, sliders, looks, revert, done
// SHOTS=<dir> also saves a screenshot of every state at three sizes

import { mkdirSync } from 'node:fs';
import { launch, check, finish, sleep, BASE } from './harness.mjs';

const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const TYPES = [
	'exposure',
	'contrast',
	'highlights',
	'shadows',
	'temperature',
	'tint',
	'saturation',
	'sharpen',
	'vignette',
];

async function open(page, width, height) {
	await page.setViewport({ width, height });
	await page.goto(`${BASE}/editor`, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__substrata, { timeout: 25000 });
	await page.evaluate(() => localStorage.clear());
	await page.reload({ waitUntil: 'load' });
	await page.waitForFunction(() => window.__substrataUi, { timeout: 25000 });
	await page.evaluate(() =>
		window.__substrata.addRaster(900, 600, [
			{ x: 0, y: 0, w: 900, h: 150, colour: '#7193b8' },
			{ x: 0, y: 150, w: 900, h: 150, colour: '#a7a3a0' },
			{ x: 0, y: 300, w: 900, h: 120, colour: '#e3ab78' },
			{ x: 520, y: 140, w: 140, h: 140, colour: '#f5d888' },
			{ x: 0, y: 420, w: 900, h: 180, colour: '#3d5a3d' },
		]),
	);
	await sleep(600);
	await page.evaluate(() => {
		const id = window.__substrata.layers()[0].id;
		window.__substrata.select([id]);
		window.__substrataUi.developOpen = true;
	});
	await page.waitForSelector('.sub-develop .sub-dev-picture-canvas');
	await theme(page, false);
	await sleep(900);
}

const rect = (page, sel) =>
	page.evaluate((s) => {
		const r = document.querySelector(s)?.getBoundingClientRect();
		return r && { l: r.left, t: r.top, r: r.right, b: r.bottom };
	}, sel);

const filters = (page) =>
	page.evaluate(() => window.__substrata.layers()[0].filters.join(','));

const sliderValue = (page, type) =>
	page.evaluate(
		(t) =>
			document
				.querySelector(`.sub-dev-row[data-type="${t}"] .canon-slider`)
				?.getAttribute('aria-valuenow'),
		type,
	);

const keys = async (page, sel, key, times = 1) => {
	await page.focus(sel);
	for (let i = 0; i < times; i++) await page.keyboard.press(key);
	await sleep(150);
};

// mean of the picture's centre pixels
const pictureMean = (page) =>
	page.evaluate(() => {
		const c = document.querySelector('.sub-dev-picture-canvas');
		const ctx = c.getContext('2d');
		const { data } = ctx.getImageData(
			Math.floor(c.width / 2) - 20,
			Math.floor(c.height / 2) - 20,
			40,
			40,
		);
		let sum = 0;
		for (let i = 0; i < data.length; i += 4)
			sum += data[i] + data[i + 1] + data[i + 2];
		return sum / (data.length / 4);
	});

const theme = (page, dark) =>
	page.evaluate((d) => {
		const c = document.documentElement.classList;
		c.toggle('dark', d);
		c.toggle('light', !d);
	}, dark);

const shot = async (page, name) => {
	if (!SHOTS) return;
	await sleep(300);
	await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const { browser, page } = await launch();
page.on('dialog', (d) => void d.accept());

// wide
await open(page, 1400, 1000);
const dev = await rect(page, '.sub-develop');
check('develop covers the editor', dev.l === 0 && dev.t === 0 && dev.r === 1400 && dev.b === 1000, JSON.stringify(dev));
const pic = await rect(page, '.sub-dev-picture');
const main = await rect(page, '.canon-split-main');
check('picture on the left, settings on the right', pic.r <= main.l + 1, `${JSON.stringify(pic)} ${JSON.stringify(main)}`);
const share = (pic.r - pic.l) / 1400;
check('picture takes 70 % of the width', Math.abs(share - 0.7) < 0.02, share.toFixed(3));
check('picture is drawn', (await pictureMean(page)) > 0);
const histogram = await page.evaluate(() => {
	const c = document.querySelector('.sub-dev-histogram');
	const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
	let inked = 0;
	for (let i = 3; i < data.length; i += 4) if (data[i]) inked++;
	return inked;
});
check('histogram is drawn', histogram > 100, String(histogram));
const rows = await page.$$eval('.sub-dev-row[data-type]', (r) => r.map((x) => x.dataset.type));
check('slider rows in iOS order', rows.join() === TYPES.join(), rows.join());
const headings = await page.$$eval('.sub-develop .canon-heading', (h) => h.map((x) => x.textContent.trim()));
check('sections Light, Colour, Detail, Looks', headings.join() === 'Light,Colour,Detail,Looks', headings.join());
const marks = await page.$$eval('.sub-dev-mark svg', (m) => m.length);
check('every row has its faint symbol', marks === TYPES.length, String(marks));
const spill = () =>
	page.$$eval('.sub-dev-row', (rs) =>
		rs.filter((r) => {
			const s = r.querySelector('.canon-slider').getBoundingClientRect();
			return s.right > r.getBoundingClientRect().right + 0.5;
		}).length,
	);
check('readouts stay inside their rows', (await spill()) === 0);
const tiles = await page.$$eval('.sub-dev-look', (t) => ({
	count: t.length,
	images: t.filter((x) => x.querySelector('img')).length,
}));
check('looks strip: None plus the shelf, with thumbnails', tiles.count >= 17 && tiles.images === tiles.count, JSON.stringify(tiles));
check('None is active without a look', await page.$eval('.sub-dev-look[data-look="none"]', (b) => b.getAttribute('aria-pressed') === 'true'));
const unnamed = await page.$$eval('.sub-develop button, .sub-develop [role="slider"]', (els) =>
	els.filter((e) => {
		const by = e.getAttribute('aria-labelledby');
		const named = by && document.getElementById(by)?.textContent.trim();
		return !(named || e.getAttribute('aria-label') || e.textContent.trim());
	}).length,
);
check('every control is named', unnamed === 0, String(unnamed));
check('focus moves into develop', await page.evaluate(() => !!document.activeElement?.closest('.sub-develop')));
check('Revert starts disabled', await page.$eval('.sub-dev-actions button', (b) => b.disabled));
await shot(page, 'wide-light');

// keys: arrows move the slider, not the layer
const before = await page.evaluate(() => window.__substrata.layers()[0].scene);
const meanBefore = await pictureMean(page);
await keys(page, '.sub-dev-row[data-type="exposure"] .canon-slider', 'ArrowRight', 30);
await sleep(400);
check('arrow keys set exposure', (await sliderValue(page, 'exposure')) === '30' && (await filters(page)) === 'exposure', await filters(page));
const after = await page.evaluate(() => window.__substrata.layers()[0].scene);
check('arrow keys do not nudge the layer', JSON.stringify(before) === JSON.stringify(after));
check('picture brightens live', (await pictureMean(page)) > meanBefore + 5);
check('Revert enables after a change', await page.$eval('.sub-dev-actions button', (b) => !b.disabled));
await keys(page, '.sub-dev-row[data-type="exposure"] .canon-slider', 'ArrowLeft', 30);
check('back at zero the filter goes', (await filters(page)) === '', await filters(page));

// drag the contrast slider
const track = await rect(page, '.sub-dev-row[data-type="contrast"] .canon-slider-track');
const y = (track.t + track.b) / 2;
const mid = (track.l + track.r) / 2;
await page.mouse.move(mid, y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(mid + i * 6, y);
await page.mouse.up();
await sleep(300);
const contrast = Number(await sliderValue(page, 'contrast'));
check('a drag sets contrast', contrast > 0 && (await filters(page)) === 'contrast', `${contrast} ${await filters(page)}`);
await page.click('.sub-dev-row[data-type="contrast"] .canon-row-label', { count: 2 });
await sleep(300);
check('double-click resets the row', (await filters(page)) === '' && (await sliderValue(page, 'contrast')) === '0', await filters(page));

// looks
await keys(page, '.sub-dev-row[data-type="temperature"] .canon-slider', 'ArrowRight', 40);
await page.click('.sub-dev-look:nth-child(3)');
await sleep(400);
check('a look adds film-sim after the adjustments', (await filters(page)) === 'temperature,film-sim', await filters(page));
check('the picked tile is pressed', await page.$eval('.sub-dev-look:nth-child(3)', (b) => b.getAttribute('aria-pressed') === 'true'));
await keys(page, '.sub-dev-intensity', 'ArrowLeft', 40);
check('intensity follows its slider', (await page.$eval('.sub-dev-intensity', (s) => s.getAttribute('aria-valuenow'))) === '60');
await shot(page, 'wide-light-edited');
await theme(page, true);
await shot(page, 'wide-dark-edited');

// before
const box = await rect(page, '.sub-dev-picture');
await page.mouse.move((box.l + box.r) / 2, (box.t + box.b) / 2);
await page.mouse.down();
await sleep(400);
check('holding the picture shows Before', await page.$eval('.sub-dev-before', (b) => getComputedStyle(b).opacity === '1'));
await shot(page, 'wide-dark-before');
await page.mouse.up();
await sleep(300);
check('letting go hides Before', await page.$eval('.sub-dev-before', (b) => getComputedStyle(b).opacity === '0'));
await theme(page, false);

// revert, done, undo
await page.click('.sub-dev-actions button:first-child');
await sleep(300);
check('Revert restores the layer', (await filters(page)) === '', await filters(page));
check('Revert disables again', await page.$eval('.sub-dev-actions button', (b) => b.disabled));
await keys(page, '.sub-dev-row[data-type="saturation"] .canon-slider', 'ArrowRight', 20);
await page.click('.sub-dev-look:nth-child(2)');
await sleep(200);
await page.click('.sub-dev-actions button:last-child');
await sleep(400);
check('Done closes develop', !(await page.$('.sub-develop')));
check('Done keeps the changes', (await filters(page)) === 'saturation,film-sim', await filters(page));
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(300);
check('one undo step takes the whole session back', (await filters(page)) === '', await filters(page));
await page.evaluate(() => (window.__substrataUi.developOpen = true));
await page.waitForSelector('.sub-develop');
await sleep(300);
await page.keyboard.press('Escape');
await sleep(300);
check('Esc closes develop', !(await page.$('.sub-develop')));

// 2200 x 1100
await open(page, 2200, 1100);
const wide = (await rect(page, '.sub-dev-picture')).r / 2200;
check('2200: picture beside the settings', Math.abs(wide - 0.7) < 0.02, wide.toFixed(3));
await shot(page, 'xl-light');
await theme(page, true);
await shot(page, 'xl-dark');
await theme(page, false);

// phone
await open(page, 390, 844);
const p = await rect(page, '.sub-dev-picture');
const first = await rect(page, '.sub-develop .canon-rows');
check('phone: picture over the settings', p.b <= first.t + 1 && p.l === 0 && p.r === 390, `${JSON.stringify(p)} ${JSON.stringify(first)}`);
check('phone: readouts stay inside their rows', (await spill()) === 0);
check(
	'phone: no horizontal scroll',
	await page.evaluate(() => {
		const body = document.querySelector('.sub-develop .canon-split-body');
		return body.scrollWidth <= body.clientWidth;
	}),
);
const footer = await rect(page, '.sub-dev-actions');
check('phone: Revert and Done float on screen', footer.b <= 844 && footer.t > 600, JSON.stringify(footer));
await shot(page, 'phone-light');
await page.evaluate(() => (document.querySelector('.sub-develop .canon-split-body').scrollTop = 600));
await sleep(300);
const band = await rect(page, '.sub-dev-picture');
check('phone: the picture collapses as the page scrolls', band.b - band.t <= 201, JSON.stringify(band));
await shot(page, 'phone-light-scrolled');
await theme(page, true);
await shot(page, 'phone-dark-scrolled');
await page.evaluate(() => (document.querySelector('.sub-develop .canon-split-body').scrollTop = 0));
await shot(page, 'phone-dark');
await theme(page, false);

await finish(browser);
