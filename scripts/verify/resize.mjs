// needs `npm start` on :3000
// canvas kept first width
import { BASE, check, finish, launch, sleep } from './harness.mjs';

const { browser, page } = await launch({ viewport: { width: 1400, height: 900 } });
await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__substrata, { timeout: 25000 });
await sleep(800);

const probe = () =>
	page.evaluate(() => {
		const width = (sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().width ?? 0);
		const bar = document.querySelector('.sub-ed-bar.is-bottom')?.getBoundingClientRect();
		return {
			inner: window.innerWidth,
			canvas: width('.canvas-container'),
			area: width('.sub-shell-canvas-area'),
			barCentre: bar ? Math.round(bar.left + bar.width / 2) : null,
			wider: [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().width > window.innerWidth + 2).length,
		};
	});

const wide = await probe();
check('wide: canvas fills the window', wide.canvas === 1400 && wide.area === 1400, JSON.stringify(wide));

await page.setViewport({ width: 900, height: 700 });
await sleep(1000);
const narrow = await probe();
check('narrow: canvas shrinks with the window', narrow.canvas === 900 && narrow.area === 900, JSON.stringify(narrow));
check('narrow: the tool settings bar is centred', narrow.barCentre === 450, `${narrow.barCentre}`);
check('narrow: nothing is wider than the window', narrow.wider === 0, `${narrow.wider}`);

await page.setViewport({ width: 1400, height: 900 });
await sleep(1000);
const back = await probe();
check('grown back: canvas follows', back.canvas === 1400 && back.barCentre === 700, JSON.stringify(back));

await finish(browser);
