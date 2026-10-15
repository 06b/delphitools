// the canon subtitle-converter: typed, pasted and dropped input, retiming, export
// usage: npm start, then node scripts/verify/subtitle-converter.mjs

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const SRT = `1
00:00:01,000 --> 00:00:02,500
First line

2
00:00:03,000 --> 00:00:04,000
Second cue
with two lines
`;
const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const state = () =>
	page.evaluate(() => {
		const text = (sel) =>
			document.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() ?? null;
		return {
			input: document.querySelector('.subtitle-converter .tt-source').value,
			heading: text('.sc-input .canon-heading'),
			code: document.querySelector('.sc-code pre')?.textContent ?? null,
			stats: text('.sc-stats .canon-row-title'),
			warning: text('.sc-warning'),
			empty: text('.sc-output .canon-empty-row'),
			file: text('.sc-file .canon-row-title'),
			drop: !!document.querySelector('.sc-drop'),
			kind: !!document.querySelector('.sc-kind'),
			scale: document.querySelector('.sc-scale input').value,
			shift: document.querySelector('.sc-shift input').value,
			rate: [...document.querySelectorAll('.sc-rate .canon-menu-cell-title')].map(
				(el) => el.textContent.trim(),
			),
			lanes: [...document.querySelectorAll('.sc-timeline .cue-timeline-lane')].map(
				(lane) => lane.querySelectorAll('.cue-timeline-cue').length,
			),
			labels: [...document.querySelectorAll('.sc-timeline .cue-timeline-label')].map((el) =>
				el.textContent.trim(),
			),
			picture: document.querySelector('.sc-timeline').getAttribute('aria-label'),
		};
	});

const type = (text) =>
	page.evaluate((value) => {
		const area = document.querySelector('.subtitle-converter .tt-source');
		const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
		setter.call(area, value);
		area.dispatchEvent(new Event('input', { bubbles: true }));
	}, text);

const press = (scope, label) =>
	page.$$eval(
		`${scope} .canon-button`,
		(els, l) => els.find((b) => b.textContent.trim() === l).click(),
		label,
	);

const dropFile = (selector, content, name, type) =>
	page.evaluate(
		(sel, c, n, t) => {
			const data = new DataTransfer();
			data.items.add(new File([c], n, { type: t }));
			const target = document.querySelector(sel);
			target.dispatchEvent(new DragEvent('dragenter', { dataTransfer: data, bubbles: true, cancelable: true }));
			target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }));
			target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
		},
		selector,
		content,
		name,
		type,
	);

await visit(page, '/tools/subtitle-converter');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.subtitle-converter').getBoundingClientRect().height,
	),
);
check(
	'the editor is in the main pane',
	await page.evaluate(() => !!document.querySelector('.canon-split-main .tt-source')),
);
let s = await state();
check('empty: a drop zone and an empty output', s.drop && s.empty === 'None' && !s.code && s.heading === 'Input');
check('empty: the result lane is labelled with the target', s.labels.join() === ',VTT' && s.picture === 'Timeline');

// typed: live on every edit, no pause
await type(SRT);
await sleep(30);
s = await state();
check('typed srt converts to vtt at once', s.code?.startsWith('WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nFirst line'), JSON.stringify(s.code?.slice(0, 50)));
check('the heading names the detected format', s.heading === 'Input · SRT', s.heading);
check('the stats row reads the cues', s.stats === '2 cues · 00:00:01.000 – 00:00:04.000', s.stats);
check('the timeline draws both lanes', s.lanes.join() === '2,2' && s.labels.join() === 'SRT,VTT');
check('the picture is named by the stats', s.picture === s.stats);
check('typed text hides the drop zone', !s.drop);
check(
	'the output is monospaced',
	await page.$eval('.sc-code pre', (el) => /iosevka|mono/i.test(getComputedStyle(el).fontFamily)),
);

// target
await press('.sc-target', 'SRT');
await sleep(50);
s = await state();
check('SRT target writes srt', s.code?.startsWith('1\n00:00:01,000 --> 00:00:02,500'), JSON.stringify(s.code?.slice(0, 30)));
check('Kind and Language show for VTT only', !s.kind);
await press('.sc-target', 'VTT');
await sleep(50);

// shift: typed, committed on blur
await page.$eval('.sc-shift input', (el) => { el.focus(); el.select(); });
await page.keyboard.type('2.5');
await page.keyboard.press('Enter');
await sleep(100);
s = await state();
check('a typed shift moves every cue', s.code?.includes('00:00:03.500 --> 00:00:05.000'), s.shift);

// shift: arrow keys step
await page.focus('.sc-shift input');
await page.keyboard.press('ArrowUp');
await sleep(50);
s = await state();
check('ArrowUp steps the shift by 0.1', s.shift === '2.6' && s.code?.includes('00:00:03.600'), s.shift);
await page.$eval('.sc-shift input', (el) => { el.focus(); el.select(); });
await page.keyboard.type('0');
await page.keyboard.press('Enter');
await sleep(100);

// rate: one side picked means the same rate both sides; two sides set the scale
await page.select('.sc-rate .canon-menu-cell:first-child select', '0');
await sleep(50);
s = await state();
check('one rate picked fills both sides, scale 1', s.rate.join() === '24 NTSC,24 NTSC' && s.scale === '1', `${s.rate} ${s.scale}`);
await page.select('.sc-rate .canon-menu-cell:last-child select', '2');
await sleep(50);
s = await state();
check('24 NTSC to 25 scales by 24000/1001/25', s.scale === '0.959041' && s.code?.includes('00:00:00.959 --> 00:00:02.398'), `${s.scale} ${s.code?.slice(8, 40)}`);

// a typed scale lets go of the pair
await page.$eval('.sc-scale input', (el) => { el.focus(); el.select(); });
await page.keyboard.type('2');
await page.keyboard.press('Enter');
await sleep(100);
s = await state();
check('a typed scale clears the rate pair', s.rate.join() === '—,—' && s.code?.includes('00:00:02.000 --> 00:00:05.000'), `${s.rate}`);
await page.$eval('.sc-scale input', (el) => { el.focus(); el.select(); });
await page.keyboard.type('1');
await page.keyboard.press('Enter');
await sleep(100);

// vtt kind and language
await press('.sc-kind', 'captions');
await page.click('.sc-language input');
await page.keyboard.type('en');
await sleep(50);
s = await state();
check('kind and language go in the vtt header', s.code?.startsWith('WEBVTT\nKind: captions\nLanguage: en\n\n'), JSON.stringify(s.code?.slice(0, 40)));

// copy and download
await page.click('.sc-code .canon-code-block-copy');
await sleep(200);
check('the code block copies the output', (await page.evaluate(() => navigator.clipboard.readText())) === s.code);
await page.evaluate(() => {
	window.__saved = [];
	HTMLAnchorElement.prototype.click = function () {
		window.__saved.push(this.download);
	};
	const create = URL.createObjectURL;
	URL.createObjectURL = (blob) => {
		window.__types = [...(window.__types ?? []), blob.type];
		return create(blob);
	};
});
await page.click('.sc-download');
await sleep(100);
let saved = await page.evaluate(() => ({ names: window.__saved, types: window.__types }));
check('Download saves subtitles.vtt as text/vtt', saved.names.at(-1) === 'subtitles.vtt' && saved.types.at(-1) === 'text/vtt', JSON.stringify(saved));
check('Download is the primary action', (await page.$eval('.sc-download', (el) => el.textContent.trim())) === 'Download');

// no cues
await type('nothing here');
await sleep(30);
s = await state();
check('text without cues warns', s.warning === 'No cues found.' && !s.code && !s.empty, s.warning);

// Clear
await press('.sc-input', 'Clear');
await sleep(50);
s = await state();
check('Clear empties the input and brings the drop zone back', s.input === '' && s.drop && s.empty === 'None');

// subtitle text pasted outside a field
await page.click('.sc-timeline');
await page.evaluate((text) => {
	const data = new DataTransfer();
	data.setData('text/plain', text);
	document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
}, SRT);
await sleep(50);
s = await state();
check('subtitle text pasted anywhere loads', s.input === SRT && !!s.code);

// a file dropped anywhere: the name shows, the target flips
await dropFile('.sc-timeline', VTT, 'clip.vtt', '');
await sleep(150);
s = await state();
check('a .vtt dropped anywhere loads, its name shown', s.file === 'clip.vtt' && s.input === VTT, s.file);
check('a loaded vtt targets srt', s.code?.startsWith('1\n00:00:01,000'), JSON.stringify(s.code?.slice(0, 20)));
await page.click('.sc-download');
await sleep(100);
saved = await page.evaluate(() => ({ names: window.__saved, types: window.__types }));
check('the download keeps the file stem', saved.names.at(-1) === 'clip.srt' && saved.types.at(-1) === 'application/x-subrip', JSON.stringify(saved.names));

// a file dropped on the settings pane
await dropFile('.sc-target', SRT, 'other.srt', 'application/x-subrip');
await sleep(150);
s = await state();
check('a .srt dropped on the settings loads', s.file === 'other.srt' && s.code?.startsWith('WEBVTT'));

// an unrelated file is refused
await dropFile('.sc-timeline', 'x', 'notes.txt', 'text/plain');
await sleep(150);
check('a file of another type is refused', (await state()).file === 'other.srt');

// a pasted file
await page.evaluate((text) => {
	const data = new DataTransfer();
	data.items.add(new File([text], 'pasted.srt', { type: '' }));
	document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
}, SRT);
await sleep(150);
check('a pasted file loads', (await state()).file === 'pasted.srt');

// typing after a file lets go of the name
await page.focus('.subtitle-converter .tt-source');
await page.keyboard.press('End');
await page.keyboard.type(' ');
await sleep(50);
check('editing the text lets go of the file', (await state()).file === null);

// the drop zone loads its own drop once
await press('.sc-input', 'Clear');
await sleep(50);
await page.evaluate(() => {
	window.__reads = 0;
	const text = File.prototype.text;
	File.prototype.text = function () {
		window.__reads += 1;
		return text.call(this);
	};
});
await dropFile('.sc-drop .canon-drop-zone-target', SRT, 'zone.srt', '');
await sleep(150);
check(
	'a drop on the drop zone loads once',
	(await state()).file === 'zone.srt' && (await page.evaluate(() => window.__reads)) === 1,
);

// launch flags
await visit(page, `/tools/subtitle-converter?subText=${encodeURIComponent(SRT)}&subShift=2.5&subRate=0,2`);
s = await state();
check('launch flags: subText, subShift, subRate', s.shift === '2.5' && s.rate.join() === '24 NTSC,25' && s.code?.includes('00:00:03.459 --> 00:00:04.898'), `${s.shift} ${s.rate}`);
await visit(page, `/tools/subtitle-converter?subText=${encodeURIComponent(SRT)}&subScale=2`);
check('launch flag: subScale', (await state()).scale === '2');

// phone
await page.setViewport({ width: 390, height: 844 });
await visit(page, `/tools/subtitle-converter?subText=${encodeURIComponent(SRT)}`);
check(
	'no horizontal scroll on a phone',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);
check(
	'on a phone the editor comes before the settings',
	await page.evaluate(
		() =>
			document.querySelector('.tt-source').getBoundingClientRect().top <
			document.querySelector('.sc-target').getBoundingClientRect().top,
	),
);
check(
	'the timeline collapses on scroll on a phone',
	await page.evaluate(() => document.querySelector('.subtitle-converter').hasAttribute('data-collapsing')),
);

await finish(browser);
