// the canon auto-subtitle: source, model, language, format, cue editor, export; no model download
//
// Usage: bun run start, then node scripts/verify/auto-subtitle.mjs

import { BASE, launch, visit, check, finish, sleep, makeWav } from './harness.mjs';

const { browser, page } = await launch({ ignore: [/Transcription failed/] });
await page
	.browserContext()
	.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
// model files never answer: a run stays busy and nothing downloads
await page.setRequestInterception(true);
page.on('request', (request) => {
	if (/huggingface\.co|hf\.co/.test(request.url())) return;
	request.continue();
});
// downloads land in window.__saved
await page.evaluateOnNewDocument(() => {
	window.__saved = [];
	HTMLAnchorElement.prototype.click = function () {
		window.__saved.push({ name: this.download, href: this.href });
	};
});

const text = (selector) =>
	page.evaluate((s) => document.querySelector(s)?.textContent.trim() ?? null, selector);
const exists = (selector) => page.evaluate((s) => !!document.querySelector(s), selector);
const segment = (cls, label) =>
	page.evaluate(
		({ cls, label }) =>
			[...document.querySelectorAll(`.${cls} [role="radio"]`)]
				.find((b) => b.textContent.trim() === label)
				?.click(),
		{ cls, label },
	);
const checked = (cls) =>
	text(`.${cls} [role="radio"][aria-checked="true"]`);
const dropFile = () =>
	page.evaluate(() => {
		const transfer = new DataTransfer();
		transfer.items.add(window.__clip);
		document.querySelector('.auto-subtitle .canon-split-sidebar').dispatchEvent(
			new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }),
		);
	});
const pasteFile = () =>
	page.evaluate(() => {
		document.activeElement?.blur();
		const data = new DataTransfer();
		data.items.add(window.__clip);
		document.body.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
		);
	});
// at max scroll the floating footer leaves the last row clear
const footerClear = () =>
	page.evaluate(async () => {
		const footer = document.querySelector('.canon-split-footer');
		const pane = footer.parentElement;
		const stacked = getComputedStyle(pane).display === 'contents';
		const scroller = stacked ? pane.closest('.canon-split-body') : pane;
		scroller.scrollTop = scroller.scrollHeight;
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		const rows = [
			...(stacked ? document.querySelectorAll('.canon-split-pane > *') : pane.children),
		].filter((c) => c !== footer && c.getBoundingClientRect().height > 0);
		const last = Math.max(...rows.map((c) => c.getBoundingClientRect().bottom));
		const top = footer.getBoundingClientRect().top;
		scroller.scrollTop = 0;
		return { ok: last < top, last: Math.round(last), top: Math.round(top) };
	});

await visit(page, '/tools/auto-subtitle');

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.auto-subtitle').getBoundingClientRect().height,
	),
);
const initial = await page.evaluate(() => ({
	accept: document.querySelector('.as-drop input[type=file]')?.accept ?? '',
	prompt: document.querySelector('.as-drop')?.textContent ?? '',
	run: document.querySelector('.as-run')?.disabled,
	result: !!document.querySelector('.as-result'),
	footer: !!document.querySelector('.canon-split-footer'),
	dialog: !!document.querySelector('dialog[open]'),
}));
check(
	'empty: the source is the drop zone for audio and video, with the web wording',
	initial.accept.includes('audio/') &&
		initial.accept.includes('video/') &&
		initial.prompt.includes('Drop an audio or video file'),
	JSON.stringify(initial),
);
check(
	'empty: Transcribe is disabled, no result, no footer, no dialog',
	initial.run && !initial.result && !initial.footer && !initial.dialog,
	JSON.stringify(initial),
);

await makeWav(page, { seconds: 4, amplitude: 0.5, frequency: 440, name: 'recording.wav' });
await dropFile();
await page.waitForFunction(
	() => document.querySelector('.as-file .canon-row-title')?.textContent.trim() === 'recording.wav',
	{ timeout: 3000 },
);
await page.waitForFunction(
	() => /^4\.00 s · \d+ Hz · 2 ch$/.test(document.querySelector('.as-file .canon-row-detail')?.textContent.trim() ?? ''),
	{ timeout: 3000 },
);
check('a drop anywhere loads the file and decodes it for the row', true);
check(
	'the band waveform is painted',
	await page.evaluate(() => {
		const canvas = document.querySelector('.as-picture .media-wave-canvas');
		if (!canvas?.width) return false;
		const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
		for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
		return false;
	}),
);
check('the file enables Transcribe', await page.$eval('.as-run', (b) => !b.disabled));

await makeWav(page, { seconds: 2, name: 'pasted.wav' });
await pasteFile();
await sleep(200);
check('a paste anywhere loads the file', (await text('.as-file .canon-row-title')) === 'pasted.wav');

await segment('as-mode', 'Rough');
await sleep(50);
check(
	'Rough selects and names its model',
	(await checked('as-mode')) === 'Rough' &&
		(await text('.as-model .canon-row-title')) === 'Whisper 2 (Base)' &&
		/^\d+ MB$/.test(await text('.as-model .canon-row-detail')),
);

await page.click('.as-models-open');
await page.waitForSelector('.as-models:popover-open', { timeout: 3000 });
check(
	'the info popover lists the three models, sizes and links',
	await page.evaluate(() => {
		const rows = [...document.querySelectorAll('.as-models-row')];
		return (
			rows.length === 3 &&
			rows.every((row) => /^\d+ MB$/.test(row.querySelector('.canon-row-detail').textContent.trim())) &&
			rows.every((row) => /^Whisper \d \(/.test(row.querySelector('a').textContent.trim())) &&
			rows.every((row) =>
				/^https:\/\/huggingface\.co\/[\w-]+\/whisper-/.test(row.querySelector('a').href),
			)
		);
	}),
);
await page.keyboard.press('Escape');
await sleep(150);
check('Escape closes the info popover', !(await exists('.as-models:popover-open')));

await segment('as-mode', 'Experimental');
await page.waitForSelector('dialog[open].as-warning', { timeout: 3000 });
check(
	'Experimental opens the download warning with its art and the web wording',
	await page.$eval(
		'dialog[open].as-warning',
		(dialog) =>
			dialog.querySelector('img').complete &&
			dialog.querySelector('img').naturalWidth > 0 &&
			dialog.textContent.includes('760 MB of engine files'),
	),
);
await page.click('.as-warning-cancel');
await page.waitForFunction(() => !document.querySelector('dialog[open]'), { timeout: 3000 });
await sleep(50);
check('Cancel keeps the previous mode', (await checked('as-mode')) === 'Rough');
await segment('as-mode', 'Experimental');
await page.waitForSelector('dialog[open].as-warning', { timeout: 3000 });
await page.click('.as-warning-proceed');
await page.waitForFunction(() => !document.querySelector('dialog[open]'), { timeout: 3000 });
await sleep(50);
check('Proceed selects Experimental', (await checked('as-mode')) === 'Experimental');
await segment('as-mode', 'Rough');
await sleep(50);
await segment('as-mode', 'Experimental');
await sleep(150);
check(
	'a second Experimental pick does not ask again',
	!(await exists('dialog[open]')) && (await checked('as-mode')) === 'Experimental',
);
await segment('as-mode', 'Decent');

await page.click('.as-language-pick');
await page.waitForSelector('dialog[open].as-language-dialog .canon-command-input', { timeout: 3000 });
check(
	'the language dialog lists Auto-detect, the common and all languages',
	await page.evaluate(() => {
		const headings = [...document.querySelectorAll('.as-language-dialog .canon-heading')].map((h) =>
			h.textContent.trim(),
		);
		return (
			headings.includes('Common') &&
			headings.includes('All languages') &&
			document.activeElement?.classList.contains('canon-command-input')
		);
	}),
);
await page.keyboard.type('germ');
await sleep(100);
check(
	'a search lists each language once',
	await page.evaluate(
		() =>
			[...document.querySelectorAll('.as-language-dialog .canon-command-title')].filter(
				(t) => t.textContent.trim() === 'German',
			).length === 1,
	),
);
await page.keyboard.press('Enter');
await page.waitForFunction(() => !document.querySelector('dialog[open]'), { timeout: 3000 });
await sleep(100);
check(
	'Enter picks German, shown with its flag',
	await page.$eval(
		'.as-language-pick',
		(button) =>
			button.textContent.trim() === 'German' &&
			button.querySelector('img')?.getAttribute('src') === '/flags/de.svg' &&
			button.querySelector('img').naturalWidth > 0,
	),
);

await segment('as-format', 'VTT');
await sleep(50);
check('VTT selects', (await checked('as-format')) === 'VTT');

// a run: the model never answers, so it stays busy
await page.click('.as-run');
await page.waitForSelector('.as-busy', { timeout: 3000 });
check(
	'a run shows the busy row with the loader and Cancel, the controls lock',
	(await text('.as-busy .canon-row-title')) === 'Transcribing…' &&
		(await exists('.as-busy .canon-loader')) &&
		(await exists('.as-cancel')) &&
		(await page.$eval('.as-run', (b) => b.disabled)) &&
		(await page.$eval('.as-language-pick', (b) => b.disabled)),
);
await page.click('.as-cancel');
await sleep(100);
check(
	'Cancel drops the run',
	!(await exists('.as-result')) && (await page.$eval('.as-run', (b) => !b.disabled)),
);

await page.evaluate(() => {
	window.__clip = new File(['not actually decoded'], 'broken.wav', { type: 'audio/wav' });
});
await dropFile();
await sleep(100);
await page.click('.as-run');
await page.waitForSelector('.as-problem', { timeout: 5000 });
check(
	'an unreadable file fails with the web wording',
	(await text('.as-problem')) === "Couldn't read that file, try WAV or MP4",
	await text('.as-problem'),
);

await page.click('.as-clear');
await sleep(50);
check(
	'Clear resets the source',
	(await exists('.as-drop')) &&
		!(await exists('.as-problem')) &&
		(await page.$eval('.as-run', (b) => b.disabled)),
);

// a finished run, from the launch flags
const stamp = (ms) => `00:00:${String(Math.floor(ms / 1000)).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
const srt = Array.from(
	{ length: 14 },
	(_, i) => `${i + 1}\n${stamp(i * 2000 + 100)} --> ${stamp(i * 2000 + 1800)}\nCue ${i + 1}\n`,
).join('\n');
await visit(page, `/tools/auto-subtitle?asFormat=1&asMode=0&asCues=${encodeURIComponent(srt)}`);
check(
	'?asCues shows the cues, the stats and the band figure; ?asMode ?asFormat pick',
	(await page.$$eval('.as-result .cue-row', (rows) => rows.length)) === 14 &&
		(await text('.as-stats')) === '14 cues · 00:00:27.800' &&
		(await text('.as-picture .canon-figure'))?.replace(/\s/g, '').startsWith('14cues') &&
		(await checked('as-mode')) === 'Rough' &&
		(await checked('as-format')) === 'VTT',
);
check(
	'the band lane draws every cue',
	(await page.$$eval('.as-lane .cue-timeline-cue', (c) => c.length)) === 14,
);
check('no cue is marked before an edit', !(await exists('.cue-row--marked')));

await page.$eval('.as-result .cue-row:nth-of-type(3) .cue-row-text', (field) => field.focus());
await page.keyboard.press('End');
await page.keyboard.type(' edited');
await page.$eval('.as-result .cue-row:nth-of-type(3) .cue-row-time', (field) => {
	field.focus();
	field.select();
});
await page.keyboard.type('00:00:00.500');
await page.keyboard.press('Enter');
await sleep(100);
check(
	'an edited cue is marked',
	(await page.$$eval('.cue-row--marked', (rows) => rows.length)) === 1,
);

const copied = await page.evaluate(async () => {
	document.querySelector('.as-copy').click();
	await new Promise((r) => setTimeout(r, 300));
	return navigator.clipboard.readText();
});
check(
	'Copy copies the VTT with the edits and the toast shows',
	copied.startsWith('WEBVTT') &&
		copied.includes('Cue 2 edited') &&
		copied.includes('00:00:00.500 --> 00:00:03.800') &&
		(await page.$eval('.canon-toast', (el) => el.style.opacity === '1')),
	copied.slice(0, 120),
);
await page.click('.as-download');
const saved = await page.evaluate(() => window.__saved.at(-1)?.name);
check('Download saves subtitles.vtt', saved === 'subtitles.vtt', saved);
check(
	'every control is named',
	await page.$$eval('.auto-subtitle button', (els) =>
		els.every((el) => el.textContent.trim() || el.getAttribute('aria-label')),
	),
);

let clear = await footerClear();
check('wide: at the end of the scroll the footer clears the last row', clear.ok, JSON.stringify(clear));

await page.setViewport({ width: 390, height: 844 });
await sleep(400);
clear = await footerClear();
check('390: at the end of the scroll the footer clears the last row', clear.ok, JSON.stringify(clear));
check(
	'390: no horizontal scroll, the source leads the stack',
	await page.evaluate(() => {
		const main = document.querySelector('.dt-main');
		const source = document.querySelector('.as-source').getBoundingClientRect().top;
		const controls = document.querySelector('.as-controls').getBoundingClientRect().top;
		return main.scrollWidth <= main.clientWidth && source < controls;
	}),
);

await finish(browser);
