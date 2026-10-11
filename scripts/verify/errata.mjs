// errata smoke: open, annotate, page ops, export

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, PDFHexString, PDFName, beginText, degrees, decodePDFRawStream, endText, moveText, setFontAndSize, showText } from 'pdf-lib';
import { BASE, check, finish, launch, sleep } from './harness.mjs';

const { browser, page } = await launch();
await page.goto(`${BASE}/errata`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__errata, { timeout: 20000 });

const src = await PDFDocument.create();
src.addPage([400, 500]).drawText('one', { x: 40, y: 450, size: 24 });
// page 2: a font whose Widths cover only e..o, so a typed z has no glyph
const limited = src.addPage([500, 300]);
limited.node.setFontDictionary(
	PDFName.of('F9'),
	src.context.register(
		src.context.obj({
			Type: 'Font',
			Subtype: 'Type1',
			BaseFont: 'Helvetica',
			Encoding: 'WinAnsiEncoding',
			FirstChar: 101,
			LastChar: 111,
			Widths: [556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556],
			FontDescriptor: src.context.register(src.context.obj({ Type: 'FontDescriptor', FontName: 'Helvetica', Flags: 32, FontBBox: [-166, -225, 1000, 931], ItalicAngle: 0, Ascent: 718, Descent: -207, CapHeight: 718, StemV: 88 })),
		}),
	),
);
limited.pushOperators(beginText(), setFontAndSize('F9', 24), moveText(40, 250), showText(PDFHexString.of('6f6e65')), endText());
const bytes = [...(await src.save())];

await page.evaluate(
	(b) => window.__errata.open(new Uint8Array(b).buffer, 'fixture.pdf', 'application/pdf'),
	bytes,
);
await page.waitForFunction(() => window.__errata.doc()?.pages.length === 2, {
	timeout: 10000,
});
await sleep(600);

const doc = () => page.evaluate(() => window.__errata.doc());
const objects = async () => (await doc()).pages[await page.evaluate(() => window.__errata.pageIndex())].objects;

check('page label', (await page.$eval('[data-page-label]', (e) => e.textContent.trim())) === 'Page 1 / 2');
check('rail cells', (await page.$$('.err-page-cell')).length === 2);
check('thumb rendered', await page.$eval('.err-page-thumb', (i) => i.src.startsWith('data:image/png') && i.naturalWidth > 0));

const box = await page.$eval('.sub-canvas-wrap canvas', (c) => {
	const r = c.getBoundingClientRect();
	return { x: r.left, y: r.top, w: r.width, h: r.height };
});
const cx = box.x + box.w / 2;
const cy = box.y + box.h / 2;

// content tool: move a source text run, delete it, undo
await page.keyboard.press('e');
await sleep(700);
const rect0 = await page.evaluate(() => window.__errata.pageRect(0));
const line = await page.evaluate(async () => (await window.__errata.content(0)).lines[0]);
check('content line', line && line.text === 'one', JSON.stringify(line));
const zoom = rect0.w / 400;
const lx = rect0.x + (line.box.x + line.box.width / 2) * zoom;
const ly = rect0.y + (line.box.y + line.box.height / 2) * zoom;
await page.mouse.move(lx, ly);
await page.mouse.down();
await page.mouse.move(lx + 20 * zoom, ly + 10 * zoom, { steps: 8 });
await page.mouse.move(lx + 40 * zoom, ly + 20 * zoom, { steps: 8 });
await page.mouse.up();
await sleep(900);
let edits = (await doc()).pages[0].edits;
check('content moved', edits.length === 1 && edits[0].kind === 'move' && Math.abs(edits[0].dx - 40) < 1.5 && Math.abs(edits[0].dy + 20) < 1.5, JSON.stringify(edits));
const movedLine = await page.evaluate(async () => (await window.__errata.content(0)).lines[0]);
check('content re-read', Math.abs(movedLine.box.x - line.box.x - edits[0].dx) < 0.01 && Math.abs(movedLine.box.y - line.box.y + edits[0].dy) < 0.01, JSON.stringify(movedLine.box));
check('content stays selected', await page.evaluate(() => window.__errataCanvas.getActiveObject()?.hoverCursor === 'move'));
check('content hud', await page.$eval('.err-hud', (h) => !h.hidden && /Text · Helvetica 24/.test(h.textContent) && /pt$/.test(h.textContent)), await page.$eval('.err-hud', (h) => h.textContent));
const hudLeft = await page.$eval('.err-hud', (h) => h.getBoundingClientRect().left);
check('content hud placed', Math.abs(hudLeft - (rect0.x + movedLine.box.x * zoom)) < 4, `${hudLeft} vs ${rect0.x + movedLine.box.x * zoom}`);
await page.keyboard.press('Backspace');
await sleep(900);
edits = (await doc()).pages[0].edits;
check('content deleted', edits.length === 2 && edits[1].kind === 'delete', JSON.stringify(edits));
check('content gone', (await page.evaluate(async () => (await window.__errata.content(0)).lines.length)) === 0);
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(600);
check('content undo', (await doc()).pages[0].edits.length === 1);
await sleep(600);

// text editing: double-click the line, type, Enter
const line2 = await page.evaluate(async () => (await window.__errata.content(0)).lines[0]);
const ex = rect0.x + (line2.box.x + line2.box.width / 2) * zoom;
const ey = rect0.y + (line2.box.y + line2.box.height / 2) * zoom;
await page.mouse.click(ex, ey);
await page.mouse.click(ex, ey);
await sleep(700);
check('text editor open', await page.evaluate(() => window.__errataCanvas.getActiveObject()?.isEditing === true));
check('text editor covers original', await page.evaluate(() => window.__errataCanvas.getActiveObject()?.backgroundColor === '#fff'));
const face0 = await page.evaluate(() => window.__errata.fontFace(0, 'Helvetica'));
check('text editor font', face0 && face0.sample === 'two' && (await page.evaluate(() => window.__errataCanvas.getActiveObject()?.fontFamily)) === face0.family, JSON.stringify(face0));
await page.keyboard.type('two');
await page.keyboard.press('Enter');
await sleep(1000);
edits = (await doc()).pages[0].edits;
check('text edit stored', edits.length === 2 && edits[1].kind === 'text' && edits[1].text === 'two' && edits[1].codes.join() === '116,119,111', JSON.stringify(edits[1]));
check('text edit re-read', (await page.evaluate(async () => (await window.__errata.content(0)).lines[0]?.text)) === 'two');
check('text editor closed', await page.evaluate(() => !window.__errataCanvas.getObjects().some((o) => o.isEditing)));
// a character the font cannot show is refused and the editor stays open
await page.mouse.click(ex, ey);
await page.mouse.click(ex, ey);
await sleep(700);
await page.keyboard.type('→');
await page.keyboard.press('Enter');
await sleep(400);
check('text edit refused', await page.$eval('.err-hud', (h) => !h.hidden && h.textContent.includes('✗')) && (await doc()).pages[0].edits.length === 2);
check('text editor still open', await page.evaluate(() => window.__errataCanvas.getActiveObject()?.isEditing === true));
await page.keyboard.press('Escape');
await sleep(400);
check('text edit cancelled', (await doc()).pages[0].edits.length === 2 && (await page.evaluate(() => !window.__errataCanvas.getObjects().some((o) => o.isEditing))));

// substitute font: page 2's font has no z; the edit goes out in Helvetica and the hud says so
await page.keyboard.press(']');
await sleep(900);
const rect1 = await page.evaluate(() => window.__errata.pageRect(1));
const line3 = await page.evaluate(async () => (await window.__errata.content(1)).lines[0]);
check('limited line', line3?.text === 'one', JSON.stringify(line3));
const zoom1 = rect1.w / 500;
const sx = rect1.x + (line3.box.x + line3.box.width / 2) * zoom1;
const sy = rect1.y + (line3.box.y + line3.box.height / 2) * zoom1;
await page.mouse.click(sx, sy);
await page.mouse.click(sx, sy);
await sleep(700);
check('limited editor open', await page.evaluate(() => window.__errataCanvas.getActiveObject()?.isEditing === true));
await page.keyboard.type('zone');
await sleep(200);
check('hud font unavailable', await page.$eval('.err-hud', (h) => !h.hidden && h.classList.contains('is-warn') && h.textContent === 'Font unavailable'), await page.$eval('.err-hud', (h) => h.className + ' ' + h.textContent));
await page.keyboard.press('Enter');
await sleep(1000);
const subEdits = (await doc()).pages[1].edits;
check('substitute edit stored', subEdits.length === 1 && subEdits[0].kind === 'text' && subEdits[0].font === 'Helvetica' && subEdits[0].codes.join() === '122,111,110,101', JSON.stringify(subEdits));
const subLine = await page.evaluate(async () => { const c = await window.__errata.content(1); return { text: c.lines[0]?.text, warnings: c.warnings }; });
check('substitute re-read', subLine.text === 'zone' && subLine.warnings.length === 0, JSON.stringify(subLine));
check('substitute hud after commit', await page.$eval('.err-hud', (h) => !h.hidden && h.classList.contains('is-warn') && /Helvetica 24/.test(h.textContent) && /Font unavailable/.test(h.textContent)), await page.$eval('.err-hud', (h) => h.textContent));
await page.keyboard.press('[');
await sleep(600);
await page.keyboard.press('v');
await sleep(200);

// image tool: I opens the picker; the chosen file lands centred on the current page
const pngPath = join(tmpdir(), 'errata-harness.png');
const pngData = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 64); return c.toDataURL().split(',')[1]; });
writeFileSync(pngPath, Buffer.from(pngData, 'base64'));
const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 5000 }), page.keyboard.press('i')]);
await chooser.accept([pngPath]);
await sleep(800);
let objs = await objects();
check('image placed', objs.length === 1 && objs[0].kind === 'image' && Math.round(objs[0].cx) === 200 && Math.round(objs[0].cy) === 250 && objs[0].w === 64 && objs[0].h === 64, JSON.stringify(objs[0]).slice(0, 160));
check('image tool returns to select', (await page.$eval('.sub-omni-box .is-active', (b) => b.title)) === 'Select');
// dragged past the page edge it dims; back inside it is opaque again
const imgOpacity = () => page.evaluate(() => window.__errataCanvas.getActiveObject()?.opacity);
check('image opaque inside', (await imgOpacity()) === 1);
const rectImg = await page.evaluate(() => window.__errata.pageRect(0));
const zi = rectImg.w / 400;
const ix = rectImg.x + 200 * zi;
const iy = rectImg.y + 250 * zi;
await page.mouse.move(ix, iy);
await page.mouse.down();
await page.mouse.move(ix - 100 * zi, iy, { steps: 6 });
await page.mouse.move(ix - 250 * zi, iy, { steps: 6 });
check('image dims outside', (await imgOpacity()) === 0, `opacity ${await imgOpacity()}`);
await page.mouse.move(ix - 50 * zi, iy, { steps: 6 });
check('image opaque again', (await imgOpacity()) === 1);
await page.mouse.up();
await sleep(300);
check('image still one object', (await objects()).length === 1);
await page.keyboard.press('Delete');
await sleep(300);
check('image removed', (await objects()).length === 0);

// highlight: drag
await page.keyboard.press('h');
await page.mouse.move(cx - 60, cy - 20);
await page.mouse.down();
await page.mouse.move(cx + 60, cy + 10, { steps: 6 });
await page.mouse.up();
await sleep(200);
objs = await objects();
check('highlight added', objs.length === 1 && objs[0].kind === 'shape' && objs[0].shape === 'highlight', JSON.stringify(objs[0]));
check('highlight size', objs[0] && objs[0].w > 50 && objs[0].h > 10, `${objs[0]?.w}x${objs[0]?.h}`);

// pen: drag
await page.keyboard.press('p');
await page.mouse.move(cx - 40, cy + 60);
await page.mouse.down();
await page.mouse.move(cx + 40, cy + 90, { steps: 8 });
await page.mouse.up();
await sleep(200);
objs = await objects();
check('ink added', objs.length === 2 && objs[1].kind === 'ink' && objs[1].d.startsWith('M'), objs[1]?.d?.slice(0, 30));

// text: click, type, escape
await page.keyboard.press('t');
await page.mouse.click(cx - 100, cy - 120);
await sleep(150);
await page.keyboard.type('Hello');
await page.keyboard.press('Escape');
await sleep(200);
objs = await objects();
check('text added', objs.length === 3 && objs[2].kind === 'text' && objs[2].text === 'Hello', JSON.stringify(objs[2]));
check('text measured', objs[2] && objs[2].w > 10 && objs[2].h > 5, `${objs[2]?.w}x${objs[2]?.h}`);

// select and move the highlight
await page.keyboard.press('v');
await page.mouse.click(cx, cy - 5);
await page.mouse.down();
await page.mouse.move(cx + 30, cy + 25, { steps: 5 });
await page.mouse.up();
await sleep(200);
const moved = (await objects())[0];
check('highlight moved', Math.abs(moved.cx - objs[0].cx) > 5, `${objs[0].cx} -> ${moved.cx}`);

// delete
await page.keyboard.press('Delete');
await sleep(150);
check('delete removes', (await objects()).length === 2);

// undo restores
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(150);
check('undo restores', (await objects()).length === 3);

// rotate current page
const before = (await doc()).pages[0];
await page.click('.err-page-cell.is-current .err-page-action[aria-label="Rotate page"]');
await sleep(400);
const after = (await doc()).pages[0];
check('rotation stored', after.rotation === 90, String(after.rotation));
check('objects carried', after.objects[2].angle === before.objects[2].angle + 90);

// continuous scroll: wheeling down past page 1 changes the current page
await page.keyboard.press('v');
await page.mouse.move(cx, cy);
await page.mouse.wheel({ deltaY: 3000 });
await sleep(400);
check('scroll changes page', (await page.evaluate(() => window.__errata.pageIndex())) === 1);
await page.mouse.wheel({ deltaY: -3000 });
await sleep(400);
check('scroll back', (await page.evaluate(() => window.__errata.pageIndex())) === 0);

// insert a blank page via the navigator gap between page 1 and 2
await page.hover('.err-page-gap[data-index="1"]');
await page.click('.err-page-gap[data-index="1"] [aria-label="Insert blank page"]');
await sleep(200);
check(
	'blank inserted',
	(await doc()).pages.length === 3 && (await doc()).pages[1].sourceIndex === null,
);
check('current follows insert', (await page.evaluate(() => window.__errata.pageIndex())) === 1);
await page.keyboard.press(']');
await sleep(150);
check('page key', (await page.evaluate(() => window.__errata.pageIndex())) === 2);

// toolbox: open the sheet, pick Crop, the mode bar shows
await page.click('[data-toolbox]');
await sleep(500);
check('sheet opens', await page.$eval('.err-sheet', (e) => e.classList.contains('is-open')));
check('bar hidden', await page.$eval('.err-barrow', (e) => e.classList.contains('is-hidden')));
await page.evaluate(() => [...document.querySelectorAll('.err-sheet-cell')].find((b) => b.querySelector('.dt-cell-name')?.textContent.trim() === 'Crop')?.click());
await sleep(500);
check('sheet closes', !(await page.$eval('.err-sheet', (e) => e.classList.contains('is-open'))));
check('mode bar', await page.$eval('.err-mode', (e) => e.classList.contains('is-open')));

// crop page 3 (500x300) by dragging with the crop tool
await sleep(300);
const box3 = await page.evaluate(() => window.__errata.pageRect(2));
check('page 3 rect', !!box3 && box3.w > 100 && box3.h > 50, JSON.stringify(box3));
await page.mouse.move(box3.x + box3.w / 2 - 100, box3.y + box3.h / 2 - 40);
await page.mouse.down();
await page.mouse.move(box3.x + box3.w / 2 + 100, box3.y + box3.h / 2 + 40, { steps: 6 });
await page.mouse.up();
await sleep(300);
let cropped = (await doc()).pages[2];
check('crop stored', !!cropped.crop && cropped.crop.width > 50 && cropped.crop.height > 20, JSON.stringify(cropped.crop));
check('crop inside source', cropped.crop.x >= 0 && cropped.crop.x + cropped.crop.width <= 500);
check('mode bar gone', !(await page.$eval('.err-mode', (e) => e.classList.contains('is-open'))));

// page size: a4 keeps the page landscape, fit, apply
await page.click('.sub-topbar-menu-btn');
await page.evaluate(() => [...document.querySelectorAll('.sub-topbar-item')].find((b) => b.textContent.includes('Page size'))?.click());
await sleep(300);
check('page size dialog', await page.$$eval('dialog.sub-modal', (ds) => ds.some((d) => d.open && d.textContent.includes('Page size'))));
await page.evaluate(() => [...document.querySelectorAll('.sub-modal-opt')].find((b) => b.textContent.trim() === 'A4')?.click());
await page.evaluate(() => [...document.querySelectorAll('.sub-modal-opt')].find((b) => b.textContent.trim() === 'Resample')?.click());
await page.evaluate(() => [...document.querySelectorAll('.sub-modal-opt')].find((b) => b.textContent.trim() === 'Fit page')?.click());
await page.evaluate(() => document.querySelector('.sub-csm-reflow .dt-switch')?.click());
await page.evaluate(() => [...document.querySelectorAll('dialog[open] .sub-modal-btn.is-primary')].find((b) => b.textContent.includes('Apply'))?.click());
await sleep(400);
cropped = (await doc()).pages[2];
check('resize stored', cropped.resize?.mode === 'fit' && Math.round(cropped.resize.width) === 859 && Math.round(cropped.resize.height) === 612 && Math.round(cropped.resize.bleed) === 9, JSON.stringify(cropped.resize));
check('thumb re-rendered', await page.$$eval('.err-page-thumb', (imgs) =>
		Math.abs(imgs[2].naturalWidth / imgs[2].naturalHeight - 859 / 612) < 0.05));

// signature: draw, place
await page.keyboard.press('g');
await sleep(200);
check('signature dialog', await page.$eval('.sub-modal', (d) => d.open));
const pad = await page.$eval('.err-sig-pad', (c) => {
	const r = c.getBoundingClientRect();
	return { x: r.left, y: r.top };
});
await page.mouse.move(pad.x + 40, pad.y + 90);
await page.mouse.down();
await page.mouse.move(pad.x + 200, pad.y + 60, { steps: 10 });
await page.mouse.move(pad.x + 300, pad.y + 120, { steps: 10 });
await page.mouse.up();
await page.click('.sub-modal-footer .is-primary');
await sleep(400);
objs = await objects();
check('signature placed', objs.length === 1 && objs[0].kind === 'image' && objs[0].dataUrl.startsWith('data:image/png'));
check('signature saved', await page.evaluate(() => JSON.parse(localStorage.getItem('errata:signatures') ?? '[]').length === 1));

// export
const out = await page.evaluate(() => window.__errata.export());
check('export bytes', Array.isArray(out) && out.length > 500);
const result = await PDFDocument.load(new Uint8Array(out));
check('export pages', result.getPageCount() === 3);
check('export resized page', Math.round(result.getPage(2).getWidth()) === 859 && Math.round(result.getPage(2).getHeight()) === 612);
check('export rotation', result.getPage(0).getRotation().angle === 90);
// the export wraps the source stream in q/Q streams and appends its own; read them all
const contents0 = result.getPage(0).node.Contents();
const streams0 = contents0.constructor.name === 'PDFArray' ? contents0.asArray().map((r) => result.context.lookup(r)) : [contents0];
const text0 = streams0.map((st) => new TextDecoder('latin1').decode(decodePDFRawStream(st).decode())).join('\n');
check('export edited stream', /Tm\s*\[[-\d.]+\]\s*TJ/.test(text0));
check('export edited text', /<74776f> Tj/i.test(text0));
// the substituted page was resized, so its stream is an embedded XObject: search every stream
const allText = result.context.enumerateIndirectObjects().flatMap(([, obj]) => {
	if (!obj || typeof obj.getContents !== 'function' || obj.constructor.name !== 'PDFRawStream') return [];
	try { return [new TextDecoder('latin1').decode(decodePDFRawStream(obj).decode())]; } catch { return []; }
}).join('\n');
check('export substitute font', /\/ErrHelv 24 Tf\s*<7a6f6e65> Tj\s*\/F9 24 Tf/.test(allText));
// blank copies the rotated page 0 size
check('export blank size', result.getPage(1).getWidth() === 500 && result.getPage(1).getHeight() === 400);

const openCell = async (name) => {
	await page.click('[data-toolbox]');
	await sleep(400);
	await page.evaluate((n) => [...document.querySelectorAll('.err-sheet-cell')].find((b) => b.querySelector('.dt-cell-name')?.textContent.trim() === n)?.click(), name);
	await sleep(500);
};
const modeOpen = (m) => page.$eval('.err-mode[data-mode]', (e, m) => e.classList.contains('is-open') && e.dataset.mode === m, m).catch(() => false);
const clickIn = (label) => page.evaluate((l) => [...document.querySelectorAll('.err-mode.is-open button')].find((b) => b.textContent.trim() === l || b.getAttribute('aria-label') === l)?.click(), label);
const previews = () => page.evaluate(() => window.__errataCanvas.getObjects().filter((o) => !o.evented && typeof o.text === 'string').map((o) => o.text));
const texts = async () => (await doc()).pages.map((p) => p.objects.filter((o) => o.kind === 'text').map((o) => o.text));

await openCell('Page numbers');
check('numbers mode bar', await modeOpen('page-numbers'));
check('numbers markup bar hidden', await page.$eval('.err-barrow', (e) => e.classList.contains('is-hidden')));
check('numbers preview', JSON.stringify(await previews()) === JSON.stringify(['1 / 3', '2 / 3', '3 / 3']), JSON.stringify(await previews()));
await page.keyboard.press('t');
check('numbers mode swallows tool keys', (await page.evaluate(() => document.querySelector('.sub-omni-box .is-active')?.title)) === 'Select');
const beforeNumbers = await texts();
await clickIn('Apply');
await sleep(500);
let afterTexts = await texts();
check('numbers applied', afterTexts.every((t, i) => t.length === beforeNumbers[i].length + 1 && t.at(-1) === `${i + 1} / 3`), JSON.stringify(afterTexts));
check('numbers mode closed', !(await modeOpen('page-numbers')) && (await previews()).length === 0);
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(300);
check('numbers one undo step', JSON.stringify(await texts()) === JSON.stringify(beforeNumbers));
await page.keyboard.down('Meta');
await page.keyboard.down('Shift');
await page.keyboard.press('z');
await page.keyboard.up('Shift');
await page.keyboard.up('Meta');
await sleep(300);

await openCell('Watermark');
check('watermark mode bar', await modeOpen('watermark'));
await clickIn('Current');
await sleep(200);
check('watermark preview current only', (await previews()).length === 1);
const wmPage = await page.evaluate(() => window.__errata.pageIndex());
await clickIn('Apply');
await sleep(500);
const wm = (await doc()).pages[wmPage].objects.at(-1);
check('watermark applied', wm?.kind === 'text' && wm.text === 'DRAFT' && wm.opacity === 0.15 && wm.angle === -45, JSON.stringify(wm));
check('watermark canvas opacity', await page.evaluate((id) => window.__errataCanvas.getObjects().some((o) => o.text === 'DRAFT' && Math.abs(o.opacity - 0.15) < 1e-9 && o.evented), wm?.id));

await openCell('Stamp');
check('stamp mode bar', await modeOpen('stamp'));
await clickIn('Range');
await sleep(200);
check('stamp apply waits for a range', await page.$eval('.err-mode.is-open .sub-modal-btn.is-primary', (b) => b.disabled));
await page.type('.err-mode.is-open input[aria-label="Range"]', '1, 3');
await sleep(200);
await clickIn('Apply');
await sleep(500);
afterTexts = await texts();
check('stamp applied to range', afterTexts[0].includes('APPROVED') && !afterTexts[1].includes('APPROVED') && afterTexts[2].includes('APPROVED'), JSON.stringify(afterTexts));
await openCell('Stamp');
await page.keyboard.press('Escape');
await sleep(300);
check('escape cancels mode', !(await modeOpen('stamp')) && (await previews()).length === 0);

const stamped = await PDFDocument.load(new Uint8Array(await page.evaluate(() => window.__errata.export())));
const gs = stamped.getPage(wmPage).node.Resources()?.lookup(PDFName.of('ExtGState'));
const gsOpacity = gs ? gs.entries().map(([, v]) => String(stamped.context.lookup(v).get(PDFName.of('ca')))) : [];
check('export watermark opacity', gsOpacity.includes('0.15'), JSON.stringify(gsOpacity));

const downloads = mkdtempSync(join(tmpdir(), 'errata-dl-'));
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
const waitFile = async (re) => {
	for (let i = 0; i < 120; i++) {
		const f = readdirSync(downloads).find((n) => re.test(n));
		if (f) return join(downloads, f);
		await sleep(250);
	}
	return null;
};

await openCell('Compress');
check('compress mode bar', await modeOpen('compress'));
await clickIn('Apply');
const compressed = await waitFile(/-compressed\.pdf$/);
check('compress downloads', !!compressed);
if (compressed) check('compress valid pdf', (await PDFDocument.load(readFileSync(compressed))).getPageCount() === 3);
await sleep(300);
check('compress mode closed', !(await modeOpen('compress')));

await openCell('Impose');
check('impose mode bar', await modeOpen('impose'));
await clickIn('Apply');
const imposed = await waitFile(/-imposed-saddle-stitch\.pdf$/);
check('impose downloads', !!imposed);
if (imposed) {
	const im = await PDFDocument.load(readFileSync(imposed));
	const p0 = im.getPage(0);
	// 3 pages pad to 4
	check('impose sheets', im.getPageCount() === 2 && Math.round(p0.getWidth()) === 842 && Math.round(p0.getHeight()) === 595, `${im.getPageCount()} ${p0.getWidth()}x${p0.getHeight()}`);
}

// a source form: a text field on page 1, a checkbox on a /Rotate 90 page 2
const formSrc = await PDFDocument.create();
formSrc.addPage([400, 500]);
formSrc.addPage([400, 500]).setRotation(degrees(90));
formSrc.getForm().createTextField('given').addToPage(formSrc.getPage(0), { x: 40, y: 400, width: 150, height: 20 });
formSrc.getForm().createCheckBox('agree').addToPage(formSrc.getPage(1), { x: 40, y: 40, width: 14, height: 14 });
await page.evaluate((b) => window.__errata.open(new Uint8Array(b).buffer, 'form.pdf', 'application/pdf'), [...(await formSrc.save())]);
await page.waitForFunction(() => window.__errata.doc()?.name === 'form', { timeout: 10000 });
await sleep(600);
const exported = async () => PDFDocument.load(new Uint8Array(await page.evaluate(() => window.__errata.export())));
const onPage = (pdf, field, index) => {
	const annots = pdf.getPage(index).node.Annots()?.asArray() ?? [];
	return field.acroField.getWidgets().every((w) => annots.some((a) => pdf.context.lookup(a) === w.dict));
};

const plain = await exported();
const plainFields = plain.getForm().getFields();
check('form source fields kept', plainFields.map((f) => f.getName()).join() === 'given,agree', plainFields.map((f) => f.getName()).join());
check('form source widgets on their pages', onPage(plain, plain.getForm().getTextField('given'), 0) && onPage(plain, plain.getForm().getCheckBox('agree'), 1));

await openCell('Prepare form');
check('form mode bar', await modeOpen('form'));
check('form tool active', await page.evaluate(() => window.__errataCanvas.defaultCursor === 'crosshair'));
await page.waitForFunction(() => window.__errataCanvas.getObjects().filter((o) => o.type === 'group' && !o.evented).length === 2, { timeout: 20000 }).catch(() => {});
const standIn = await page.evaluate(() => {
	const c = window.__errataCanvas;
	const g = c.getObjects().find((o) => o.type === 'group' && !o.evented);
	if (!g) return null;
	const p = g.getCenterPoint();
	const v = c.viewportTransform;
	const r = c.upperCanvasEl.getBoundingClientRect();
	return { x: r.left + p.x * v[0] + v[4], y: r.top + p.y * v[3] + v[5], w: g.width * v[0] };
});
const fr0 = await page.evaluate(() => window.__errata.pageRect(0));
const fz = fr0.w / 400;
check('form source widgets shown', !!standIn && Math.abs(standIn.x - (fr0.x + 115 * fz)) < 2 && Math.abs(standIn.y - (fr0.y + 90 * fz)) < 2, JSON.stringify(standIn));

const setInput = (label, value) =>
	page.evaluate(
		(l, v) => {
			const i = [...document.querySelectorAll('.err-mode.is-open label')].find((e) => e.textContent.trim().startsWith(l)).querySelector('input');
			i.value = v;
			i.dispatchEvent(new Event('change', { bubbles: true }));
		},
		label,
		value,
	);
const toggle = (label) => page.evaluate((l) => [...document.querySelectorAll('.err-mode.is-open label')].find((e) => e.textContent.trim().startsWith(l)).querySelector('input').click(), label);
const nameValue = () => page.evaluate(() => [...document.querySelectorAll('.err-mode.is-open label')].find((e) => e.textContent.trim().startsWith('Name')).querySelector('input').value);
const fieldObjs = async (i = 0) => (await doc()).pages[i].objects.filter((o) => o.kind === 'field');
const drag = async (r, a, b) => {
	const z = r.w / 400;
	await page.mouse.move(r.x + a[0] * z, r.y + a[1] * z);
	await page.mouse.down();
	await page.mouse.move(r.x + ((a[0] + b[0]) / 2) * z, r.y + ((a[1] + b[1]) / 2) * z, { steps: 4 });
	await page.mouse.move(r.x + b[0] * z, r.y + b[1] * z, { steps: 4 });
	await page.mouse.up();
	await sleep(250);
};

await setInput('Name', 'email');
await setInput('Default', 'a@b.c');
await toggle('Required');
await drag(fr0, [60, 150], [260, 175]);
let fobjs = await fieldObjs();
const email = fobjs[0];
check('form text field placed', fobjs.length === 1 && email.field === 'text' && email.name === 'email' && email.value === 'a@b.c' && email.required && Math.abs(email.w - 200) < 1 && Math.abs(email.h - 25) < 1, JSON.stringify(email));
check('form field selected', (await nameValue()) === 'email');
await setInput('Name', 'mail');
check('form rename selected', (await fieldObjs())[0].name === 'mail');
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(200);
check('form rename undo', (await fieldObjs())[0].name === 'email');

// a click on the page deselects; the bar edits the draft again
await drag(fr0, [300, 450], [301, 451]);
check('form click deselects', (await fieldObjs()).length === 1 && (await nameValue()) === 'email');
await setInput('Name', '');
await clickIn('Radio');
await sleep(100);
await setInput('Options', 'Yes, No');
await drag(fr0, [60, 220], [160, 270]);
await drag(fr0, [300, 450], [301, 451]);
await clickIn('Dropdown');
await sleep(100);
await setInput('Options', 'Red, Green');
await drag(fr0, [200, 220], [320, 242]);
await drag(fr0, [300, 450], [301, 451]);
await clickIn('Checkbox');
await sleep(100);
await toggle('Checked');
await drag(fr0, [60, 300], [76, 316]);
await drag(fr0, [300, 450], [301, 451]);
await clickIn('Signature');
await drag(fr0, [200, 300], [360, 340]);
fobjs = await fieldObjs();
check('form five types', fobjs.map((o) => `${o.field}:${o.name}`).join() === 'text:email,radio:radio,dropdown:dropdown,checkbox:checkbox,signature:signature', fobjs.map((o) => `${o.field}:${o.name}`).join());

// fields move like other objects; a resize bakes into w/h
const placed = fobjs[0];
const z0 = fr0.w / 400;
await page.mouse.move(fr0.x + placed.cx * z0, fr0.y + placed.cy * z0);
await page.mouse.down();
await page.mouse.move(fr0.x + (placed.cx + 10) * z0, fr0.y + (placed.cy + 5) * z0, { steps: 4 });
await page.mouse.move(fr0.x + (placed.cx + 20) * z0, fr0.y + (placed.cy + 10) * z0, { steps: 4 });
await page.mouse.up();
await sleep(250);
const movedField = (await fieldObjs())[0];
check('form field moves', Math.abs(movedField.cx - placed.cx - 20) < 1 && Math.abs(movedField.cy - placed.cy - 10) < 1, `${placed.cx},${placed.cy} -> ${movedField.cx},${movedField.cy}`);
const handle = await page.evaluate(() => {
	const c = window.__errataCanvas;
	const a = c.getActiveObject();
	const r = c.upperCanvasEl.getBoundingClientRect();
	return { x: r.left + a.oCoords.mr.x, y: r.top + a.oCoords.mr.y, w: a.getScaledWidth() * c.viewportTransform[0] };
});
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(handle.x + handle.w / 4, handle.y, { steps: 4 });
await page.mouse.move(handle.x + handle.w / 2, handle.y, { steps: 4 });
await page.mouse.up();
await sleep(250);
const scaled = (await fieldObjs())[0];
check('form resize bakes', Math.abs(scaled.w - placed.w * 1.5) < 0.5 && scaled.scaleX === 1, `${scaled.w} ${scaled.scaleX}`);
check('form stays selected after rebuild', (await nameValue()) === 'email');

// page 2 is turned: its field is written upright for the viewer
await page.keyboard.press(']');
await sleep(700);
const fr1 = await page.evaluate(() => window.__errata.pageRect(1));
await drag(fr0, [300, 450], [301, 451]);
await clickIn('Text');
await setInput('Name', 'turned');
await drag({ ...fr1, w: (fr1.w * 400) / 500 }, [100, 100], [250, 120]);
check('form field on turned page', (await fieldObjs(1)).length === 1);

await clickIn('Done');
await sleep(400);
check('form done closes', !(await modeOpen('form')) && (await page.evaluate(() => document.querySelector('.sub-omni-box .is-active')?.title)) === 'Select');

const formOut = await exported();
const form = formOut.getForm();
const kinds = form.getFields().map((f) => `${f.getName()}:${f.constructor.name}`).join();
check('form export fields', kinds === 'given:PDFTextField,agree:PDFCheckBox,email:PDFTextField,radio:PDFRadioGroup,dropdown:PDFDropdown,checkbox:PDFCheckBox,signature:PDFSignature,turned:PDFTextField', kinds);
const final = (await doc()).pages[0].objects.find((o) => o.name === 'email');
const er = form.getTextField('email').acroField.getWidgets()[0].getRectangle();
const want = { x: final.cx - final.w / 2, y: 500 - final.cy - final.h / 2, width: final.w, height: final.h };
check('form export rect', ['x', 'y', 'width', 'height'].every((k) => Math.abs(er[k] - want[k]) < 0.01), `${JSON.stringify(er)} vs ${JSON.stringify(want)}`);
check('form export values', form.getTextField('email').getText() === 'a@b.c' && form.getTextField('email').isRequired() && form.getCheckBox('checkbox').isChecked() && form.getDropdown('dropdown').getOptions().join() === 'Red,Green' && form.getRadioGroup('radio').getOptions().join() === 'Yes,No');
check('form export pages', onPage(formOut, form.getTextField('email'), 0) && onPage(formOut, form.getSignature('signature'), 0) && onPage(formOut, form.getTextField('turned'), 1) && onPage(formOut, form.getCheckBox('agree'), 1));
const mk = form.getTextField('turned').acroField.getWidgets()[0].getAppearanceCharacteristics()?.getRotation();
check('form turned page widget upright', mk === 90, String(mk));

await finish(browser);
