import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const funcs = readFileSync(join(__dirname, "..", "page-funcs.js"), "utf8");
const PORT = process.env.PORT || "5199";

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
await page.goto(`http://localhost:${PORT}/test-page.html`);
await page.waitForFunction(() => window.__ready && document.querySelector('[role="combobox"]'), { timeout: 15000 });
await page.addScriptTag({ content: funcs });

const fields = await page.evaluate(() => window.aiffPageExtract());
const values = {};
fields.forEach((f) => {
  if (/full name/i.test(f.label || "")) values[f.id] = "Jane Doe";
  if (/gender/i.test(f.label || "")) values[f.id] = "Female";
});
await page.evaluate(([v, f]) => window.aiffPageFill(v, f), [values, fields]);
await page.waitForTimeout(400);
const afterFill = await page.evaluate(() => ({
  fullName: document.querySelector("#fullName")?.value,
  gender: document.querySelector("#gender")?.innerText.trim(),
}));
console.log("after fill :", JSON.stringify(afterFill));

const undoRes = await page.evaluate(() => window.aiffPageUndo());
await page.waitForTimeout(400);
const afterUndo = await page.evaluate(() => ({
  fullName: document.querySelector("#fullName")?.value,
  gender: document.querySelector("#gender")?.innerText.trim(),
}));
console.log("undo result:", JSON.stringify(undoRes));
console.log("after undo :", JSON.stringify(afterUndo));

// native must be restored to empty; the Select had a placeholder before, so
// it can't be reverted (Radix has no clear) → counted as skipped, stays "Female".
const ok =
  afterFill.fullName === "Jane Doe" && /female/i.test(afterFill.gender) &&
  undoRes.restored >= 1 && afterUndo.fullName === "";
console.log("\nnative restored:", afterUndo.fullName === "", "| placeholder-select skipped:", undoRes.skipped >= 1);
console.log("RESULT:", ok ? "✅ PASS" : "❌ FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
