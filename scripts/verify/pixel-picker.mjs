// the canon pixel picker: picture, reticle, loupe, pointer and keyboard, picks, paste, drop

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);

const text = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const strip = () => text('.canon-colour-strip-value');

await visit(page, '/tools/pixel-picker');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.pixel-picker').getBoundingClientRect().height,
	),
);
const empty = await page.evaluate(() => ({
	slot: document.querySelector('.pp-slot')?.textContent.replace(/\s+/g, ' ').trim(),
	tag: document.querySelector('.pp-slot')?.tagName,
	drop: !!document.querySelector('.pp-drop'),
	pick: document.querySelector('.pp-pick-button')?.checkVisibility(),
}));
check('empty: the picture is a button', empty.slot === 'Drop an image' && empty.tag === 'BUTTON', empty.slot);
check('empty: the drop zone in the settings', empty.drop);
check('empty: no Pick', !empty.pick);

// 3 x 2: red green blue / white black grey, as the iOS self-check
const paste = (name, target = 'body') =>
	page.evaluate(
		async ({ name, target }) => {
			const canvas = document.createElement('canvas');
			canvas.width = 3;
			canvas.height = 2;
			const context = canvas.getContext('2d');
			['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#808080'].forEach((c, i) => {
				context.fillStyle = c;
				context.fillRect(i % 3, Math.floor(i / 3), 1, 1);
			});
			const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
			const data = new DataTransfer();
			data.items.add(new File([blob], name, { type: 'image/png' }));
			const event =
				target === 'body'
					? new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
					: new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true });
			document.querySelector(target).dispatchEvent(event);
		},
		{ name, target },
	);

await paste('grid.png');
await page.waitForSelector('.pp-source', { timeout: 5000 });
await sleep(300);
const loaded = await page.evaluate(() => {
	const area = document.querySelector('.pp-area');
	return {
		title: document.querySelector('.pp-source .canon-row-title').textContent.trim(),
		detail: document.querySelector('.pp-source .canon-row-detail').textContent.trim(),
		role: area.getAttribute('role'),
		label: area.getAttribute('aria-label'),
		tab: area.tabIndex,
		live: area.querySelector('output')?.getAttribute('aria-live'),
		reading: area.querySelector('output')?.textContent.trim(),
		pixelated: !!document.querySelector('.pp-image--magnified'),
		loupe: !!document.querySelector('.pp-loupe .canon-loupe'),
		pick: document.querySelector('.pp-pick-button')?.checkVisibility(),
		p3: document.querySelector('.pp-p3 .canon-value-line-value')?.textContent.trim(),
	};
});
check('a paste anywhere loads the image', loaded.title === 'grid.png' && loaded.detail === '3 × 2', `${loaded.title} ${loaded.detail}`);
check('the picture is focusable and named', loaded.role === 'group' && loaded.label === 'Image' && loaded.tab === 0);
check('a live output reads the sample', loaded.live === 'polite' && /#000000$/.test(loaded.reading ?? ''), loaded.reading);
check('starts on the centre pixel', (await strip()) === '#000000', await strip());
check('magnified pixels stay sharp', loaded.pixelated);
check('the loupe is shown', loaded.loupe);
check('Pick shows once an image is in', loaded.pick);
check('the P3 value line', /^color\(display-p3 0\.0000 0\.0000 0\.0000\)$/.test(loaded.p3 ?? ''), loaded.p3);
check('the card shows the sample', (await text('.pp-card .canon-colour-card-name')) === (await text('.canon-colour-strip-name')));

// keyboard: arrows move one pixel, Enter picks
await page.focus('.pp-area');
await page.keyboard.press('ArrowRight');
check('ArrowRight moves one pixel', (await strip()) === '#808080', await strip());
await page.keyboard.press('ArrowUp');
check('ArrowUp moves one pixel', (await strip()) === '#0000FF', await strip());
await page.keyboard.press('ArrowRight');
check('the edge holds', (await strip()) === '#0000FF', await strip());
await page.keyboard.press('Enter');
await sleep(200);
let rows = await page.$$eval('.pp-pick-value', (els) => els.map((e) => e.textContent.trim()));
check('Enter picks', rows.join() === '#0000FF', rows.join());

// pointer: a click moves the lens there without picking; Pick under the lens picks
const cell = (x, y) =>
	page.evaluate(
		({ x, y }) => {
			const box = document.querySelector('.pp-image').getBoundingClientRect();
			return { x: box.left + ((x + 0.5) / 3) * box.width, y: box.top + ((y + 0.5) / 2) * box.height };
		},
		{ x, y },
	);
const lensParts = () =>
	page.evaluate(() => ({
		pick: !!document.querySelector('.pp-lens-pick'),
		detail: document.querySelector('.pp-lens-detail')?.textContent.trim() ?? null,
	}));
let at = await cell(0, 0);
await page.mouse.click(at.x, at.y);
await sleep(500);
rows = await page.$$eval('.pp-pick-value', (els) => els.map((e) => e.textContent.trim()));
check('a click moves the lens there', (await strip()) === '#FF0000', await strip());
check('and does not pick', rows.join() === '#0000FF', rows.join());
let parts = await lensParts();
check('at rest: Pick under the lens, the value above it', parts.pick && parts.detail === '#FF0000', JSON.stringify(parts));
const lensBoxes = await page.evaluate(() => {
	const box = (q) => document.querySelector(q).getBoundingClientRect();
	const [lens, pick, detail] = [box('.pp-loupe .canon-loupe'), box('.pp-lens-pick'), box('.pp-lens-detail')];
	return {
		under: pick.top >= lens.bottom && pick.top - lens.bottom < 12 && Math.abs(pick.left + pick.width / 2 - (lens.left + lens.width / 2)) < 2,
		above: detail.bottom <= lens.top && lens.top - detail.bottom < 12,
	};
});
check('directly under and above it', lensBoxes.under && lensBoxes.above, JSON.stringify(lensBoxes));
await page.click('.pp-lens-pick');
await sleep(200);
rows = await page.$$eval('.pp-pick-value', (els) => els.map((e) => e.textContent.trim()));
check('Pick under the lens picks', rows.join() === '#0000FF,#FF0000', rows.join());

// a drag anywhere moves the lens by the drag, not to the press; no pick
at = await cell(1, 1);
const to = await cell(2, 1);
await page.mouse.move(at.x, at.y);
await page.mouse.down();
await page.mouse.move((at.x + to.x) / 2, at.y, { steps: 4 });
parts = await lensParts();
check('while dragging, no Pick and no value', !parts.pick && parts.detail === null, JSON.stringify(parts));
await page.mouse.move(to.x, to.y, { steps: 4 });
await page.mouse.up();
await sleep(200);
check('a drag moves the lens by its travel', (await strip()) === '#00FF00', await strip());
check('a drag does not pick', (await page.$$('.pp-pick')).length === 2);
parts = await lensParts();
check('Pick and the value come back when it stops', parts.pick && parts.detail === '#00FF00', JSON.stringify(parts));
check('no hover preview', await (async () => {
	const c = await cell(2, 1);
	await page.mouse.move(c.x, c.y);
	await sleep(100);
	return (await strip()) === '#00FF00';
})());
// recall, copy, remove, clear
await page.click('.pp-pick-cell');
await sleep(200);
check('a pick row recalls its pixel', (await strip()) === '#0000FF');
check('the recalled row is lit', (await page.$eval('.pp-pick', (el) => el.classList.contains('pp-pick--lit'))));
await page.click('.pp-pick-copy');
await sleep(200);
check('Copy copies the value', (await page.evaluate(() => navigator.clipboard.readText())) === '#0000FF');
await page.click('.pp-pick-remove');
await sleep(200);
rows = await page.$$eval('.pp-pick-value', (els) => els.map((e) => e.textContent.trim()));
check('Remove drops the row', rows.join() === '#FF0000', rows.join());
await page.click('.pp-pick-button');
await sleep(200);
check('the Pick button picks', (await page.$$('.pp-pick')).length === 2);
await page.click('.pp-clear');
await sleep(200);
check('Clear empties the list', (await page.$$('.pp-pick')).length === 0);

// header notation
await page.evaluate(() => localStorage.setItem('colour-notation', 'hsv'));
await visit(page, '/tools/pixel-picker?pickerImage&pickerPicks=10,10');
await page.waitForSelector('.pp-pick', { timeout: 5000 });
const notation = await page.evaluate(() => ({
	strip: document.querySelector('.canon-colour-strip-value').textContent.trim(),
	row: document.querySelector('.pp-pick-value').textContent.trim(),
	card: [...document.querySelectorAll('.pp-card .canon-value-line-label')].map((l) => l.textContent.trim()),
}));
check('the strip follows the header notation', notation.strip.startsWith('hsv('), notation.strip);
check('the rows follow it', notation.row.startsWith('hsv('), notation.row);
check('the card shows it with hex', notation.card.join() === 'HSV,HEX', notation.card.join());
await page.evaluate(() => localStorage.removeItem('colour-notation'));

// drop anywhere replaces; a non-image is ignored
await paste('dropped.png', '.canon-split-main');
await sleep(500);
check('a drop anywhere replaces the image', (await text('.pp-source .canon-row-title')) === 'dropped.png');
check('a new image clears the picks', (await page.$$('.pp-pick')).length === 0);
await page.evaluate(() => {
	const data = new DataTransfer();
	data.items.add(new File(['x'], 'note.txt', { type: 'text/plain' }));
	document.querySelector('.canon-split-main').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
});
await sleep(200);
check('a dropped non-image is ignored', (await text('.pp-source .canon-row-title')) === 'dropped.png');
await page.evaluate(() => [...document.querySelectorAll('.pp-source button')].find((b) => b.textContent.trim() === 'Clear').click());
await sleep(200);
check('Clear brings the slot back', !!(await page.$('.pp-slot')) && !(await page.$('.pp-source')));

// phone: the picture collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/pixel-picker?pickerImage&pickerPicks=10,10;200,300;400,400;800,800');
await page.waitForSelector('.pp-pick', { timeout: 5000 });
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.pixel-picker .canon-split-body');
	const canvas = () => document.querySelector('.pixel-picker .canon-canvas').getBoundingClientRect().height;
	// the picks scrolled the page already
	const full = parseFloat(document.querySelector('.pixel-picker').style.getPropertyValue('--canon-split-full'));
	body.scrollTop = 2000;
	await new Promise((r) => setTimeout(r, 200));
	const footer = document.querySelector('.pp-pick-button').getBoundingClientRect();
	const last = [...document.querySelectorAll('.pixel-picker .canon-split-main .canon-rows')].at(-1).getBoundingClientRect();
	return {
		full,
		band: canvas(),
		wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
		clear: last.bottom <= footer.top + 1,
	};
});
check('phone: the picture is first and large', phone.full > 250, String(phone.full));
check('phone: the picture collapses to its band', phone.band <= 250, String(phone.band));
check('phone: no horizontal scroll', !phone.wide);
check('phone: the last block scrolls clear of Pick', phone.clear);


// picking never moves the layout: five picks, same boxes, nothing scrolled
const layout = () =>
	page.evaluate(() => {
		const box = (q) => {
			const r = document.querySelector(q)?.getBoundingClientRect();
			return r ? [r.top, r.height].map(Math.round).join('/') : '-';
		};
		const scrolls = ['.dt-main', '.pixel-picker .canon-split-main', '.pixel-picker .canon-split-body']
			.map((q) => document.querySelector(q)?.scrollTop ?? 0)
			.join(',');
		return `${box('.pixel-picker .canon-canvas')} ${box('.pp-image')} ${box('.pp-card')} ${box('.pp-pick-button')} ${box('.pp-picks')} ${scrolls}`;
	});
for (const [width, height] of [
	[1400, 1000],
	[390, 844],
]) {
	await page.setViewport({ width, height });
	await visit(page, '/tools/pixel-picker?pickerImage');
	await page.waitForSelector('.pp-lens-pick', { timeout: 5000 });
	await sleep(300);
	const before = await layout();
	for (let i = 0; i < 5; i++) {
		await page.evaluate(() => document.querySelector('.pp-lens-pick').click());
		await sleep(150);
	}
	await sleep(600);
	const after = await layout();
	check(`${width}: five picks leave the layout as it was`, before === after, `${before} | ${after}`);
	check(`${width}: and are all listed`, (await page.$$('.pp-pick')).length === 5);
	check(
		`${width}: the newest scrolled into view inside the list`,
		await page.evaluate(() => {
			const list = document.querySelector('.pp-picks');
			const last = list.lastElementChild.getBoundingClientRect();
			return list.scrollTop > 0 && last.bottom <= list.getBoundingClientRect().bottom + 1;
		}),
	);
}

// phone, touch: a finger drags the lens without scrolling the page
await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
await visit(page, '/tools/pixel-picker?pickerImage');
await page.waitForSelector('.pp-lens-pick', { timeout: 5000 });
await sleep(300);
const scrollSum = () =>
	page.evaluate(() =>
		['.dt-main', '.pixel-picker .canon-split-main', '.pixel-picker .canon-split-body']
			.map((q) => document.querySelector(q)?.scrollTop ?? 0)
			.reduce((a, b) => a + b, 0),
	);
const startValue = await strip();
const startAt = await page.evaluate(() => {
	const image = document.querySelector('.pp-image').getBoundingClientRect();
	const lens = document.querySelector('.pp-loupe .canon-loupe').getBoundingClientRect();
	// a point on the image, clear of the lens and its Pick
	const x = lens.left > image.left + 60 ? image.left + 20 : image.right - 20;
	return { x, y: image.top + 20 };
});
const touch = await page.touchscreen.touchStart(startAt.x, startAt.y);
for (let i = 1; i <= 8; i++) await touch.move(startAt.x + (startAt.x < 195 ? i * 6 : -i * 6), startAt.y + i * 8);
await sleep(100);
const midDrag = await lensParts();
const midScroll = await scrollSum();
await touch.end();
await sleep(400);
check('touch: a drag moves the lens', (await strip()) !== startValue, `${startValue} -> ${await strip()}`);
check('touch: the page does not scroll during the drag', midScroll === 0 && (await scrollSum()) === 0, String(midScroll));
check('touch: no Pick during the drag', !midDrag.pick);
parts = await lensParts();
check('touch: Pick appears after release', parts.pick, JSON.stringify(parts));
const pickAt = await page.$eval('.pp-lens-pick', (el) => {
	const r = el.getBoundingClientRect();
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
const pickedValue = await strip();
await page.touchscreen.tap(pickAt.x, pickAt.y);
await sleep(300);
rows = await page.$$eval('.pp-pick-value', (els) => els.map((e) => e.textContent.trim()));
check('touch: Pick adds the colour', rows.join() === pickedValue, rows.join());
// the emulated finger does scroll elsewhere, so the check above has teeth
const cardAt = await page.$eval('.pp-card', (el) => {
	const r = el.getBoundingClientRect();
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
const swipe = await page.touchscreen.touchStart(cardAt.x, cardAt.y);
for (let i = 1; i <= 8; i++) await swipe.move(cardAt.x, cardAt.y - i * 25);
await swipe.end();
await sleep(600);
check('touch: a drag on the settings scrolls the page', (await scrollSum()) > 0, String(await scrollSum()));

await finish(browser);
