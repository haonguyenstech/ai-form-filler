import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const funcs = readFileSync(join(__dirname, "..", "page-funcs.js"), "utf8");
const PORT = process.env.PORT || "5199";

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => { const t = m.text(); if (!t.includes("React DevTools")) console.log("  [page]", t); });
await page.goto(`http://localhost:${PORT}/test-page.html`);
await page.waitForFunction(() => window.__ready && document.querySelector('[role="combobox"]'), { timeout: 15000 });
// load the page-funcs into the page (defines aiffPageExtract / aiffPageFill globally)
await page.addScriptTag({ content: funcs });

// 1) EXTRACT (main world = page.evaluate)
const fields = await page.evaluate(() => window.aiffPageExtract());
console.log("=== EXTRACTED ===");
console.log(JSON.stringify(fields.map((f) => ({ id: f.id, kind: f.kind, label: f.label, opts: f.options })), null, 2));

// 2) build values (simulating the AI) keyed by id
const byLabel = {};
fields.forEach((f) => (byLabel[(f.label || "").replace(/\s*\*/, "").trim().toLowerCase()] = f));
const values = {};
if (byLabel["full name"]) values[byLabel["full name"].id] = "Jane Doe";
if (byLabel["gender"]) values[byLabel["gender"].id] = "Female";
if (byLabel["birth date"]) values[byLabel["birth date"].id] = "2026-03-15";
console.log("\n=== VALUES ===", JSON.stringify(values));

// 3) FILL (main world)
const res = await page.evaluate(([v, f]) => window.aiffPageFill(v, f), [values, fields]);
console.log("\n=== FILL LOG ===");
res.log.forEach((l) => console.log("  " + l));
console.log("filled:", res.filled + "/" + res.total);

await page.waitForTimeout(300);
const observed = await page.evaluate(() => ({
  fullName: document.querySelector("#fullName")?.value,
  gender: document.querySelector('[role="combobox"]')?.innerText.trim(),
  birthDate: document.querySelector('[data-slot="popover-trigger"]')?.innerText.trim(),
}));
console.log("\n=== OBSERVED ===", JSON.stringify(observed, null, 2));
const pass = observed.fullName === "Jane Doe" && /female/i.test(observed.gender) && (observed.birthDate || "").includes("2026-03-15");
console.log("\n=== RESULT:", pass ? "✅ PASS" : "❌ FAIL", "===");
await browser.close();
process.exit(pass ? 0 : 1);
