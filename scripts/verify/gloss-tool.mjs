// checks shared by the gloss editor tools (shavian, ipa)

import { sleep } from './harness.mjs';

export async function setText(page, text) {
	await page.$eval(
		'.media-marked-source',
		(el, value) => {
			el.value = value;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		},
		text,
	);
	await sleep(80);
}

// clicks the gloss of the word spelt `latin`
export async function pick(page, latin) {
	await page.$$eval(
		'.gl-gloss',
		(els, l) => els.find((e) => e.getAttribute('aria-label') === l)?.click(),
		latin,
	);
	await sleep(150);
}

export const glosses = (page) =>
	page.$$eval('.gl-word:not(.gl-word--mark)', (els) =>
		els.map((w) => ({
			latin: w.querySelector('[aria-hidden]')?.textContent,
			gloss: w.querySelector('.gl-gloss')?.textContent,
			guess: w.classList.contains('gl-word--guess'),
			lit: w.classList.contains('gl-word--lit'),
		})),
	);

// every glyph box (spelling and band) of one word or punctuation mark
// against those of every other
export const overlaps = (page) =>
	page.evaluate(() => {
		const boxes = [];
		const add = (node, owner) => {
			const text = node.textContent;
			let at = 0;
			for (const char of text) {
				const range = document.createRange();
				range.setStart(node, at);
				range.setEnd(node, at + char.length);
				at += char.length;
				if (!char.trim()) continue;
				const r = range.getBoundingClientRect();
				boxes.push({ owner, char, l: r.left, r: r.right, t: r.top, b: r.bottom });
			}
		};
		const walk = (el, owner) => {
			for (const node of el.childNodes)
				node.nodeType === 3 ? add(node, owner) : walk(node, owner);
		};
		document.querySelectorAll('.gl-word').forEach((word, i) => walk(word, i));
		const hits = [];
		for (const a of boxes)
			for (const b of boxes)
				if (
					a.owner < b.owner &&
					Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 &&
					Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5
				)
					hits.push(`${a.char}/${b.char}`);
		return { glyphs: boxes.length, hits };
	});

export const letterGlyphs = (page) =>
	page.$$eval('.gl-letter-glyph', (els) => els.map((e) => e.textContent));

export async function openLetter(page, at) {
	await page.$$eval('.gl-letter', (els, i) => els[i].click(), at);
	await sleep(150);
}

// the open letter menu's items, as shown
export const menuItems = (page) =>
	page.evaluate(() => {
		const panel = document.querySelector('.gl-letter-menu:popover-open');
		return [...(panel?.children ?? [])]
			.filter((e) => e.classList.contains('canon-menu-item'))
			.map((e) => e.textContent.replace(/\s+/g, ' ').trim());
	});

// an item of the open letter menu, or with `sub` of its open submenu
export async function choose(page, text, sub = false) {
	await page.$$eval(
		sub
			? '.gl-letter-menu .canon-menu:popover-open .canon-menu-item'
			: '.gl-letter-menu:popover-open > .canon-menu-item',
		(els, t) =>
			els
				.find((e) => e.textContent.replace(/\s+/g, ' ').trim().includes(t))
				?.click(),
		text,
	);
	await sleep(150);
}
