import { check, finish, launch, sleep, visit } from './harness.mjs';

const { browser, page } = await launch();

const dropFile = async (selector, name, type) => {
	await page.evaluate(
		([sel, n, t]) => {
			const transfer = new DataTransfer();
			transfer.items.add(new File(['x'], n, { type: t }));
			document.querySelector(sel).dispatchEvent(
				new DragEvent('drop', { dataTransfer: transfer, bubbles: true }),
			);
		},
		[selector, name, type],
	);
	await sleep(400);
};
const openInIds = () =>
	page.evaluate(() =>
		[...document.querySelectorAll('.dt-atlas-open [data-tool]')].map(
			(a) => a.dataset.tool,
		),
	);

await visit(page, '/tools/image-atlas');
check('image-atlas: no open-in block before a file', (await openInIds()).length === 0);
await page.evaluate(
	() =>
		new Promise((resolve) => {
			const canvas = document.createElement('canvas');
			canvas.width = 8;
			canvas.height = 8;
			canvas.toBlob((blob) => {
				const transfer = new DataTransfer();
				transfer.items.add(
					new File([blob], 'IMG_2041.png', { type: 'image/png' }),
				);
				document.querySelector('.dt-ia-frame').dispatchEvent(
					new DragEvent('drop', { dataTransfer: transfer, bubbles: true }),
				);
				resolve();
			}, 'image/png');
		}),
);
await sleep(600);
const imageTools = await openInIds();
check('image-atlas: open-in lists image tools', imageTools.includes('metadata-stripper'));
check('image-atlas: open-in omits itself', !imageTools.includes('image-atlas'));
check(
	'image-atlas: open-in omits route-only entries',
	!imageTools.includes('substrata'),
);

// page.click hangs mid-navigation
await page.evaluate(() =>
	document.querySelector('.dt-atlas-open [data-tool="metadata-stripper"]').click(),
);
await page
	.waitForFunction(
		() =>
			location.pathname === '/tools/metadata-stripper' &&
			!!document.querySelector('.dt-strip-name'),
		{ timeout: 15000 },
	)
	.catch(() => {});
const handed = await page
	.$eval('.dt-strip-name', (el) => el.textContent.trim())
	.catch(() => '');
check('image-atlas: picking a tool hands the file over', handed.startsWith('IMG_2041'));

await visit(page, '/tools/video-atlas');
await dropFile('.video-atlas', 'clip.mp4', 'video/mp4');
check('video-atlas: open-in lists video tools', (await openInIds()).includes('video-muter'));

await visit(page, '/tools/audio-atlas');
await dropFile('.dt-aa-frame', 'take.mp3', 'audio/mpeg');
check('audio-atlas: open-in lists audio tools', (await openInIds()).includes('audio-trimmer'));

const nav = await page.evaluate(() => {
	const rows = [...document.querySelectorAll('.canon-sidebar-rows > *')];
	const first = (needle, n) => {
		const start = rows.findIndex((el) => el.matches('.canon-heading') && el.textContent.includes(needle));
		const end = rows.findIndex((el, i) => i > start && el.matches('.canon-heading'));
		return rows.slice(start + 1, end).slice(0, n).map((a) => a.textContent.trim());
	};
	return { images: first('Image', 2), av: first('Audio', 3), colour: first('Colour', 2) };
});
check('sidebar: Image Atlas leads its category', nav.images[0] === 'Image Atlas');
check('sidebar: Audio and Video Atlas lead theirs', nav.av[0] === 'Audio Atlas' && nav.av[1] === 'Video Atlas');
check('sidebar: Colour Atlas leads its category', nav.colour[0] === 'Colour Atlas');

await finish(browser);
