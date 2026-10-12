// checks shared by the canon text tools (braille, morse, nato, ipa)

import {
	BASE,
	captureObjectUrl,
	check,
	sleep,
	visit,
} from './harness.mjs';

export const grantClipboard = (page) =>
	page
		.browserContext()
		.overridePermissions(BASE, [
			'clipboard-read',
			'clipboard-write',
			'clipboard-sanitized-write',
		]);

export const result = (page) =>
	page.$eval('.tt-result', (el) =>
		(el.querySelector('.tt-result-text')?.textContent ?? '').trim(),
	);

// [source heading, result heading]
export const headings = (page) =>
	page.evaluate(() => [
		document.querySelector('.canon-split-sidebar .canon-heading')
			?.textContent.trim(),
		document.querySelector('.tt-result .canon-heading')?.textContent.trim(),
	]);

export async function setSource(page, text) {
	await page.$eval(
		'.tt-source',
		(el, value) => {
			el.value = value;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		},
		text,
	);
	await sleep(50);
}

export async function typeSource(page, text) {
	await setSource(page, '');
	await page.type('.tt-source', text);
	// no typing pause: the result follows each keystroke
	await sleep(50);
}

export async function checkLayout(page, toolClass) {
	check(
		'the split fills the sheet',
		await page.evaluate((cls) => {
			const sheet = document.querySelector('.dt-canon-tool');
			const split = document.querySelector(cls);
			return (
				Math.abs(
					sheet.getBoundingClientRect().height -
						split.getBoundingClientRect().height,
				) < 1
			);
		}, toolClass),
	);
	const source = await page.evaluate(() => {
		const sidebar = document.querySelector('.canon-split-sidebar');
		const first = sidebar.querySelector(
			'textarea, input, button, [tabindex]',
		);
		const area = document.querySelector('.tt-source');
		return {
			first: first === area,
			height: area.getBoundingClientRect().height,
			font: parseFloat(getComputedStyle(area).fontSize),
		};
	});
	check('the source field is the first control', source.first);
	check(
		'and large',
		source.height >= 200 && source.font >= 15,
		`${source.height} px tall, ${source.font} px text`,
	);
}

export async function checkActions(page, expected, fileName) {
	await page.click('.tt-copy');
	await sleep(150);
	check(
		'Copy puts the result on the clipboard',
		(await page.evaluate(() => navigator.clipboard.readText())) ===
			expected,
	);
	check(
		'and the toast shows',
		await page.$eval('.canon-toast', (el) => el.style.opacity === '1'),
	);

	await captureObjectUrl(page);
	await page.click('.tt-download');
	await sleep(200);
	check(
		`Download saves ${fileName}`,
		(await page.evaluate(() => window.__result?.text())) === expected,
	);
}

export async function checkPaste(page, text) {
	await page.evaluate((t) => navigator.clipboard.writeText(t), text);
	await page.$$eval('.canon-split-sidebar button', (buttons) =>
		buttons.find((b) => b.textContent.trim() === 'Paste')?.click(),
	);
	await sleep(150);
	check(
		'Paste fills the source',
		(await page.$eval('.tt-source', (el) => el.value)) === text,
	);
}

export async function checkNarrow(page, path) {
	await page.setViewport({ width: 390, height: 844 });
	await visit(page, path);
	const narrow = await page.evaluate(() => {
		const body = document.querySelector('.canon-split-body');
		const banner = document.querySelector('.canon-split-banner');
		const before = banner.getBoundingClientRect().height;
		body.scrollTop = body.scrollHeight;
		return new Promise((resolve) =>
			requestAnimationFrame(() =>
				requestAnimationFrame(() =>
					resolve({
						wide: getComputedStyle(body)
							.getPropertyValue('--canon-split-layout')
							.trim(),
						overflow:
							document.documentElement.scrollWidth >
								window.innerWidth ||
							body.scrollWidth > body.clientWidth,
						before,
						after: banner.getBoundingClientRect().height,
					}),
				),
			),
		);
	});
	check('390 px: one column', narrow.wide === 'stacked', narrow.wide);
	check('390 px: no horizontal scroll', !narrow.overflow);
	check(
		'390 px: the banner collapses as the page scrolls',
		narrow.after < narrow.before,
		`${narrow.before} -> ${narrow.after}`,
	);
	await page.setViewport({ width: 1400, height: 1000 });
}
