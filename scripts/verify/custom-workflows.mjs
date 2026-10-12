import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

// bare routes lack .dt-main
const goBare = (page, path) => page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });

const { browser, page } = await launch();
page.on('dialog', (dialog) => void dialog.accept());

const triggerText = () =>
	page.$$eval('.dt-wf-custom .dt-select-trigger', (els) =>
		els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
	);
const open = async (index) => {
	const triggers = await page.$$('.dt-wf-custom .dt-select-trigger');
	await triggers[index].click();
	await page.waitForSelector('.dt-select-content[data-state="open"]', { timeout: 5000 });
	return page.$$eval('.dt-select-content[data-state="open"] .dt-select-item', (els) =>
		els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
	);
};
const choose = async (name) => {
	await page.evaluate((name) => {
		[...document.querySelectorAll('.dt-select-content[data-state="open"] .dt-select-item')]
			.find((el) => el.textContent.trim() === name)
			?.click();
	}, name);
	await sleep(250);
};
const startState = () =>
	page.$eval('.dt-wf-custom .dt-wf-go', (button) => button.disabled);

await visit(page, '/workflows');
await page.waitForSelector('.dt-wf-custom', { timeout: 15000 });
check(
	'the custom row is the first row',
	await page.evaluate(() =>
		document.querySelector('.dt-wf tbody tr')?.classList.contains('dt-wf-custom'),
	),
);
check('Start is disabled before any pick', await startState());
const enabled = await page.$$eval('.dt-wf-custom .dt-select-trigger', (els) =>
	els.map((el) => !el.disabled),
);
check('only the first picker is enabled', enabled.join() === 'true,false,false', enabled.join());
check('no share link before a valid chain', !(await page.$('.dt-wf-link')));

let items = await open(0);
check(
	'the first picker lists producers only',
	items.includes('Video Trimmer') &&
		items.includes('Screen Recorder') &&
		items.includes('Pixel Picker') &&
		!items.includes('Substrata') &&
		!items.includes('Word Counter') &&
		!items.includes('PDF Preflight'),
	`${items.length} items`,
);
await choose('Video Trimmer');
items = await open(1);
check(
	'the second picker lists tools that take a video',
	items.includes('Video to GIF') &&
		items.includes('Auto Subtitle') &&
		!items.includes('Video Atlas') &&
		!items.includes('PDF Compressor') &&
		!items.includes('Image Compressor'),
	items.join('|'),
);
await choose('Video to GIF');
check('two compatible picks enable Start', !(await startState()));
items = await open(2);
check(
	'the third picker follows the second',
	items.includes('Image Compressor') &&
		!items.includes('Video Trimmer') &&
		!items.includes('Image Atlas') &&
		!items.includes('Palette Extractor'),
	items.join('|'),
);
await choose('Image Compressor');
const href = await page.$eval('.dt-wf-link', (a) => a.getAttribute('href'));
check(
	'the share link carries the sequence',
	href === '/w/video-trimmer.video-to-gif.image-compressor',
	href,
);

await open(0);
await choose('Screen Recorder');
let labels = await triggerText();
check(
	'changing the first pick clears the later picks',
	labels[0] === 'Screen Recorder' && labels[1] === 'Then...' && labels[2] === 'Finally,',
	labels.join('|'),
);
check('Start disables again', await startState());

await open(1);
await choose('Video Trimmer');
await page.click('.dt-wf-custom .dt-wf-go');
await page.waitForSelector('.dt-flow', { timeout: 15000 });
await sleep(300);
let state = await page.evaluate(() => ({
	path: location.pathname,
	name: document.querySelector('.dt-flow-name')?.textContent?.trim(),
	steps: [...document.querySelectorAll('.dt-flow-label')].map((el) => el.textContent.trim()),
	record: JSON.parse(sessionStorage.getItem('flow') ?? 'null')?.workflow,
}));
check(
	'Start opens the custom flow on its first tool',
	state.path === '/tools/screen-recorder' &&
		state.name === 'Custom workflow' &&
		state.steps.join() === 'Screen Recorder,Video Trimmer' &&
		state.record === 'custom:screen-recorder.video-trimmer',
	JSON.stringify(state),
);
await page.click('.dt-flow-exit');
await sleep(300);

await goBare(page, '/w/paste-image.metadata-stripper');
await page.waitForSelector('.dt-pass', { timeout: 15000 });
const pass = await page.evaluate(() => {
	const box = document.querySelector('.dt-pass').getBoundingClientRect();
	return {
		band: document.querySelector('.dt-pass-band')?.textContent?.replace(/\s+/g, ' ').trim(),
		legs: [...document.querySelectorAll('.dt-pass-leg')].map((el) =>
			el.textContent.replace(/\s+/g, ' ').trim(),
		),
		go: document.querySelector('.dt-pass-go')?.textContent?.replace(/\s+/g, ' ').trim(),
		bare: !document.querySelector('.dt-frame'),
		offCentre: Math.abs(box.left + box.width / 2 - innerWidth / 2),
	};
});
check(
	'a share link renders the bare boarding pass',
	pass.band === 'delphitools Workflow:' &&
		pass.legs.join('|') === 'First, Paste Image|Then... Metadata Stripper' &&
		pass.go === "Let's go" &&
		pass.bare,
	JSON.stringify(pass),
);
check('the pass is centred', pass.offCentre < 2, `${pass.offCentre}px off`);
await page.click('.dt-pass-go');
await page.waitForSelector('.dt-flow', { timeout: 15000 });
await sleep(300);
state = await page.evaluate(() => ({
	path: location.pathname,
	record: JSON.parse(sessionStorage.getItem('flow') ?? 'null')?.workflow,
}));
check(
	"Let's go starts the shared flow",
	state.path === '/tools/paste-image' && state.record === 'custom:paste-image.metadata-stripper',
	JSON.stringify(state),
);
await page.click('.dt-flow-exit');
await sleep(300);

await goBare(page, '/w/paste-image.pdf-compressor');
await page.waitForSelector('.dt-wf-row', { timeout: 15000 });
check(
	'an incompatible link lands on the list',
	(await page.evaluate(() => location.pathname)) === '/workflows' && !(await page.$('.dt-pass')),
);

await visit(page, '/workflows');
await page.waitForSelector('.dt-wf-custom', { timeout: 15000 });
await open(0);
await choose('Paste Image');
await open(1);
await choose('Metadata Stripper');
await page.click('.dt-wf-link');
await page.waitForSelector('.dt-pass', { timeout: 15000 });
check(
	'the share link navigates in-app to the pass',
	(await page.evaluate(() => location.pathname)) === '/w/paste-image.metadata-stripper',
	await page.evaluate(() => location.pathname),
);
await page.click('.dt-pass-all');
await page.waitForSelector('.dt-wf-custom', { timeout: 15000 });
check(
	'All workflows returns to the list',
	await page.evaluate(() => location.pathname === '/workflows' && !document.querySelector('.dt-pass')),
	await page.evaluate(() => location.pathname),
);

await finish(browser);
