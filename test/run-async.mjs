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
await page.waitForFunction(() => window.__ready && document.querySelector('#dept'), { timeout: 15000 });
await page.addScriptTag({ content: funcs });

const fields = await page.evaluate(() => window.aiffPageExtract());
const dept = fields.find((f) => f.label === "Department" || f.label === "Department *" || /department/i.test(f.label || ""));
console.log("=== EXTRACTED comboboxes ===");
fields.filter((f) => f.kind === "combobox").forEach((f) => console.log(`  "${f.label}" -> ${JSON.stringify(f.options)}`));

const asyncOk = dept && Array.isArray(dept.options) && dept.options.length === 4 &&
  dept.options.includes("Cardiology") && dept.options.includes("Radiology");
console.log("\nasync Department options harvested:", asyncOk ? "✅ " + JSON.stringify(dept.options) : "❌ " + JSON.stringify(dept?.options));

// also confirm fill still works on the async select
const values = {};
fields.forEach((f) => {
  if (/department/i.test(f.label || "")) values[f.id] = "Neurology";
  if (/gender/i.test(f.label || "")) values[f.id] = "Female";
});
await page.evaluate(([v, f]) => window.aiffPageFill(v, f), [values, fields]);
await page.waitForTimeout(400);
const deptText = await page.evaluate(() => document.querySelector("#dept").innerText.trim());
console.log("Department after fill:", deptText, /neurology/i.test(deptText) ? "✅" : "❌");

const ok = asyncOk && /neurology/i.test(deptText);
console.log("\nRESULT:", ok ? "✅ PASS" : "❌ FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
