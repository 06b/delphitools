// audio-atlas, fixture synthesised in-page
//
// Usage: npm start, then node scripts/verify/audio-tools.mjs

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();

async function dropWav(selector) {
	await page.evaluate((sel) => {
		const sampleRate = 22050;
		const frames = Math.round(sampleRate * 1.5);
		const data = new ArrayBuffer(44 + frames * 2);
		const view = new DataView(data);
		const ascii = (offset, text) => {
			for (let i = 0; i < text.length; i++)
				view.setUint8(offset + i, text.charCodeAt(i));
		};
		ascii(0, 'RIFF');
		view.setUint32(4, 36 + frames * 2, true);
		ascii(8, 'WAVE');
		ascii(12, 'fmt ');
		view.setUint32(16, 16, true);
		view.setUint16(20, 1, true);
		view.setUint16(22, 1, true);
		view.setUint32(24, sampleRate, true);
		view.setUint32(28, sampleRate * 2, true);
		view.setUint16(32, 2, true);
		view.setUint16(34, 16, true);
		ascii(36, 'data');
		view.setUint32(40, frames * 2, true);
		for (let i = 0; i < frames; i++)
			view.setInt16(
				44 + i * 2,
				Math.sin((2 * Math.PI * 440 * i) / sampleRate) *
					0.5 *
					0x7fff,
				true,
			);

		const transfer = new DataTransfer();
		transfer.items.add(
			new File([data], 'tone.wav', { type: 'audio/wav' }),
		);
		document.querySelector(sel).dispatchEvent(
			new DragEvent('drop', {
				dataTransfer: transfer,
				bubbles: true,
			}),
		);
	}, selector);
}

function painted(selector) {
	return page.evaluate((sel) => {
		const canvas = document.querySelector(sel);
		if (!canvas) return false;
		const ctx = canvas.getContext('2d');
		const { data } = ctx.getImageData(
			0,
			0,
			canvas.width,
			canvas.height,
		);
		for (let i = 3; i < data.length; i += 4)
			if (data[i] > 0) return true;
		return false;
	}, selector);
}

await visit(page, '/tools/audio-atlas');
await dropWav('.dt-aa-frame');
await page.waitForSelector('.dt-aa-meta', { timeout: 15000 });
await page.waitForFunction(
	() =>
		[...document.querySelectorAll('.dt-aa-cell')].some((cell) =>
			/LUFS/.test(cell.textContent),
		),
	{ timeout: 15000 },
);

const cells = await page.evaluate(() =>
	[...document.querySelectorAll('.dt-aa-cell')].map((cell) =>
		cell.textContent.replace(/\s+/g, ' ').trim(),
	),
);
check(
	'atlas: meta rows include duration and rate',
	cells.some((c) => c.includes('1.50 s')) &&
		cells.some((c) => /Sample rate \d+ Hz/.test(c)),
	cells.join(' | '),
);
check(
	'atlas: peak of a -6 dBFS sine reads ≈ -6',
	cells.some((c) => /Peak -6\.\d dBFS/.test(c)),
	cells.find((c) => c.startsWith('Peak')) ?? 'no peak row',
);
check(
	'atlas: loudness computed',
	cells.some((c) => /-\d+\.\d LUFS/.test(c)),
	cells.find((c) => c.startsWith('Loudness')) ?? 'no loudness row',
);
check('atlas: waveform painted', await painted('.dt-aa-wave'));
await sleep(800);
check('atlas: spectrogram painted', await painted('.dt-aa-spectro'));

const playBtn = async (label) =>
	(
		await page.evaluateHandle(
			(text) =>
				[...document.querySelectorAll('.dt-aa-btn')].find(
					(b) => b.textContent.includes(text),
				),
			label,
		)
	).asElement();
await (await playBtn('Play')).click();
await sleep(200);
check(
	'atlas: play toggles to pause',
	await page.evaluate(() =>
		[...document.querySelectorAll('.dt-aa-btn')].some((b) =>
			b.textContent.includes('Pause'),
		),
	),
);
await (await playBtn('Loop')).click();
check(
	'atlas: loop button latches',
	await page.evaluate(
		() =>
			document
				.querySelector('.dt-aa-btn.is-active')
				?.getAttribute('aria-pressed') === 'true',
	),
);
await (await playBtn('Pause')).click();

await page.evaluate(() => {
	const wave = document.querySelector('.dt-aa-wave');
	const rect = wave.getBoundingClientRect();
	wave.dispatchEvent(
		new MouseEvent('click', {
			clientX: rect.left + rect.width * 0.75,
			clientY: rect.top + rect.height / 2,
			bubbles: true,
		}),
	);
});
await sleep(100);
const playheadLeft = await page.evaluate(() =>
	parseFloat(
		document.querySelector('.dt-playhead')?.style.left ?? '-1',
	),
);
check(
	'atlas: click seeks the playhead',
	playheadLeft > 70 && playheadLeft < 80,
	`${playheadLeft}%`,
);

await finish(browser);
