// the canon colour blindness simulator: solid, types, comparison, image modes, paste, drop

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);

const state = () =>
	page.evaluate(() => {
		const text = (sel) =>
			document.querySelector(sel)?.textContent.trim() ?? '';
		return {
			strip: text('.canon-colour-strip-value'),
			name: text('.canon-colour-strip-name'),
			input: document.querySelector('.cbs-input input')?.value,
			types: [...document.querySelectorAll('.cbs-type')].map((b) => ({
				name: b.querySelector('.cbs-type-name').textContent.trim(),
				detail: b.querySelector('.cbs-type-detail').textContent.trim(),
				value: b.querySelector('.cbs-type-value')?.textContent.trim(),
				pressed: b.getAttribute('aria-pressed'),
				thumb: !!b.querySelector('img'),
			})),
			panes: [...document.querySelectorAll('.cbs-pane')].map((p) => ({
				title: p.querySelector('.cbs-pane-title').textContent.trim(),
				value: p.querySelector('.cbs-pane-value').textContent.trim(),
				background: getComputedStyle(p).backgroundColor,
			})),
			solid: !!document.querySelector('.canon-colour-solid'),
			reading: text('.canon-colour-solid-value'),
			sliders: document.querySelectorAll('.canon-colour-controls [role="slider"]').length,
			about: text('.cbs-about'),
		};
	});

await visit(page, '/tools/colorblind-sim');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.colorblind-sim').getBoundingClientRect()
				.height,
	),
);
let s = await state();
check('starts at #E63946 in the strip', s.strip === '#E63946', s.strip);
check('the field shows the colour', s.input === '#E63946', s.input);
check('the solid is the picture', s.solid);
check('the solid reads its colour out', /#E63946/i.test(s.reading), s.reading);
check('three channel sliders', s.sliders === 3, String(s.sliders));
check('nine simulation types', s.types.length === 9, String(s.types.length));
check('deuteranopia selected first, as iOS', s.types[2].pressed === 'true' && s.types.filter((t) => t.pressed === 'true').length === 1);
check('rows carry severity and the iOS description', s.types[2].detail === 'Full · Green-blind (~1% AMAB)', s.types[2].detail);
check('normal vision has no severity', s.types[0].detail === 'Full colour vision', s.types[0].detail);
check('the normal row keeps the colour', s.types[0].value === '#E63946', s.types[0].value);
check('comparison: original and the selected type', s.panes[0].title === 'Original' && s.panes[1].title === 'Deuteranopia');
check('the about text stays', /8% of AMAB/.test(s.about));

// field first and large: focus selects all, typing replaces live
const field = await page.evaluate(() => {
	const box = document.querySelector('.cbs-input').getBoundingClientRect();
	return { height: box.height };
});
check('the field is primary height', field.height >= 56, String(field.height));
await page.click('.cbs-input input');
await sleep(100);
const selection = await page.evaluate(() => {
	const input = document.querySelector('.cbs-input input');
	return input.selectionEnd - input.selectionStart === input.value.length;
});
check('focus selects the whole value', selection);
await page.keyboard.type('#3366ff');
await sleep(100);
s = await state();
check('typing answers at once', s.strip === '#3366FF', s.strip);
check('rows follow the colour', s.types[0].value === '#3366FF', s.types[0].value);
await page.$eval('.cbs-input input', (input) => input.blur());
await page.click('.cbs-input input');
await sleep(100);
await page.keyboard.type('oklch(0.7 0.1 140)');
await sleep(600);
s = await state();
check('any notation is read', s.strip.startsWith('#') && s.strip !== '#3366FF', s.strip);

// choose a type: comparison follows, keyboard reaches the rows
await page.evaluate(() => document.querySelectorAll('.cbs-type')[7].focus());
await page.keyboard.press('Enter');
await sleep(400);
s = await state();
check('Enter on a row selects it', s.types[7].pressed === 'true');
check('comparison names the type', s.panes[1].title === 'Achromatopsia');
const grey = s.panes[1].background.match(/\d+/g).slice(0, 3);
check('achromatopsia paints grey', grey[0] === grey[1] && grey[1] === grey[2], s.panes[1].background);

// header notation reaches strip, rows and panes
await page.evaluate(() => localStorage.setItem('colour-notation', 'hsv'));
await visit(page, '/tools/colorblind-sim?cbsColour=%23e63946&cbsType=1');
s = await state();
check('the header notation reaches the strip', s.strip.startsWith('hsv('), s.strip);
check('and the rows', s.types.every((t) => t.value.startsWith('hsv(')), s.types[1].value);
check('and the panes', s.panes.every((p) => p.value.startsWith('hsv(')), s.panes[0].value);
check('?cbsType picks the type', s.types[1].pressed === 'true');
await page.evaluate(() => localStorage.removeItem('colour-notation'));

// the strip copies
await page.click('.canon-colour-strip-single');
await sleep(200);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('the strip copies its value', copied.startsWith('hsv(') || copied === '#E63946', copied);

// image mode, empty: the slot and the drop zone
await page.evaluate(() =>
	[...document.querySelectorAll('.cbs-modes [role="radio"], .cbs-modes button')]
		.find((b) => b.textContent.trim() === 'Image')
		.click(),
);
await sleep(300);
const empty = await page.evaluate(() => ({
	slot: document.querySelector('.cbs-slot')?.textContent.replace(/\s+/g, ' ').trim(),
	tag: document.querySelector('.cbs-slot')?.tagName,
	drop: !!document.querySelector('.cbs-drop'),
	comparison: !!document.querySelector('.cbs-compare'),
	sliders: !!document.querySelector('.canon-colour-controls'),
}));
check('empty image mode: the picture is a button', empty.slot === 'Drop an image' && empty.tag === 'BUTTON', empty.slot);
check('the drop zone in the settings', empty.drop);
check('no colour controls or comparison', !empty.comparison && !empty.sliders);

const paste = (name, width, height, target = 'body') =>
	page.evaluate(
		async ({ name, width, height, target }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			context.fillStyle = '#ff0000';
			context.fillRect(0, 0, width / 2, height);
			context.fillStyle = '#00ff00';
			context.fillRect(width / 2, 0, width / 2, height);
			const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
			const data = new DataTransfer();
			data.items.add(new File([blob], name, { type: 'image/png' }));
			const event =
				target === 'body'
					? new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
					: new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true });
			document.querySelector(target === 'body' ? 'body' : target).dispatchEvent(event);
		},
		{ name, width, height, target },
	);

await paste('pair.png', 200, 100);
await page.waitForSelector('.cbs-source', { timeout: 5000 });
await page.waitForFunction(() => document.querySelectorAll('.canon-image-compare img').length === 2, { timeout: 5000 });
const loaded = await page.evaluate(() => ({
	title: document.querySelector('.cbs-source .canon-row-title').textContent.trim(),
	detail: document.querySelector('.cbs-source .canon-row-detail').textContent.trim(),
	role: document.querySelector('.canon-image-compare').getAttribute('role'),
	label: document.querySelector('.canon-image-compare').getAttribute('aria-label'),
	thumbs: document.querySelectorAll('.cbs-type-swatch img').length,
	values: document.querySelectorAll('.cbs-type-value').length,
	download: document.querySelector('.cbs-download')?.disabled,
	downloadText: document.querySelector('.cbs-download')?.textContent.trim(),
}));
check('a paste anywhere loads the image', loaded.title === 'pair.png' && loaded.detail === '200 × 100', `${loaded.title} ${loaded.detail}`);
check('the compare is a named slider', loaded.role === 'slider' && loaded.label === 'Original, Protanopia', loaded.label);
check('rows show thumbnails, no values', loaded.thumbs === 9 && loaded.values === 0, String(loaded.thumbs));
check('Download is ready', loaded.download === false);
check('the download names what it saves', loaded.downloadText === 'Download colourblind image', loaded.downloadText);

// simulated pixels: protanopia turns pure red to #918e00
const pixel = await page.evaluate(async () => {
	const img = document.querySelector('.canon-image-compare-after img');
	await img.decode();
	const canvas = document.createElement('canvas');
	canvas.width = img.naturalWidth;
	canvas.height = img.naturalHeight;
	const context = canvas.getContext('2d');
	context.drawImage(img, 0, 0);
	return [...context.getImageData(10, 10, 1, 1).data].slice(0, 3);
});
check('protanopia applies the web matrix', pixel.join(',') === '145,142,0', pixel.join(','));

// keyboard on the compare
await page.focus('.canon-image-compare');
await page.keyboard.press('ArrowRight');
check(
	'the compare takes the arrow keys',
	(await page.$eval('.canon-image-compare', (el) => el.getAttribute('aria-valuenow'))) === '60',
);

// side by side
await page.evaluate(() =>
	[...document.querySelectorAll('.cbs-views [role="radio"], .cbs-views button')]
		.find((b) => b.textContent.trim() === 'Side by side')
		.click(),
);
await sleep(300);
const pair = await page.evaluate(() =>
	[...document.querySelectorAll('.cbs-pair img')].map((i) => i.alt),
);
check('side by side shows both, named', pair.join('|') === 'Original|Simulated Protanopia', pair.join('|'));

// another type renders and caches
await page.evaluate(() => document.querySelectorAll('.cbs-type')[3].click());
await page.waitForFunction(() => document.querySelectorAll('.cbs-pair img').length === 2, { timeout: 5000 });
check('a new type renders', (await page.$eval('.cbs-pair-pane:last-child figcaption', (el) => el.textContent.trim())) === 'Tritanopia');

// drop anywhere replaces; a non-image is ignored
await paste('dropped.png', 40, 80, '.canon-split-main');
await sleep(500);
check(
	'a drop anywhere replaces the image',
	(await page.$eval('.cbs-source .canon-row-title', (el) => el.textContent.trim())) === 'dropped.png',
);
await page.evaluate(() => {
	const data = new DataTransfer();
	data.items.add(new File(['x'], 'note.txt', { type: 'text/plain' }));
	document
		.querySelector('.canon-split-main')
		.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
});
await sleep(200);
check(
	'a dropped non-image is ignored',
	(await page.$eval('.cbs-source .canon-row-title', (el) => el.textContent.trim())) === 'dropped.png',
);

await page.evaluate(() => {
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#f00"/></svg>';
	const data = new DataTransfer();
	data.items.add(new File([svg], 'shape.svg', { type: 'image/svg+xml' }));
	document
		.querySelector('.canon-split-main')
		.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
});
await page.waitForFunction(() => document.querySelector('.cbs-source .canon-row-title')?.textContent.trim() === 'shape.svg', { timeout: 5000 }).catch(() => {});
const svgLoaded = await page.evaluate(() => [
	document.querySelector('.cbs-source .canon-row-title').textContent.trim(),
	document.querySelector('.cbs-source .canon-row-detail').textContent.trim(),
]);
check('a dropped SVG loads', svgLoaded.join(' ') === 'shape.svg 120 × 60', svgLoaded.join(' '));

await page.evaluate(() =>
	[...document.querySelectorAll('.cbs-source button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check('Clear brings the slot back', !!(await page.$('.cbs-slot')) && !(await page.$('.cbs-source')));

// a drop in colour mode switches to image mode
await visit(page, '/tools/colorblind-sim');
await paste('switch.png', 30, 30, '.canon-split-sidebar');
await page.waitForSelector('.cbs-source', { timeout: 5000 });
check('a drop in colour mode opens image mode', true);

// phone: the picture collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/colorblind-sim');
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.colorblind-sim .canon-split-body');
	const canvas = () =>
		document.querySelector('.colorblind-sim .canon-canvas').getBoundingClientRect().height;
	const full = canvas();
	body.scrollTop = 800;
	await new Promise((r) => setTimeout(r, 200));
	return {
		full,
		band: canvas(),
		wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
	};
});
check('phone: the picture is first and large', phone.full > 300, String(phone.full));
check('phone: the picture collapses to its band', phone.band <= 250, String(phone.band));
check('phone: no horizontal scroll', !phone.wide);


// G4: the solid starts in RGB with the orbit hint, and drifts after 4 s idle
await visit(page, '/tools/colorblind-sim');
const axes = () =>
	page.$$eval('.colorblind-sim .canon-colour-solid-axis', (labels) =>
		labels.map((l) => l.style.translate).join(),
	);
const start = await page.evaluate(() => ({
	space: document
		.querySelector('.canon-colour-controls [role="radio"][aria-checked="true"]')
		?.textContent.trim(),
	hint: document.querySelector('.colorblind-sim .canon-colour-solid-hint')?.textContent.trim(),
}));
check('the solid starts in RGB', start.space === 'RGB', start.space);
check('with the orbit hint', start.hint === 'Drag to orbit', start.hint);
const still = await axes();
await sleep(5500);
check('and drifts after 4 s idle', still !== '' && (await axes()) !== still);

// expanded, the folder tab takes the picture's colour
const tabFill = () =>
	page.evaluate(() => ({
		tab: getComputedStyle(document.querySelector('.dt-tab')).backgroundColor,
		picture: getComputedStyle(
			document.querySelector('.colorblind-sim .canon-canvas-content'),
		).backgroundColor,
		sheet: getComputedStyle(document.querySelector('.dt-sheet')).backgroundColor,
	}));
await page.setViewport({ width: 2200, height: 1100 });
await page.evaluate(() =>
	localStorage.setItem('dt-canon-expanded', JSON.stringify(['colorblind-sim'])),
);
await visit(page, '/tools/colorblind-sim');
let fill = await tabFill();
check('expanded, the tab matches the picture', fill.tab === fill.picture, `${fill.tab} ${fill.picture}`);
await page.evaluate(() => localStorage.setItem('dt-canon-expanded', '[]'));
await visit(page, '/tools/colorblind-sim');
fill = await tabFill();
check('in the column, the tab matches the sheet', fill.tab === fill.sheet, `${fill.tab} ${fill.sheet}`);
await page.setViewport({ width: 1400, height: 1000 });

await finish(browser);
