// video-to-gif, fixture recorded in-page
// chromium #642012 webm duration infinity; covers resolveDuration
//
// Usage: npm start, then node scripts/verify/av-tools.mjs

import { launch, visit, check, finish } from './harness.mjs';

const { browser, page } = await launch();

async function dropClip(selector) {
	await page.evaluate(async (sel) => {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');
		const recorder = new MediaRecorder(canvas.captureStream(15), {
			mimeType: 'video/webm;codecs=vp8',
		});
		const chunks = [];
		recorder.ondataavailable = (e) => chunks.push(e.data);
		const stopped = new Promise((r) => (recorder.onstop = r));
		recorder.start();
		const t0 = performance.now();
		while (performance.now() - t0 < 1200) {
			ctx.fillStyle = `hsl(${((performance.now() - t0) / 4) % 360} 80% 50%)`;
			ctx.fillRect(0, 0, 64, 64);
			await new Promise(requestAnimationFrame);
		}
		recorder.stop();
		await stopped;

		const transfer = new DataTransfer();
		transfer.items.add(
			new File(chunks, 'clip.webm', { type: 'video/webm' }),
		);
		document.querySelector(sel).dispatchEvent(
			new DragEvent('drop', {
				dataTransfer: transfer,
				bubbles: true,
			}),
		);
	}, selector);
}

await visit(page, '/tools/video-to-gif');
await dropClip('.dt-vg-frame');
await page.waitForFunction(
	() => {
		const meta = document.querySelector('.dt-vg-meta');
		return meta && !meta.textContent.includes('Infinity');
	},
	{ timeout: 15000 },
);

const range = await page.$eval('.dt-vg-meta', (el) => el.textContent);
check(
	'webm duration resolves to a finite range',
	/00:00:0[12]/.test(range),
	range.trim(),
);

await page.click('.dt-vg-btn.is-primary');
await page.waitForFunction(
	() => document.querySelector('.dt-vg-result img')?.src.startsWith('blob:'),
	{ timeout: 30000 },
);

const gifMeta = await page.$eval(
	'.dt-vg-result-meta',
	(el) => el.textContent,
);
check(
	'gif encodes from the seek loop',
	/\d+ KB · \d+ frames/.test(gifMeta),
	gifMeta.trim(),
);

await finish(browser);
