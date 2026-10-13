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

// pointer: a click moves the reticle there and picks
const cell = (x, y) =>
	page.evaluate(
		({ x, y }) => {
			const box = document.querySelector('.pp-image').getBoundingClientRect();
			return { x: box.left + ((x + 0.5) / 3) * box.width, y: box.top + ((y + 0.5) / 2) * box.height };
		},
		{ x, y },
	);
let at = await cell(0, 0);
await page.mouse.click(at.x, at.y);
await sleep(200);
rows = await page.$$eval('.pp-pick-value', (els) => els.map((e) => e.textContent.trim()));
check('a click picks the pixel under it', rows.join() === '#0000FF,#FF0000', rows.join());
check('the reticle moved there', (await strip()) === '#FF0000');

// hover previews, leaving restores
at = await cell(1, 0);
await page.mouse.move(at.x, at.y);
await sleep(100);
check('a mouse hover previews', (await strip()) === '#00FF00', await strip());
const outside = await page.evaluate(() => {
	const box = document.querySelector('.pixel-picker .canon-split-main').getBoundingClientRect();
	return { x: box.left + 20, y: box.top + 20 };
});
await page.mouse.move(outside.x, outside.y);
await sleep(100);
check('leaving the picture restores the reticle', (await strip()) === '#FF0000', await strip());

// drag the reticle: no pick on release
at = await cell(0, 0);
const to = await cell(2, 1);
await page.mouse.move(at.x, at.y);
await page.mouse.down();
await page.mouse.move((at.x + to.x) / 2, (at.y + to.y) / 2, { steps: 4 });
await page.mouse.move(to.x, to.y, { steps: 4 });
await page.mouse.up();
await sleep(200);
check('dragging the reticle moves it', (await strip()) === '#808080', await strip());
check('a drag does not pick', (await page.$$('.pp-pick')).length === 2);

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

await finish(browser);
