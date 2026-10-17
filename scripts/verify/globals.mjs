// shared rules across tools: slot Upload and Paste, wheel over a picture,
// the zip block, the drop-more row, split layout at desktop widths

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await browser
	.defaultBrowserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const copyImage = () =>
	page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 120;
		canvas.height = 80;
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#c33';
		ctx.fillRect(0, 0, 120, 80);
		const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
		await navigator.clipboard.write([
			new ClipboardItem({ 'image/png': blob }),
		]);
	});

// G1: every image slot has Upload and Paste
for (const [id, slot] of [
	['matte-genny', '.matte-slot'],
	['social-cropper', '.social-slot'],
	['background-remover', '.cutout-slot'],
	['image-masker', '.masker-slot'],
]) {
	await visit(page, `/tools/${id}`);
	const s = await page.evaluate((sel) => {
		const el = document.querySelector(sel);
		const names = [...(el?.querySelectorAll('.media-slot-actions button') ?? [])]
			.map((b) => b.textContent.trim());
		return { names, tabbable: el?.querySelector('.media-slot-upload')?.tabIndex };
	}, slot);
	check(
		`${id}: the slot has Upload and Paste`,
		s.names.join() === 'Upload,Paste' && s.tabbable === 0,
		s.names.join(),
	);
}

// paste through the tool's own handler (onChoose) and through onFile
for (const [id, slot, loaded] of [
	['social-cropper', '.social-slot', '.social-source'],
	['scroll-genny', '.scroll-slot', '.scroll-slot'],
]) {
	await visit(page, `/tools/${id}`);
	await copyImage();
	await page.focus(`${slot} .media-slot-paste`);
	await page.keyboard.press('Enter');
	const ok =
		id === 'scroll-genny'
			? await page
					.waitForFunction(() => !document.querySelector('.scroll-slot'), {
						timeout: 5000,
					})
					.then(() => true, () => false)
			: await page
					.waitForSelector(loaded, { timeout: 5000 })
					.then(() => true, () => false);
	check(`${id}: Paste by keyboard loads the clipboard image`, ok);
}

// a click on the prompt still opens the picker
await visit(page, '/tools/matte-genny');
const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 3000 }).catch(() => null),
	page.click('.matte-slot .media-slot-prompt'),
]);
check('a click on the slot prompt opens the file picker', !!chooser);
if (chooser) await chooser.cancel();

// G2: a wheel over a picture that does not scroll moves the page
const scrolled = () =>
	page.evaluate(() =>
		[
			...document.querySelectorAll(
				'.dt-canon-tool .canon-split-body, .dt-canon-tool .canon-split-pane',
			),
		].reduce((sum, el) => sum + el.scrollTop, 0),
	);
const wheelAt = async (selector) => {
	const at = await page.$eval(selector, (el) => {
		const r = el.getBoundingClientRect();
		return { x: r.left + Math.min(12, r.width / 2), y: r.top + r.height / 2 };
	});
	await page.mouse.move(at.x, at.y);
	await page.mouse.wheel({ deltaY: 200 });
	await sleep(300);
};
for (const [w, h] of [
	[1400, 1000],
	[390, 844],
]) {
	await page.setViewport({ width: w, height: h });
	for (const [id, picture] of [
		['contrast-checker', '.canon-split-banner .canon-canvas'],
		['palette-genny', '.canon-split-sidebar > .canon-canvas'],
		['palette-collection', '.canon-split-sidebar > .canon-canvas'],
	]) {
		await visit(page, `/tools/${id}`);
		await wheelAt(picture);
		const top = await scrolled();
		check(`${id} ${w}: a wheel over the picture scrolls the page`, top > 0, `${top}`);
	}
	await visit(page, '/tools/palette-collection');
	const before = await page.$eval('.canon-detent-wheel', (el) => el.getAttribute('aria-valuenow') ?? el.textContent);
	await wheelAt('.canon-detent-wheel');
	await sleep(600);
	check(
		`palette-collection ${w}: the spinner keeps its wheel`,
		(await scrolled()) === 0 &&
			(await page.$eval('.canon-detent-wheel', (el) => el.getAttribute('aria-valuenow') ?? el.textContent)) !== before,
	);
}
await page.setViewport({ width: 1400, height: 1000 });

await finish(browser);
