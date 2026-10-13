// the /canon docs: drawer nav swap and back row, every route, the home grid's live cards, patterns, screens, palette, phone

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

// node strips typescript
const { docsPages, docsPatterns, docsScreens, importLine, searchDocs } =
	await import('../../app/lib/canon-docs.ts');

const KIT = "Delphi's Canon UI Kit";
const cards = docsPatterns.filter((p) => p.card);
const sectionRows = docsPages.filter((p) =>
	['overview', 'installation', 'components', 'patterns', 'screens'].includes(
		p.kind,
	),
);

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const where = () => new URL(page.url()).pathname;
const heading = () =>
	page.evaluate(() => document.querySelector('.cd-title')?.textContent.trim());
const want = (docs) => (docs.kind === 'overview' ? KIT : docs.heading);
const drawer = () =>
	page.evaluate(() => {
		const nav = document.querySelector('.dt-sidebar');
		return {
			label: nav?.getAttribute('aria-label'),
			back: !!nav?.querySelector('.dt-docs-back'),
			tools: !!nav?.querySelector(
				'.canon-sidebar-rows a[href="/tools/px-to-rem"]',
			),
			rows: [...(nav?.querySelectorAll('.canon-sidebar-rows a') ?? [])].map(
				(a) => a.getAttribute('href'),
			),
			iconed: [
				...(nav?.querySelectorAll('.canon-sidebar-rows a') ?? []),
			]
				.filter((a) => a.querySelector('svg'))
				.map((a) => a.getAttribute('href')),
		};
	});
const layout = () =>
	page.evaluate(() => ({
		document:
			document.scrollingElement.scrollHeight <= innerHeight &&
			document.scrollingElement.scrollWidth <= innerWidth,
		pane: [...document.querySelectorAll('.dt-main, .cd-page')].every(
			(el) => el.scrollWidth <= el.clientWidth,
		),
	}));
const navClick = (url) =>
	page.click(`.dt-sidebar .canon-sidebar-rows a[href="${url}"]`);
const settle = (text) =>
	page
		.waitForFunction(
			(t) => document.querySelector('.cd-title')?.textContent.trim() === t,
			{ timeout: 5000 },
			text,
		)
		.catch(() => {});

// into the docs from a tool, through the app drawer
await visit(page, '/tools/px-to-rem');
let seen = await drawer();
check('the app drawer lists the tools', seen.label === 'Main' && seen.tools && !seen.back);
const row = await page.$('.dt-sidebar a[href="/canon"]');
check('the drawer row links to /canon', !!row && !(await row.evaluate((el) => el.target)));
await row?.click();
await page.waitForSelector('.cd-docs', { timeout: 10000 }).catch(() => {});
await sleep(300);
check('and routes there in the app', where() === '/canon' && !!(await page.$('.cd-docs')));
check('the bar names the kit', (await page.$eval('.dt-bar-title', (el) => el.textContent.trim())) === KIT);
check('the home heading is the kit name', (await heading()) === KIT);

seen = await drawer();
check('on /canon the drawer swaps to the docs nav', seen.label === 'Docs' && seen.back && !seen.tools);
check('the docs nav lists every page in order', seen.rows.join() === docsPages.map((p) => p.url).join(), `${seen.rows.length} rows`);
check(
	'only the section rows carry icons',
	seen.iconed.join() === sectionRows.map((p) => p.url).join(),
	seen.iconed.join(' '),
);
check('the docs leave no nav column inside the sheet', !(await page.$('.dt-sheet .canon-sidebar')));

// the home grid
const grid = await page.$$eval('.cd-masonry > .cd-card', (els) =>
	els.map((el) => ({
		name: el.dataset.card,
		href: el.querySelector('.cd-card-head')?.getAttribute('href'),
		live: el.children.length > 1,
	})),
);
check('the home grid shows every card pattern', grid.length === cards.length, `${grid.length} of ${cards.length}`);
check('every card is live', grid.every((c) => c.live));
check(
	'every card links to its pattern',
	grid.every((c) => c.href === `/canon/patterns/${c.name}`),
);

const card = (name) => `.cd-masonry [data-card="${name}"]`;
await page.focus(`${card('palette')} .canon-slider`);
const hue = () => page.$eval(`${card('palette')} .canon-slider`, (el) => el.getAttribute('aria-valuenow'));
const hueBefore = await hue();
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await sleep(150);
check('the palette slider moves the hue', (await hue()) !== hueBefore, `${hueBefore} -> ${await hue()}`);

const maths = () => page.$eval(`${card('maths')} [role="img"]`, (el) => el.getAttribute('aria-label'));
const mathsBefore = await maths();
await (await page.$(`xpath/${'//*[@data-card="maths"]//button[contains(., "Expanded")]'}`)).click();
await sleep(300);
check('the maths segmented control switches the form', (await maths()) !== mathsBefore, `${mathsBefore} -> ${await maths()}`);

const lit = () => page.$$eval(`${card('lamps')} .canon-lamps-lamp--lit`, (els) => els.length);
const litBefore = await lit();
await page.click(`${card('lamps')} .canon-switch:not(:checked)`);
await sleep(200);
check('a lamps switch lights a lamp', (await lit()) === litBefore + 1, `${litBefore} -> ${await lit()}`);

const clock = () => page.$eval(`${card('timecode')} .canon-timecode`, (el) => el.textContent.replace(/\s/g, ''));
const clockBefore = await clock();
await (await page.$(`xpath/${'//*[@data-card="timecode"]//button[contains(., "Record")]'}`)).click();
await sleep(600);
check('the timecode ticks', (await clock()) !== clockBefore, `${clockBefore} -> ${await clock()}`);

const paperWidth = () => page.$eval(`${card('paper')} .cd-paper-page`, (el) => el.style.inlineSize);
const portrait = await paperWidth();
await (await page.$(`xpath/${'//*[@data-card="paper"]//button[contains(., "Landscape")]'}`)).click();
await sleep(500);
check('the paper turns', (await paperWidth()) !== portrait, `${portrait} -> ${await paperWidth()}`);

await page.click(`${card('tone')} .media-play`);
await sleep(600);
const tone = await page.$eval(`${card('tone')} .media-play`, (el) => el.textContent.trim());
check('the tone card plays', tone === 'Pause', tone);
await page.click(`${card('tone')} .media-stop`);

await page.click(`${card('tone')} .cd-card-head`);
await settle('Tone');
check('a card title opens its pattern page', where() === '/canon/patterns/tone', where());

// every route, through the drawer
let walked = 0;
const missed = [];
for (const docs of docsPages) {
	await navClick(docs.url);
	await settle(want(docs));
	if (where() === docs.url && (await heading()) === want(docs)) walked++;
	else missed.push(`${docs.url} -> ${where()} "${await heading()}"`);
}
check(
	'every docs page renders through the drawer',
	walked === docsPages.length,
	missed.length ? missed.slice(0, 3).join('; ') : `${walked} pages`,
);

const components = docsPages.filter((p) => p.kind === 'component');
let demos = 0;
for (const docs of components) {
	await navClick(docs.url);
	await sleep(60);
	const live = await page.evaluate(
		() => document.querySelector('.cd-demo')?.children.length ?? 0,
	);
	if (live > 1) demos++;
}
check('every component page shows a live demo', demos === components.length, `${demos} of ${components.length}`);

const patterns = docsPages.filter((p) => p.kind === 'pattern');
const thin = [];
for (const docs of patterns) {
	await navClick(docs.url);
	await settle(docs.heading);
	const shown = await page.evaluate(() => ({
		live: (document.querySelector('.cd-live')?.children.length ?? 0) > 0,
		source: document
			.querySelector('.cd-source')
			?.textContent.includes('export default class'),
	}));
	if (!shown.live || !shown.source) thin.push(docs.name);
}
check('every pattern page shows it live and its source', thin.length === 0, thin.join(' ') || `${patterns.length} patterns`);

const screens = docsPages.filter((p) => p.kind === 'screen');
const flat = [];
for (const docs of screens) {
	await navClick(docs.url);
	await settle(docs.heading);
	const live = await page.evaluate(() => {
		const screen = document.querySelector('.cd-screen');
		return !!screen && !screen.hidden && screen.offsetHeight > 400;
	});
	await (await page.$('xpath///*[contains(@class,"cd-views")]//button[contains(., "Source")]')).click();
	await sleep(200);
	const source = await page.evaluate(() => ({
		code: document.querySelector('.cd-source')?.textContent.includes('export default class'),
		hidden: document.querySelector('.cd-screen')?.hidden,
	}));
	if (!live || !source.code || !source.hidden) flat.push(docs.name);
}
check('every screen fills the sheet live, and toggles to its source', flat.length === 0, flat.join(' ') || `${screens.length} screens`);

for (const [url, count] of [
	['/canon/patterns', docsPatterns.length],
	['/canon/screens', docsScreens.length],
]) {
	await visit(page, url);
	const thumbs = await page.$$eval('.cd-card', (els) => els.length);
	check(`${url} shows a live thumbnail per entry`, thumbs === count, `${thumbs} of ${count}`);
}

for (const url of ['/canon/installation', '/canon/components/slider', '/canon/patterns/text-tool', '/canon/screens/settings']) {
	await visit(page, url);
	check(`${url} loads directly`, where() === url && !!(await heading()));
}

for (const [from, to] of [
	['/canon/blocks/halves', '/canon/patterns/halves'],
	['/canon/blocks', '/canon/patterns'],
]) {
	await visit(page, from);
	await sleep(300);
	check(`${from} redirects to ${to}`, where() === to, where());
}

for (const url of ['/canon/components/nope', '/canon/screens/nope']) {
	await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle2' });
	check(
		`${url} is the 404 page`,
		!!(await page.waitForSelector('.dt-404-page', { timeout: 10000 }).catch(() => null)),
	);
}

await visit(page, '/canon/components/slider');
check('a component page shows the slider', !!(await page.$('.cd-demo .canon-slider')));
await page.click('.cd-import');
await sleep(200);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('the import line copies', copied === importLine('canon-slider'), copied);
check('and the toast shows', await page.$eval('.canon-toast', (t) => t.style.opacity === '1'));
const ports = await page.$$eval('.cd-ports [data-has="true"]', (els) => els.map((el) => el.textContent.trim()));
check('the platforms list the ports', ports.join() === 'Ember,React,Vue,Svelte,UIKit', ports.join());

await page.click('.cd-next');
await sleep(300);
check('next goes to the following page', where() === '/canon/components/status', where());
await page.click('.cd-previous');
await sleep(300);
check('previous comes back', where() === '/canon/components/slider', where());

// drawer search
await page.click('.dt-search-input');
await page.keyboard.type('colour well');
await sleep(200);
seen = await drawer();
const expected = searchDocs('colour well').flatMap((s) => s.pages.map((p) => p.url));
check('the drawer search filters the docs pages', seen.rows.join() === expected.join(), seen.rows.join(' '));
await page.click('.dt-search-clear');
await sleep(150);
check('and clearing it lists every page again', (await drawer()).rows.length === docsPages.length);

// the back row stays put and goes back to the app
await visit(page, '/tools/px-to-rem');
await page.click('.dt-sidebar a[href="/canon"]');
await page.waitForSelector('.dt-docs-back', { timeout: 10000 }).catch(() => {});
await navClick('/canon/components/slider');
await sleep(300);
await page.evaluate(() => {
	const scroller = document.querySelector('.dt-sidebar .canon-sidebar-scroll');
	scroller.scrollTop = scroller.scrollHeight;
});
await sleep(150);
const back = await page.evaluate(() => {
	const row = document.querySelector('.dt-docs-back').getBoundingClientRect();
	const scroller = document.querySelector('.dt-sidebar .canon-sidebar-scroll');
	return {
		scrolled: scroller.scrollTop > 0,
		visible: row.top >= 0 && row.bottom <= innerHeight && row.height > 0,
	};
});
check('the back row stays in view after the drawer scrolls', back.scrolled && back.visible, JSON.stringify(back));
await page.click('.dt-docs-back');
await sleep(500);
check('the back row returns to the last app page', where() === '/tools/px-to-rem', where());
seen = await drawer();
check('and the drawer lists the tools again', seen.label === 'Main' && seen.tools && !seen.back);

await visit(page, '/canon/patterns');
check('with no app page this session, the back row goes home', (await page.$eval('.dt-docs-back', (a) => a.getAttribute('href'))) === '/');

// ⌘K
await page.keyboard.down('Meta');
await page.keyboard.press('k');
await page.keyboard.up('Meta');
await sleep(300);
const palette = await page.evaluate(() => ({
	open: !!document.querySelector('dialog[open] .canon-command'),
	appSearch: document.activeElement?.classList.contains('dt-search-input'),
}));
check('⌘K opens the docs palette', palette.open);
check('and the drawer search stays put', !palette.appSearch);
await page.keyboard.type('settings');
await sleep(200);
await page.keyboard.press('Enter');
await sleep(400);
check('the palette navigates', where() === '/canon/screens/settings', where());
check('and closes', !(await page.$('dialog[open] .canon-command')));

for (const url of ['/canon', '/canon/components', '/canon/patterns', '/canon/patterns/readout-band', '/canon/screens/media-editor']) {
	await visit(page, url);
	const fits = await layout();
	check(`${url} at 1400: no document scroll`, fits.document && fits.pane);
}

await visit(page, '/');
check('the hero Canon tile links to /canon', !!(await page.$('.dt-hero-tile[href="/canon"]')));
await (await page.$('xpath///button[contains(@class,"canon-sidebar-row")][contains(., "About")]')).click();
await sleep(400);
await page.click('.dt-about-body a[href="/canon"]');
await sleep(500);
check('the About chip routes to /canon', where() === '/canon');
check('and closes the dialog', !(await page.$('dialog[open] .dt-about-body')));

await page.setViewport({ width: 390, height: 844 });
for (const url of ['/canon', '/canon/components', '/canon/components/slider', '/canon/patterns', '/canon/patterns/paper', '/canon/screens', '/canon/screens/converter']) {
	await visit(page, url);
	const fits = await layout();
	check(`${url} at 390: no horizontal or document scroll`, fits.document && fits.pane);
}
await visit(page, '/canon');
const columns = await page.$$eval('.cd-masonry > .cd-card', (els) => new Set(els.map((el) => el.getBoundingClientRect().left)).size);
check('the home grid is one column at 390', columns === 1, `${columns} columns`);
const closed = await page.evaluate(() => !document.querySelector('.dt-frame').classList.contains('is-open'));
await page.click('.dt-tab');
await sleep(500);
seen = await drawer();
check('a phone opens the drawer with the docs nav', closed && seen.label === 'Docs' && seen.back, JSON.stringify({ closed, label: seen.label }));
await navClick('/canon/installation');
await sleep(500);
check('a row navigates', where() === '/canon/installation', where());
check('and the drawer closes', await page.evaluate(() => !document.querySelector('.dt-frame').classList.contains('is-open')));

await finish(browser);
