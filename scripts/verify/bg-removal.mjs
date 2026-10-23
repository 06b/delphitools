// bg-remover end-to-end; ~44 MB model, excluded from npm run verify
//
// Usage: npm start, then node scripts/verify/bg-removal.mjs

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	launch,
	visit,
	check,
	sleep,
	finish,
	captureObjectUrl,
} from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(root, 'public/delphi.png');
const MODEL_TIMEOUT_MS = 10 * 60 * 1000;

const { browser, page } = await launch({
	viewport: { width: 1200, height: 1000 },
	// 404 probes + VerifyEachNode cpu-note are expected noise
	ignore: [
		/Failed to load resource/,
		/huggingface\.co/,
		/VerifyEachNodeIsAssignedToAnEp/,
	],
});

const requests = [];
page.on('request', (req) => requests.push(req.url()));

await visit(page, '/tools/background-remover');

check('the picture is the drop target', await page.$('.cutout-slot'));
check('and no run button yet', !(await page.$('.bg-run')));

const input = await page.$('.background-remover input[type="file"]');
await input.uploadFile(SOURCE);
await page.waitForSelector('.bg-run', { timeout: 10000 });
check(
	'an upload shows the source and the run button',
	await page.$('.bg-source'),
);
check('with no result yet', !(await page.$('.cutout-cut')));

console.log(
	'  ..    downloading and running the model, minutes on a cold cache',
);
await page.click('.bg-run');

await sleep(1500);
const busy = await page.evaluate(() => ({
	run: !!document.querySelector('.bg-run'),
	loader: !!document.querySelector('.bg-busy .canon-loader'),
	label: document
		.querySelector('.bg-busy .canon-row-title')
		?.textContent.trim()
		.replace(/\s+/g, ' '),
}));
check(
	'a busy row with the Canon loader replaces the run button',
	!busy.run && busy.loader,
);
check(
	'and says what it is doing',
	/Downloading|Removing background/.test(busy.label ?? ''),
	busy.label,
);

let outcome;
try {
	outcome = await page
		.waitForFunction(
			() => {
				if (document.querySelector('.bg-download'))
					return 'done';
				const error = document.querySelector(
					'.bg-error',
				);
				return error
					? `error: ${error.textContent.trim()}`
					: false;
			},
			{ timeout: MODEL_TIMEOUT_MS, polling: 1000 },
		)
		.then((handle) => handle.jsonValue());
} catch {
	outcome = 'timed out';
}

check('the run finishes', outcome === 'done', String(outcome));

if (outcome === 'done') {
	check('the cut-out lies on the source trace', await page.$('.cutout-box--done .cutout-cut'));
	check(
		'with the original and the cut-out in the picture',
		(await page.$$eval('.cutout-box img', (els) => els.length)) ===
			1 && !!(await page.$('.cutout-box canvas.cutout-cut')),
	);
	check(
		'and a download button',
		await page.$('.bg-download'),
	);

	const alpha = await page.evaluate(() => {
		const source = document.querySelector('.cutout-ghost');
		const canvas = document.querySelector('.cutout-cut');
		const { data } = canvas
			.getContext('2d')
			.getImageData(0, 0, canvas.width, canvas.height);
		// rmbg sigmoid saturates at 254
		let clear = 0;
		let opaque = 0;
		let min = 255;
		let max = 0;
		for (let i = 3; i < data.length; i += 4) {
			const a = data[i];
			if (a < 8) clear++;
			else if (a > 247) opaque++;
			if (a < min) min = a;
			if (a > max) max = a;
		}
		const pixels = data.length / 4;
		return {
			width: canvas.width,
			sourceWidth: source.naturalWidth,
			clear: clear / pixels,
			opaque: opaque / pixels,
			min,
			max,
		};
	});

	check(
		'at the source resolution',
		alpha && alpha.width === alpha.sourceWidth,
		`${alpha?.width} vs ${alpha?.sourceWidth}`,
	);
	check(
		'with the background cut away',
		alpha && alpha.clear > 0.02,
		`${(alpha.clear * 100).toFixed(1)}% transparent`,
	);
	check(
		'and the subject kept',
		alpha && alpha.opaque > 0.5,
		`${(alpha.opaque * 100).toFixed(1)}% opaque`,
	);
	// unmasked result would read flat 255
	check(
		'so the alpha channel actually varies',
		alpha && alpha.min < 8 && alpha.max > 200,
		`alpha ${alpha?.min} to ${alpha?.max}`,
	);
}

if (outcome === 'done') {
	await sleep(500);
	const kept = await page.$eval('.background-remover .canon-tiles-value', (el) => el.textContent.trim());
	check('the Kept tile reads a share', /^\d+ %$/.test(kept), kept);

	// Colour: the fill shows behind the cut-out and goes into the export
	await page.evaluate(() =>
		[...document.querySelectorAll('.bg-modes [role="radio"], .bg-modes button')]
			.find((el) => el.textContent.trim() === 'Colour')
			.click(),
	);
	await sleep(200);
	check(
		'Colour shows the well and fills the picture',
		!!(await page.$('.background-remover .canon-colour-well')) &&
			!!(await page.$('.cutout-box--filled')),
	);
	const cdp = await page.createCDPSession();
	await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
	await captureObjectUrl(page);
	await page.click('.bg-download');
	await page.waitForFunction(() => window.__result, { timeout: 10000 });
	const opaque = await page.evaluate(async () => {
		const bitmap = await createImageBitmap(window.__result);
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const context = canvas.getContext('2d');
		context.drawImage(bitmap, 0, 0);
		const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
		let min = 255;
		for (let i = 3; i < data.length; i += 4) min = Math.min(min, data[i]);
		return { type: window.__result.type, min };
	});
	check('a Colour export is an opaque PNG', opaque.type === 'image/png' && opaque.min === 255, JSON.stringify(opaque));
}

// dev uses jsdelivr ort runtime; prod self-hosts (see lib/jxl.ts)
check(
	'the weights came from the hub',
	requests.some((url) => /huggingface\.co.*RMBG-1\.4/.test(url)),
	'or from the browser cache on a warm run',
);

await finish(browser);
