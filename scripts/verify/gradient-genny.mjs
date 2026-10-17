import { BASE, check, finish, launch, sleep, visit } from './harness.mjs';

const { browser, page } = await launch();

const state = () =>
	page.evaluate(() => {
		const handles = [...document.querySelectorAll('.gg-handle')];
		const chosen = document.querySelector('.gg-handle.is-chosen');
		const text = (sel) => document.querySelector(sel)?.textContent.trim() ?? '';
		const paint = document.querySelector('.gg-paint')?.getBoundingClientRect();
		return {
			handles: handles.length,
			hexes: handles.map((h) => h.dataset.hex),
			values: handles.map((h) => Number(h.getAttribute('aria-valuenow'))),
			chosen: chosen?.dataset.hex,
			chosenValue: Number(chosen?.getAttribute('aria-valuenow')),
			field: document.querySelector('.gg-colour input')?.value,
			css: text('.canon-code-block code, .canon-code-block pre'),
			mode: text('.gg-modes [role="radio"][aria-checked="true"]'),
			angle: document.querySelector('.gg-dial-control')?.getAttribute('aria-valuenow'),
			hub: !!document.querySelector('.gg-hub:not(.gg-knob)'),
			knob: !!document.querySelector('.gg-knob'),
			figure: text('.gg-figure'),
			aspect: paint ? paint.width / paint.height : 0,
			approximate: [...document.querySelectorAll('.canon-status')].some(
				(s) => s.textContent.trim() === 'Approximate',
			),
			rows: [...document.querySelectorAll('.gradient-genny .canon-row')].map((r) =>
				r.textContent.trim().split(/\s+/)[0],
			),
		};
	});

const rectOf = (selector, index = 0) =>
	page.evaluate(
		([sel, i]) => {
			const r = document.querySelectorAll(sel)[i]?.getBoundingClientRect();
			return r && { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
		},
		[selector, index],
	);

const pick = (group, title) =>
	page.evaluate(
		([g, t]) =>
			[...document.querySelectorAll(`${g} [role="radio"]`)]
				.find((b) => b.textContent.trim() === t)
				?.click(),
		[group, title],
	);

const button = (title) =>
	page.evaluate((t) => {
		const b = [...document.querySelectorAll('.gradient-genny button')].find(
			(x) => x.textContent.trim() === t,
		);
		b?.click();
		return b ? !b.disabled : false;
	}, title);

const disabled = (title) =>
	page.evaluate(
		(t) =>
			[...document.querySelectorAll('.gradient-genny button')].find(
				(x) => x.textContent.trim() === t,
			)?.disabled,
		title,
	);

const drag = async (from, to, steps = 12) => {
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	for (let i = 1; i <= steps; i++) {
		await page.mouse.move(
			from.x + ((to.x - from.x) * i) / steps,
			from.y + ((to.y - from.y) * i) / steps,
		);
		await sleep(16);
	}
};

await visit(page, '/tools/gradient-genny');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.gradient-genny').getBoundingClientRect().height,
	),
);
let s = await state();
check(
	'starts linear at 90° with two stops, the first chosen',
	s.mode === 'Linear' && s.angle === '90' && s.handles === 2 && s.chosen === '#3B82F6',
	JSON.stringify({ mode: s.mode, angle: s.angle, handles: s.handles, chosen: s.chosen }),
);
check('the field shows the chosen stop', s.field === '#3B82F6', s.field);
check(
	'the CSS block writes the linear gradient',
	s.css.startsWith('background: linear-gradient(90deg,') && s.css.includes('#3B82F6 0%'),
	s.css,
);
check('the picture takes the 800 × 600 aspect', Math.abs(s.aspect - 4 / 3) < 0.02, s.aspect);
check(
	'the canvas is a named picture',
	await page.evaluate(
		() => document.querySelector('canvas.gg-paint')?.getAttribute('role') === 'img',
	),
);
check(
	'every handle and grip is named and focusable',
	await page.evaluate(() =>
		[...document.querySelectorAll('.gg-handle, .gg-hub-control, .gg-dial-control')].every(
			(el) => el.getAttribute('aria-label') && el.tabIndex === 0,
		),
	),
);

// click on the line adds a stop there, in the colour already there
const paint = await rectOf('.gg-paint');
await page.mouse.click(paint.x + paint.w * 0.25, paint.cy);
await sleep(200);
s = await state();
check(
	'a click on the line adds a stop and chooses it',
	s.handles === 3 && s.chosenValue >= 23 && s.chosenValue <= 27,
	JSON.stringify(s.values),
);
check('the CSS lists three stops', (s.css.match(/%/g) ?? []).length === 3, s.css);

// drag the new stop along the line
let chosen = await rectOf('.gg-handle.is-chosen');
await drag({ x: chosen.cx, y: chosen.cy }, { x: paint.x + paint.w * 0.6, y: chosen.cy });
s = await state();
check('dragging shows the position figure', s.figure.startsWith('6'), s.figure);
await page.mouse.up();
await sleep(200);
s = await state();
check(
	'the stop follows the drag along the line',
	s.chosenValue >= 57 && s.chosenValue <= 63 && s.figure === '',
	s.chosenValue,
);

// pull it off the line to remove it
chosen = await rectOf('.gg-handle.is-chosen');
await drag({ x: chosen.cx, y: chosen.cy }, { x: chosen.cx, y: chosen.cy - 140 });
s = await state();
check(
	'pulled off, the stop dims and leaves the gradient',
	(await page.evaluate(() => !!document.querySelector('.gg-handle.is-pulled'))) &&
		(s.css.match(/%/g) ?? []).length === 2,
);
await page.mouse.up();
await sleep(200);
s = await state();
check('released off the line, it is removed', s.handles === 2, s.handles);

// two stops stay: a pull is capped and nothing is removed
chosen = await rectOf('.gg-handle.is-chosen');
await drag({ x: chosen.cx, y: chosen.cy }, { x: chosen.cx, y: chosen.cy - 140 });
await page.mouse.up();
await sleep(200);
s = await state();
check('the last two stops cannot be pulled off', s.handles === 2, s.handles);

// the grip turns the gradient, snapping to 45
const hub = await rectOf('.gg-hub');
const centre = { x: paint.cx, y: paint.cy };
await drag({ x: hub.cx, y: hub.cy }, { x: centre.x - 60, y: centre.y + 1 });
s = await state();
check('turning the grip shows the angle figure', s.figure.endsWith('°'), s.figure);
await page.mouse.up();
await sleep(200);
s = await state();
check('the grip turned the angle by a quarter, snapped', s.angle === '180', s.angle);
check('the CSS follows the angle', s.css.startsWith('background: linear-gradient(180deg'), s.css);

// the dial points where it is clicked
const dial = await rectOf('.gg-dial');
await page.mouse.click(dial.cx, dial.cy - 18);
await sleep(150);
s = await state();
check('a click on the dial points it up', s.angle === '0', s.angle);

// keys move a stop and remove it
await button('Add Stop');
await sleep(150);
s = await state();
check('Add Stop adds in the widest gap', s.handles === 3 && s.chosenValue === 50, s.chosenValue);
await page.focus('.gg-handle.is-chosen');
await page.keyboard.press('ArrowRight');
await page.keyboard.down('Shift');
await page.keyboard.press('ArrowRight');
await page.keyboard.up('Shift');
await sleep(100);
s = await state();
check('arrow keys move the stop, Shift by ten', s.chosenValue === 61, s.chosenValue);
await page.keyboard.press('Delete');
await sleep(150);
s = await state();
check('Delete removes the focused stop', s.handles === 2, s.handles);

// the colour field is first-class input: select on focus, live typing
await page.click('.gg-colour input');
await sleep(100);
check(
	'focus selects the whole colour',
	await page.evaluate(() => {
		const input = document.querySelector('.gg-colour input');
		return input.selectionStart === 0 && input.selectionEnd === input.value.length;
	}),
);
await page.keyboard.type('#00ff00');
await sleep(150);
s = await state();
check('typing recolours the chosen stop live', s.chosen === '#00FF00' && s.css.includes('#00FF00'), `${s.chosen} ${s.css}`);

// pigment blend
await button('Pigment Blend');
await sleep(100);
s = await state();
check('Pigment Blend adds three steps between the two stops', s.handles === 5, s.handles);
await button('Pigment Blend');
await sleep(100);
s = await state();
check(
	'a second blend reaches 17 and switches itself off',
	s.handles === 17 && (await disabled('Pigment Blend')),
	s.handles,
);

// interpolation
await pick('.gradient-genny .canon-row', 'OKLCH');
await sleep(100);
s = await state();
check('interpolation writes `in oklch`', s.css.includes(' in oklch,'), s.css);

// radial: centre row and grip
await pick('.gg-modes', 'Radial');
await sleep(200);
s = await state();
check(
	'Radial shows the centre row, no angle row',
	s.rows.includes('Centre') && !s.rows.includes('Angle') && s.hub,
	s.rows.join(),
);
const grip = await rectOf('.gg-hub');
await drag({ x: grip.cx, y: grip.cy }, { x: grip.cx - paint.w * 0.2, y: grip.cy - paint.h * 0.2 });
await page.mouse.up();
await sleep(200);
s = await state();
check('dragging the centre moves the radial centre', /circle at 3\d% 3\d%/.test(s.css), s.css.split('\n')[0]);
check('Reset is on once the centre moved', (await disabled('Reset')) === false);
await button('Reset');
await sleep(100);
s = await state();
check('Reset centres it', s.css.includes('circle at 50% 50%'), s.css.split('\n')[0]);

// conic: knob and Start title
await pick('.gg-modes', 'Conic');
await sleep(200);
s = await state();
check('Conic shows Start, the centre and the ring knob', s.rows.includes('Start') && s.rows.includes('Centre') && s.knob, s.rows.join());
await page.focus('.gg-knob .gg-hub-control');
await page.keyboard.press('ArrowUp');
await sleep(100);
s = await state();
check('the knob takes arrow keys', s.css.includes('from 1deg'), s.css.split('\n')[0]);

// corners
await pick('.gg-modes', 'Corners');
await sleep(200);
s = await state();
check('Corners shows four corner handles and no stops rows', s.handles === 4 && !s.rows.includes('Position'), s.rows.join());
await pick('.gradient-genny .canon-rows', 'Bottom Right');
await sleep(150);
s = await state();
check('the corner picker chooses a corner', s.chosen === '#F59E0B' && s.field === '#F59E0B', s.chosen);
const corner = await rectOf('.gg-handle', 1);
await page.mouse.click(corner.cx, corner.cy);
await sleep(150);
s = await state();
check('a click on a corner chooses it', s.chosen === '#8B5CF6', s.chosen);

// freeform
await pick('.gg-modes', 'Freeform');
await sleep(300);
s = await state();
check('Freeform starts with the 2×2 grid, approximate CSS', s.handles === 4 && s.approximate && s.css.startsWith('/* Freeform'), s.handles);
await page.mouse.click(paint.cx, paint.cy);
await sleep(200);
s = await state();
check('a click on the image adds a point', s.handles === 5, s.handles);
const point = await rectOf('.gg-handle.is-chosen');
await drag({ x: point.cx, y: point.cy }, { x: point.cx + 60, y: point.cy + 40 });
s = await state();
check('dragging a point shows its position', /%/.test(s.figure), s.figure);
await page.mouse.up();
await sleep(200);
const moved = await page.evaluate(() => document.querySelector('.gg-handle.is-chosen').getAttribute('aria-valuetext'));
check('the point moved', moved !== '50 %, 50 %', moved);
await pick('.gradient-genny .canon-row', '3×3');
await sleep(200);
s = await state();
check('3×3 seeds nine points', s.handles === 9, s.handles);

// image size
await pick('.gradient-genny .canon-rows', 'Story');
await sleep(400);
s = await state();
check('Story shapes the picture to 9:16', Math.abs(s.aspect - 1080 / 1920) < 0.02, s.aspect);

// download writes the PNG at the export size
await page.evaluate(() => {
	window.__saved = null;
	URL.revokeObjectURL = () => {};
	HTMLAnchorElement.prototype.click = function () {
		window.__saved = { href: this.href, name: this.download };
	};
});
await page.evaluate(() =>
	[...document.querySelectorAll('.gradient-genny button')]
		.find((b) => b.textContent.trim() === 'Download PNG')
		.click(),
);
await page.waitForFunction(() => window.__saved, { timeout: 10000 });
const saved = await page.evaluate(async () => {
	const blob = await (await fetch(window.__saved.href)).blob();
	const bitmap = await createImageBitmap(blob);
	return { name: window.__saved.name, type: blob.type, w: bitmap.width, h: bitmap.height };
});
check(
	'Download PNG saves the gradient at the export size',
	saved.name === 'gradient-freeform.png' && saved.type === 'image/png' && saved.w === 1080 && saved.h === 1920,
	JSON.stringify(saved),
);

// linear: a drag anywhere off the handles turns the gradient
await visit(page, '/tools/gradient-genny');
const field = await rectOf('.gg-paint');
s = await state();
await drag({ x: field.x + field.w * 0.3, y: field.y + field.h * 0.15 }, { x: field.x + field.w * 0.85, y: field.y + field.h * 0.4 });
await page.mouse.up();
await sleep(200);
const turned = await state();
check(
	'linear: a drag on the image turns it, no stop added',
	turned.angle !== s.angle && turned.handles === s.handles,
	`${s.angle} -> ${turned.angle}, ${turned.handles} stops`,
);

// radial: the crosshair stays under the pointer when the far corner flips
await visit(page, '/tools/gradient-genny?gradType=radial');
const cross = await rectOf('.gg-hub');
const target = { x: cross.cx - field.w * 0.25, y: cross.cy - field.h * 0.25 };
await drag({ x: cross.cx, y: cross.cy }, target, 20);
const held = await rectOf('.gg-hub');
const outer = await page.evaluate(() => {
	const stops = [...document.querySelectorAll('.gg-handle')];
	const last = stops.sort((a, b) => b.getAttribute('aria-valuenow') - a.getAttribute('aria-valuenow'))[0].getBoundingClientRect();
	const image = document.querySelector('.gg-paint').getBoundingClientRect();
	return { x: last.x + last.width / 2 - image.right, y: last.y + last.height / 2 - image.bottom };
});
await page.mouse.up();
await sleep(200);
check(
	'radial: the outer stop flipped to the bottom right corner',
	Math.hypot(outer.x, outer.y) < 2,
	JSON.stringify(outer),
);
check(
	'radial: the crosshair stays within 1 px of the pointer',
	Math.hypot(held.cx - target.x, held.cy - target.y) <= 1,
	`${(held.cx - target.x).toFixed(2)}, ${(held.cy - target.y).toFixed(2)}`,
);

// conic: the ring is as big near the left and right edges as near the top and bottom
const ring = async (centre) => {
	await visit(page, `/tools/gradient-genny?gradType=conic&gradSize=1080x1080&gradCentre=${centre}`);
	return page.evaluate(() => Number(/a([\d.]+) /.exec(document.querySelector('.gg-lines-ink').getAttribute('d'))[1]));
};
const radii = [];
for (const centre of ['15,50', '85,50', '50,15', '50,85']) radii.push(await ring(centre));
check(
	'conic: the ring radius is the same near every edge',
	Math.max(...radii) - Math.min(...radii) < 0.5,
	radii.join(', '),
);

// ?color= carry and launch flags
await visit(page, '/tools/gradient-genny?color=ff0000');
s = await state();
check('?color= leads the gradient', s.chosen === '#FF0000' && s.field === '#FF0000', `${s.chosen} ${s.field}`);
await visit(page, '/tools/gradient-genny?gradType=mesh');
s = await state();
check('?gradType=mesh opens Freeform', s.mode === 'Freeform', s.mode);
await visit(page, '/tools/gradient-genny?gradType=conic&gradSpace=1&gradAngle=45&gradStops=ffd400@0,0033ff@100&gradSelect=1&gradNoise=20');
s = await state();
check(
	'launch flags set type, space, angle, stops and selection',
	s.mode === 'Conic' && s.css.includes('from 45deg') && s.css.includes(' in oklab') && s.chosen === '#0033FF',
	`${s.mode} ${s.chosen} ${s.css.split('\n')[0]}`,
);
check(
	'the noise flag reaches the slider',
	await page.evaluate(() =>
		[...document.querySelectorAll('.gradient-genny .canon-slider')].some(
			(el) => el.getAttribute('aria-valuetext') === '20 %',
		),
	),
);

// phone: stacked, no sideways scroll, the picture collapses
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/gradient-genny');
const phone = await page.evaluate(() => {
	const main = document.querySelector('.dt-main');
	return {
		sideways: main.scrollWidth > main.clientWidth,
		docScroll: document.scrollingElement.scrollHeight > innerHeight,
		before: document.querySelector('.gradient-genny .canon-canvas').getBoundingClientRect().height,
	};
});
check('390: no sideways scroll, the document does not scroll', !phone.sideways && !phone.docScroll, JSON.stringify(phone));
const cut = await page.$$eval('.gg-modes .canon-button-title', (titles) =>
	titles.filter((t) => t.scrollWidth > t.clientWidth).map((t) => `${t.textContent} ${t.clientWidth}/${t.scrollWidth}`),
);
check('390: every type title fits its segment', cut.length === 0, cut.join(', '));
await page.evaluate(
	() => (document.querySelector('.gradient-genny .canon-split-body').scrollTop = 800),
);
await sleep(400);
const collapsed = await page.evaluate(() => ({
	band: document.querySelector('.gradient-genny .canon-canvas').getBoundingClientRect().height,
	image: document.querySelector('.gg-paint').getBoundingClientRect().height,
}));
check(
	'390: the picture collapses to 240 px and the image refits',
	phone.before > 240 && Math.round(collapsed.band) === 240 && collapsed.image < 240 - 60,
	`${phone.before} → ${JSON.stringify(collapsed)}`,
);

console.log(`\nbase ${BASE}`);
await finish(browser);
