import {
  BASE,
  check,
  finish,
  launch,
  sleep,
} from "./harness.mjs";

const { browser, page } = await launch({ viewport: { width: 1500, height: 950 } });
await page.goto(`${BASE}/editor`, { waitUntil: "networkidle2" });
await page.waitForFunction(() => window.__substrata, { timeout: 25000 });
await sleep(600);

const vt = await page.evaluate(() => window.__substrata.vt());
const rect = await page.evaluate(() => {
  const r = document.querySelector("canvas.upper-canvas").getBoundingClientRect();
  return { left: r.left, top: r.top };
});
const toCanvas = (sx, sy) => ({ x: sx * vt[0] + vt[4], y: sy * vt[3] + vt[5] });
const sample = async (sx, sy) => {
  const p = toCanvas(sx, sy);
  // rAF or stale reads
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.evaluate(([x, y]) => window.__substrata.samplePixel(x, y), [p.x, p.y]);
};
const near = (px, rgb, tol = 20) =>
  !!px && rgb.every((v, i) => Math.abs(px[i] - v) <= tol);

const drag = async (s0, s1) => {
  const a = toCanvas(s0.x, s0.y);
  const b = toCanvas(s1.x, s1.y);
  await page.mouse.move(rect.left + a.x, rect.top + a.y);
  await page.mouse.down();
  await page.mouse.move(rect.left + b.x, rect.top + b.y, { steps: 8 });
  await page.mouse.up();
  await sleep(350);
};
const undo = async () => {
  await page.keyboard.down("Meta");
  await page.keyboard.press("z");
  await page.keyboard.up("Meta");
  await sleep(350);
};

// panel rows re-render; always re-query
const P = "[data-panel=inspector]";
const clickMode = (text) =>
  page
    .evaluate(
      (p, t) => {
        const b = [...document.querySelectorAll(`${p} [role=radio]`)].find(
          (x) => x.textContent.trim().toLowerCase() === t,
        );
        b?.click();
        return !!b;
      },
      P,
      text,
    )
    .then(async (ok) => {
      await sleep(300);
      return ok;
    });

// the last row so titled: the gradient's Angle follows the Transform one
const lastRow = (p, l) =>
  [...document.querySelectorAll(`${p} .canon-row`)]
    .filter((r) => r.querySelector(".canon-row-title")?.textContent.trim() === l)
    .at(-1) ?? null;

const rowCount = (label) =>
  page.evaluate(
    (p, l) =>
      [...document.querySelectorAll(`${p} .canon-row-title`)].filter((t) => t.textContent.trim() === l).length,
    P,
    label,
  );

const rowValue = (label) =>
  page.evaluate(
    (p, l, find) => {
      const row = new Function(`return ${find}`)()(p, l);
      if (!row) return null;
      const field = row.querySelector("input.canon-stepper-field");
      return field ? field.value : (row.querySelector(".sub-ip-fact")?.textContent.trim() ?? null);
    },
    P,
    label,
    lastRow.toString(),
  );

const rowPress = async (label, aria, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.evaluate(
      (p, l, a, find) => new Function(`return ${find}`)()(p, l)?.querySelector(`button[aria-label="${a}"]`)?.click(),
      P,
      label,
      aria,
      lastRow.toString(),
    );
    await sleep(120);
  }
  await sleep(220);
};

const rowDisabled = (label, aria) =>
  page.evaluate(
    (p, l, a, find) => new Function(`return ${find}`)()(p, l)?.querySelector(`button[aria-label="${a}"]`)?.disabled ?? null,
    P,
    label,
    aria,
    lastRow.toString(),
  );

const BASE_RGB = [204, 34, 0];
await page.evaluate(() => window.__substrataUi.toggle("inspector"));
await sleep(300);
check("inspector opens", await page.evaluate((p) => !!document.querySelector(p), P));

await page.evaluate(() => {
  window.__substrata.setTool("pieces", "primitives");
  window.__substrata.toolSettings("pieces", {
    shape: "rectangle",
    fill: "#cc2200",
    stroke: null,
    cornerRadius: 0,
  });
});
await drag({ x: 600, y: 500 }, { x: 1000, y: 700 });
let px = await sample(800, 600);
check("baseline: solid rect drawn", near(px, BASE_RGB), `${px}`);

const fillModes = await page.evaluate((p) =>
  [...document.querySelectorAll(`${p} [role=radio]`)].map((b) => b.textContent.trim().toLowerCase()),
  P,
);
check(
  "Fill row shows the solid/gradient pair",
  fillModes.slice(0, 2).join(",") === "solid,gradient",
  fillModes.join(","),
);

check("gradient mode cell clicks", await clickMode("gradient"));
const left0 = await sample(610, 600);
check("gradient: left edge is stop[0] (the base colour)", near(left0, BASE_RGB, 26), `${left0}`);
px = await sample(960, 560); // clear of handle at (1000,600)
check(
  "gradient: far side is darker, same hue",
  px[0] < left0[0] - 30 && px[0] >= px[1] && px[0] >= px[2],
  `${px}`,
);

await undo();
px = await sample(960, 560);
check("solid→gradient is one undo step", near(px, BASE_RGB), `${px}`);

await clickMode("gradient");
await rowPress("Angle", "Increase", 6);
const angle90 = await rowValue("Angle");
check("Angle stepper reads 90", angle90 === "90", angle90 ?? "(no row)");
const top = await sample(800, 515);
const bottom = await sample(800, 685);
check("angle 90°: top is stop[0]", near(top, BASE_RGB, 30), `${top}`);
check("angle 90°: bottom darker than top", bottom[0] < top[0] - 40, `${top} → ${bottom}`);

await undo();
const angle75 = await rowValue("Angle");
check("one stepper click = one undo step (75)", angle75 === "75", angle75 ?? "(no row)");
await rowPress("Angle", "Increase", 1);

check("radial type cell clicks", await clickMode("radial"));
px = await sample(800, 600);
check("radial: centre is stop[0]", near(px, BASE_RGB, 26), `${px}`);
px = await sample(970, 665); // past r2, clear of handle
check("radial: corner reaches the far stop", px[0] < BASE_RGB[0] - 40, `${px}`);

check("radial hides the gradient Angle row", (await rowCount("Angle")) === 1);
check("linear restores it", (await clickMode("linear")) && (await rowCount("Angle")) === 2);
await clickMode("radial");

check("stops start at 1/2", (await rowValue("Stop")) === "1/2", (await rowValue("Stop")) ?? "");
await rowPress("Stop", "Add stop", 1);
check("add selects the new stop, 2/3", (await rowValue("Stop")) === "2/3", (await rowValue("Stop")) ?? "");

await page.evaluate(() => {
  const markers = [...document.querySelectorAll(".sub-ip-grad-stop")];
  markers.sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));
  markers[markers.length - 1].click();
});
await sleep(250);
check("last marker selects 3/3", (await rowValue("Stop")) === "3/3", (await rowValue("Stop")) ?? "");
const markerSelected = await page.evaluate(() => {
  const markers = [...document.querySelectorAll(".sub-ip-grad-stop")];
  markers.sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));
  return markers[markers.length - 1].classList.contains("is-selected");
});
check("the selected marker carries is-selected", markerSelected);

// the ring's stream is one undo step, ended by its final send
await page.evaluate((p) => document.querySelector(`${p} button[aria-label="Stop colour"]`).click(), P);
await sleep(200);
await page.evaluate(() => {
  const t = window.__substrataUi.ringTarget;
  t.send("#8800ff", 1, false);
  t.send("#0000ff", 1, false);
  t.send("#0000ff", 1, true);
  window.__substrataUi.closeRing();
});
await sleep(400);
px = await sample(970, 665);
check("streamed picks recolour the outer stop blue", px[2] > 150 && px[0] < 90, `${px}`);
await undo();
px = await sample(970, 665);
check("the stream coalesced to ONE undo step", px[0] >= px[2], `${px}`);

await rowPress("Stop", "Remove stop", 1);
check("remove leaves 2 stops", /\/2$/.test((await rowValue("Stop")) ?? ""), (await rowValue("Stop")) ?? "");
check("remove disables at the 2-stop floor", (await rowDisabled("Stop", "Remove stop")) === true);

await clickMode("solid");
const c1 = await sample(800, 600);
const c2 = await sample(970, 665);
check("solid switch-back is flat stop[0] everywhere", near(c1, BASE_RGB) && near(c2, BASE_RGB), `${c1} / ${c2}`);

await clickMode("gradient");
await page.evaluate(() => window.__substrata.colour("#0044cc"));
await sleep(400);
const s1 = await sample(610, 600);
const s2 = await sample(960, 560);
check(
  "a flat sink pick replaces the gradient",
  near(s1, [0, 68, 204]) && near(s2, [0, 68, 204]),
  `${s1} / ${s2}`,
);

await finish(browser);
