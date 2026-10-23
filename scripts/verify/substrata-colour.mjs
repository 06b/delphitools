// the colour ring (iPad layout) and the phone's colour tray
import { BASE, check, finish, launch, sleep } from './harness.mjs';

const { browser, page } = await launch({
	viewport: { width: 1400, height: 1000, deviceScaleFactor: 2 },
});

page.on('dialog', (d) => d.accept());

async function boot(viewport) {
	await page.setViewport({ deviceScaleFactor: 2, ...viewport });
	await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle2' });
	await page.waitForFunction(() => window.__substrata && window.__substrataUi, {
		timeout: 30000,
	});
	await page.evaluate(() => {
		for (const key of Object.keys(localStorage))
			if (/colour|ring/i.test(key)) localStorage.removeItem(key);
	});
	await sleep(400);
}

const keyColour = () =>
	page.evaluate(() =>
		getComputedStyle(document.querySelector('.sub-ed-colour-dot'))
			.getPropertyValue('--sub-key-colour')
			.trim(),
	);

const hub = () =>
	page.evaluate(() => {
		const k = document
			.querySelector('.sub-ed-colour-key .sub-cell')
			.getBoundingClientRect();
		return { x: k.left + k.width / 2, y: k.top + k.height / 2 };
	});

// ring angles: 0 points into the screen, 90 straight up (right-hand column)
const polar = (h, r, a) => ({
	x: h.x - r * Math.cos((a * Math.PI) / 180),
	y: h.y - r * Math.sin((a * Math.PI) / 180),
});

const click = async (p) => {
	await page.mouse.click(p.x, p.y);
	await sleep(120);
};

const ringShown = () =>
	page.evaluate(() =>
		document.querySelector('.sub-ring')?.classList.contains('is-shown'),
	);

const openRing = async () => {
	await page.click('.sub-ed-colour-key .sub-cell');
	await sleep(700);
};

const closeRing = async () => {
	await page.evaluate(() => window.__substrataUi.closeRing());
	await sleep(400);
};

const ringPixels = () =>
	page.evaluate(() => {
		const c = document.querySelector('.sub-ring-canvas');
		const d = c
			.getContext('2d')
			.getImageData(c.width - 900, c.height - 900, 900, 900).data;
		let sum = 0;
		for (let i = 0; i < d.length; i += 97) sum = (sum * 31 + d[i]) % 1e9;
		return sum;
	});

// a selected rectangle to recolour
async function drawShape() {
	await page.evaluate(() => {
		window.__substrata.setTool('pieces', 'primitives');
		window.__substrata.toolSettings('pieces', {
			shape: 'rectangle',
			fill: '#3e6b33',
			stroke: null,
			cornerRadius: 0,
		});
	});
	const box = await page.evaluate(() => {
		const r = document
			.querySelector('canvas.upper-canvas')
			.getBoundingClientRect();
		return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.3 };
	});
	await page.mouse.move(box.x, box.y);
	await page.mouse.down();
	await page.mouse.move(box.x + 200, box.y + 140, { steps: 8 });
	await page.mouse.up();
	await sleep(400);
	return { x: box.x + 100, y: box.y + 70 };
}

const sampleAt = (p) =>
	page.evaluate(([x, y]) => {
		const r = document
			.querySelector('canvas.upper-canvas')
			.getBoundingClientRect();
		return window.__substrata.samplePixel(x - r.left, y - r.top);
	}, [p.x, p.y]);

// ---- iPad layout ----
await boot({ width: 1400, height: 1000 });
const inShape = await drawShape();
const shapeBefore = await sampleAt(inShape);
check('a selected shape to recolour', shapeBefore[1] > shapeBefore[0], shapeBefore.join());

await openRing();
check('the colour key opens the ring', await ringShown());
const chrome = await page.evaluate(() => {
	const seen = (s) => {
		const el = document.querySelector(s);
		if (!el) return 'missing';
		const st = getComputedStyle(el);
		return st.visibility === 'hidden' || st.opacity === '0' ? 'faded' : 'shown';
	};
	return {
		title: seen('.sub-ed-title'),
		stack: seen('.sub-ed-stack'),
		omni: seen('.sub-ed-omni'),
		help: seen('.sub-ed-help'),
		key: seen('.sub-ed-colour-key'),
	};
});
check(
	'the chrome fades; help and the colour key stay',
	chrome.title === 'faded' &&
		chrome.stack === 'faded' &&
		chrome.omni === 'faded' &&
		chrome.help === 'shown' &&
		chrome.key === 'shown',
	JSON.stringify(chrome),
);
const named = await page.evaluate(() =>
	[...document.querySelectorAll('.sub-ring-keys button')].map(
		(b) => b.getAttribute('aria-label') ?? b.textContent.trim(),
	),
);
check(
	'types and hub buttons are named',
	['Markers', 'FREETONE', 'Sliders', 'Palettes', 'Starred', 'Recent', 'Eyedropper', 'Favourite', 'Hex', 'Colour Wheel'].every((n) => named.includes(n)),
	named.join(', '),
);
const crisp = await page.evaluate(() => {
	const c = document.querySelector('.sub-ring-canvas');
	return c.width === Math.round(c.clientWidth * devicePixelRatio);
});
check('the ring canvas draws at device pixels', crisp);
check(
	'the swatch band takes focus on open',
	await page.evaluate(() =>
		document.activeElement?.classList.contains('sub-ring-band'),
	),
);

// drag to turn, then a flick that coasts on
const h = await hub();
const before = await ringPixels();
await page.mouse.move(...Object.values(polar(h, 400, 60)));
await page.mouse.down();
for (let a = 60; a >= 30; a -= 3)
	await page.mouse.move(...Object.values(polar(h, 400, a)));
await page.mouse.up();
await sleep(50);
const afterDrag = await ringPixels();
check('a drag turns the fan', afterDrag !== before);
await page.mouse.move(...Object.values(polar(h, 400, 70)));
await page.mouse.down();
for (let a = 70; a >= 40; a -= 6) {
	await page.mouse.move(...Object.values(polar(h, 400, a)));
	await sleep(8);
}
await page.mouse.up();
const released = await ringPixels();
const frames = await page.evaluate(
	() =>
		new Promise((resolve) => {
			const times = [];
			const step = (t) => {
				times.push(t);
				if (times.length < 30) requestAnimationFrame(step);
				else resolve(times.slice(1).map((v, i) => v - times[i]));
			};
			requestAnimationFrame(step);
		}),
);
const coasted = await ringPixels();
check('a flick coasts on after release', coasted !== released);
const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
check('the coast holds 60 fps', mean < 20, `${mean.toFixed(1)} ms a frame`);
await sleep(1200);

// keyboard: arrows move between swatches, Enter picks
await page.focus('.sub-ring-band');
await page.keyboard.press('ArrowRight');
await sleep(100);
const spoken = await page.evaluate(
	() => document.querySelector('.sub-ring-live')?.textContent.trim(),
);
check('arrows land on a named swatch', /^[A-Z]\d\d /.test(spoken ?? ''), spoken);
const keyBefore = await keyColour();
await page.keyboard.press('Enter');
await sleep(800);
check('Enter picks and the ring flies home', !(await ringShown()));
check('the pick is the working colour', (await keyColour()) !== keyBefore);
const caption = await page.evaluate(() => ({
	shown: document.querySelector('.sub-caption')?.classList.contains('is-visible'),
	text: document.querySelector('.sub-caption-head')?.textContent.trim(),
}));
check('the caption names the pick', caption.shown && caption.text === spoken.replace(' ', '  '), JSON.stringify(caption));
const shapeAfter = await sampleAt(inShape);
check('the pick recolours the selection', shapeAfter.join() !== shapeBefore.join(), shapeAfter.join());
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(300);
const undone = await sampleAt(inShape);
check('one undo restores the fill', undone.join() === shapeBefore.join(), undone.join());

// a click on a swatch picks it
await openRing();
const h2 = await hub();
let picked = false;
const k0 = await keyColour();
for (let a = 40; a <= 60 && !picked; a += 2) {
	await click(polar(h2, 216 + 17, a));
	await sleep(600);
	picked = !(await ringShown());
}
check('a click on a swatch picks and closes', picked && (await keyColour()) !== k0);

// the hub, a click outside and Esc close
await openRing();
await click(await hub());
await sleep(400);
check('the hub closes the ring', !(await ringShown()));
await openRing();
await page.keyboard.press('Escape');
await sleep(400);
check('Esc closes the ring', !(await ringShown()));
await openRing();
await click({ x: 100, y: 300 });
await sleep(400);
check('a click past the ring closes it', !(await ringShown()));

// types: a click on the Sliders arc, then a slider drag
await openRing();
const h3 = await hub();
await click(polar(h3, 150, 3 + 14 * 2 + 7));
await sleep(400);
const sliders = await page.evaluate(() => ({
	checked: document
		.querySelector('.sub-ring-keys [role=radio][aria-checked=true]')
		?.textContent.trim(),
	tracks: [...document.querySelectorAll('.sub-ring-keys [role=slider]')].map((s) =>
		s.getAttribute('aria-label'),
	),
}));
check(
	'a click on a type arc shows it',
	sliders.checked === 'Sliders' && sliders.tracks.join() === 'L,a,b',
	JSON.stringify(sliders),
);
const s0 = await keyColour();
// the L track runs outermost, 408 to 460 from the hub
await page.mouse.move(...Object.values(polar(h3, 434, 20)));
await page.mouse.down();
await page.mouse.move(...Object.values(polar(h3, 434, 60)), { steps: 6 });
await page.mouse.up();
await sleep(200);
check('a slider drag changes the colour', (await keyColour()) !== s0);
await page.focus('.sub-ring-keys [role=slider]');
const s1 = await keyColour();
await page.keyboard.press('ArrowUp');
await sleep(100);
check('a slider takes the arrow keys', (await keyColour()) !== s1);

// hex keypad
await click(polar(h3, 72, 60));
await sleep(300);
check('the hex button opens the keypad', await page.evaluate(() => !!document.querySelector('.sub-hexpad')));
await page.click('.sub-hexpad-key.is-word');
await page.keyboard.type('ff0000');
await sleep(100);
const typedHex = await page.evaluate(() => document.querySelector('.sub-hexpad-display')?.textContent);
check('typing fills the keypad', typedHex === '#FF0000', typedHex);
await page.keyboard.press('Enter');
await sleep(200);
check('Done keeps the typed colour', (await keyColour()).startsWith('rgb(255 0 0'), await keyColour());

// hue wheel
await click(polar(h3, 72, 86));
await sleep(300);
check('the colour wheel button opens the wheel', await page.evaluate(() => !!document.querySelector('.sub-hw')));
const w0 = await keyColour();
const wheel = await page.evaluate(() => {
	const r = document.querySelector('.sub-hw').getBoundingClientRect();
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.move(wheel.x, wheel.y);
await page.mouse.down();
await page.mouse.move(wheel.x + 20, wheel.y - 30, { steps: 4 });
await page.mouse.up();
await sleep(100);
check('a drag on the wheel changes the colour', (await keyColour()) !== w0);
await click(polar(h3, 300, 8));
check('a click on the ring closes the wheel', await page.evaluate(() => !document.querySelector('.sub-hw')));

// star
await click(polar(h3, 72, 34));
check(
	'the star button stars the colour',
	await page.evaluate(
		() => document.querySelector('[aria-label=Favourite]')?.getAttribute('aria-pressed') === 'true',
	),
);
await closeRing();
check(
	'stars persist',
	await page.evaluate(
		() => JSON.parse(localStorage.getItem('substrata:layout:colourStars') ?? '[]').length === 1,
	),
);

// eyedropper on the shape
const underShape = await sampleAt(inShape);
await openRing();
const h4 = await hub();
await click(polar(h4, 72, 8));
check('the eyedropper samples', await page.evaluate(() => document.querySelector('.sub-ring')?.classList.contains('is-sampling')));
await page.mouse.move(inShape.x, inShape.y);
await click(inShape);
const sampled = await keyColour();
check(
	'the eyedropper picks the pixel under it',
	sampled.startsWith(`rgb(${underShape.slice(0, 3).join(' ')} `),
	`${sampled} under ${underShape.join()}`,
);
await closeRing();

// a colour well's target takes the pick; closing keeps the working colour
const working = await keyColour();
await page.evaluate(() => {
	window.__ringSent = [];
	window.__substrataUi.openRingFor({
		hex: '#123456',
		alpha: 1,
		send: (hex, alpha, final) => window.__ringSent.push([hex, alpha, final]),
	});
});
await sleep(700);
const h5 = await hub();
await click(polar(h5, 72, 60));
await page.keyboard.type('abcdef');
await page.keyboard.press('Enter');
await sleep(200);
await closeRing();
const sent = await page.evaluate(() => window.__ringSent);
check('a well target gets the pick', sent.some(([hex, , final]) => hex === '#abcdef' && final), JSON.stringify(sent));
check('the working colour stays', (await keyColour()) === working);

// reduced motion: no fly-out
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await openRing();
const h6 = await hub();
await click(polar(h6, 150, 10));
await page.focus('.sub-ring-band');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await sleep(40);
check('reduced motion closes at once', !(await ringShown()));
await page.emulateMediaFeatures([]);

check('no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

// ---- phone ----
await boot({ width: 390, height: 844 });
check('the phone has no ring', await page.evaluate(() => !document.querySelector('.sub-ring')));
await page.click('.sub-ed-colour-key .sub-cell');
await sleep(500);
const tray = await page.evaluate(() => ({
	panel: !!document.querySelector('[data-panel=colour]'),
	types: [...document.querySelectorAll('[data-panel=colour] .sub-ct-types [role=radio]')].map((b) =>
		b.getAttribute('aria-label') ?? b.textContent.trim(),
	),
	header: [...document.querySelectorAll('[data-panel=colour] .sub-panel-header button')].map((b) =>
		b.getAttribute('aria-label'),
	),
}));
check('the colour key opens the colour tray', tray.panel, JSON.stringify(tray));
check('the tray types are named', tray.types.length === 6, tray.types.join());
check('the tray header has eyedropper and hex', ['Eyedropper', 'Hex', 'Close'].every((n) => tray.header.includes(n)), tray.header.join());
const t0 = await keyColour();
const cell = await page.evaluate(() => {
	const r = document.querySelector('.sub-ct-grid').getBoundingClientRect();
	return { x: r.left + 22 + 22, y: r.top + 20 };
});
await click(cell);
await sleep(200);
check('a tap on a tray swatch picks it', (await keyColour()) !== t0);
await page.evaluate(() => document.querySelectorAll('[data-panel=colour] .sub-ct-types [role=radio]')[2].click());
await sleep(300);
check('the sliders type shows three sliders', await page.evaluate(() => document.querySelectorAll('.sub-ct-sliders [role=slider]').length === 3));
await page.focus('.sub-ct-sliders [role=slider]');
const t1 = await keyColour();
await page.keyboard.press('ArrowRight');
await sleep(150);
check('a tray slider takes the arrow keys', (await keyColour()) !== t1);
await page.click('[data-panel=colour] .sub-panel-header button[aria-label=Hex]');
await sleep(300);
check('Hex opens the keypad in the tray', await page.evaluate(() => !!document.querySelector('[data-panel=colour] .sub-hexpad')));
check('typing raises the tray', await page.evaluate(() => window.__substrataUi.trayStop === 'tall'));
await page.click('.sub-hexpad-key.is-word');
await page.keyboard.type('00f');
await page.keyboard.press('Enter');
await sleep(200);
check('the typed colour is kept', (await keyColour()).startsWith('rgb(0 0 255'), await keyColour());
await page.click('[data-panel=colour] .sub-panel-header button[aria-label=Eyedropper]');
await sleep(300);
check('the eyedropper covers the canvas', await page.evaluate(() => !!document.querySelector('.sub-eyedropper')));
const cover = await page.evaluate(() => {
	const r = document.querySelector('.sub-eyedropper').getBoundingClientRect();
	return { x: r.left + 4, y: r.top + 4 };
});
await click(cover);
check('the eyedropper picks and goes', await page.evaluate(() => !document.querySelector('.sub-eyedropper')));
check('no horizontal scroll on the phone', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

await finish(browser);
