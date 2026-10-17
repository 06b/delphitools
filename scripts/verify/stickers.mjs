import { BASE, check, finish, launch, sleep, visit } from "./harness.mjs";

const { browser, page } = await launch();

await visit(page, "/tools/subtitle-converter");
await page.evaluate(() => {
	const el = document.querySelector(".dt-tool-sticker");
	if (el) el.scrollIntoView({ block: "center" });
});
await sleep(600);
const noSubBtn = await page.evaluate(
	() => !document.querySelector(".dt-tool-sticker .dt-sticker-btn"),
);
check("subtitle-converter per-tool sticker degrades to nothing", noSubBtn);

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
