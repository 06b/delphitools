import { BASE, check, finish, launch, sleep, visit } from "./harness.mjs";

const { browser, page } = await launch();

// scrolls every scroller to its end so the lazy sticker loads
async function toEnd() {
	await page.evaluate(() => {
		for (const el of document.querySelectorAll(
			".dt-canon-tool .canon-split-body, .dt-canon-tool .canon-split-main",
		))
			el.scrollTop = el.scrollHeight;
	});
	await sleep(1200);
}

const place = () =>
	page.evaluate(() => {
		const btn = document.querySelector(
			".dt-canon-tool .canon-split-end .dt-sticker-btn",
		);
		const img = btn?.querySelector("img");
		const end = btn?.closest(".canon-split-end");
		const main = end?.parentElement;
		const body = main?.parentElement;
		const sections = [...(main?.children ?? [])].filter(
			(el) =>
				!el.matches(".canon-split-end, .canon-split-footer"),
		);
		const last = sections.at(-1);
		const box = (el) => el.getBoundingClientRect();
		// stacked: the panes are display: contents, the body is the column
		const items = [...(body?.querySelectorAll(
			":scope > *, :scope > .canon-split-pane > *",
		) ?? [])].filter(
			(el) =>
				getComputedStyle(el).display !== "contents" &&
				getComputedStyle(el).display !== "none" &&
				!el.matches(".canon-split-footer, .canon-split-rule"),
		);
		const lowest = items.reduce(
			(a, el) => (box(el).bottom > box(a).bottom ? el : a),
			items[0],
		);
		return {
			present: !!btn,
			loaded: !!img && img.complete && img.naturalWidth > 0,
			name: btn?.getAttribute("aria-label"),
			value: btn?.getAttribute("aria-description"),
			layout: body
				? getComputedStyle(body)
						.getPropertyValue("--canon-split-layout")
						.trim()
				: "",
			inMain: !!main?.matches(".canon-split-main"),
			afterLast: !!last && box(end).top >= box(last).bottom,
			lastInColumn: lowest === end,
		};
	});

await visit(page, "/tools/qr-genny");
await toEnd();
let wide = await place();
check("qr-genny sticker present", wide.present);
check("qr-genny sticker loads", wide.loaded);
check(
	"sticker named as on iOS",
	wide.name === "Sticker" && wide.value === "QR Generator",
	`${wide.name} / ${wide.value}`,
);
check("side by side at 1400", wide.layout === "wide", wide.layout);
check("side by side: in the main pane", wide.inMain);
check("side by side: after the last main section", wide.afterLast);

const peel = await page.evaluate(() => {
	let saved = "";
	const click = HTMLAnchorElement.prototype.click;
	HTMLAnchorElement.prototype.click = function () {
		saved = this.download;
	};
	const btn = document.querySelector(".canon-split-end .dt-sticker-btn");
	btn.focus();
	btn.click();
	HTMLAnchorElement.prototype.click = click;
	return { saved };
});
await sleep(100);
check(
	"a click peels the sticker",
	await page.evaluate(
		() => !!document.querySelector(".canon-split-end .is-peeling"),
	),
);
check(
	"and downloads delphitools-qr-genny-sticker.png",
	peel.saved === "delphitools-qr-genny-sticker.png",
	peel.saved,
);
await sleep(1300);

await page.setViewport({ width: 390, height: 844 });
await sleep(400);
await toEnd();
const stacked = await place();
check("stacked at 390", stacked.layout === "stacked", stacked.layout);
check("stacked: the last thing in the column", stacked.lastInColumn);

await page.setViewport({ width: 1400, height: 1000 });
for (const id of ["stupid-units", "recipe-table"]) {
	await visit(page, `/tools/${id}`);
	await toEnd();
	const none = await page.evaluate(() => {
		const end = document.querySelector(".dt-canon-tool .canon-split-end");
		return !!end && !end.querySelector(".dt-sticker-btn") &&
			end.getBoundingClientRect().height === 0;
	});
	check(`${id} without art shows nothing`, none);
}

// in-app navigation swaps the sticker for the next tool's
await page.evaluate(() => {
	const a = document.querySelector('a[href="/tools/json-formatter"]');
	a?.click();
});
await sleep(1500);
await toEnd();
const swapped = await place();
check(
	"navigating to json-formatter shows its sticker",
	swapped.present && swapped.loaded && swapped.value === "JSON Formatter",
	swapped.value,
);

await visit(page, "/");
await page.evaluate(() => {
	const el = document.querySelector(".dt-sticker-wall");
	if (el) el.scrollIntoView({ block: "center" });
});
await sleep(600);
const wall = await page.evaluate(() => {
	const bin = document.querySelector(".dt-sticker-bin");
	return {
		present: !!document.querySelector(".dt-sticker-wall"),
		buttons: bin ? bin.querySelectorAll(".dt-sticker-btn").length : 0,
	};
});
check("home-page sticker wall present", wall.present);
check("sticker bin has five stickers", wall.buttons === 5, wall.buttons);

await finish(browser);
