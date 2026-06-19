import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const inject = readFileSync(join(__dirname, "..", "inject.js"), "utf8");
const PORT = process.env.PORT || "5199";

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
await page.addInitScript(() => {
  window.__applied = null;
  window.chrome = {
    storage: { sync: { get: async () => ({}), set: () => {} }, local: { get: async () => ({}), set: () => {} } },
    runtime: {
      onMessage: { addListener: () => {} },
      sendMessage: async (m) => {
        if (m.action === "runPreview")
          return { ok: true,
            fields: [
              { id: "0", kind: "input", type: "text", label: "Full Name", required: true },
              { id: "1", kind: "combobox", type: "select", label: "Gender", options: ["Male", "Female", "Other"] },
            ],
            values: { "0": "Jane Doe", "1": "Female" } };
        if (m.action === "runRegenerate") return { ok: true, value: "Regen-" + m.opts.field.id };
        if (m.action === "runApply") { window.__applied = m.values; return { ok: true, filled: 2, total: 2, canUndo: true }; }
        return { ok: true };
      },
    },
  };
});
await page.goto(`http://localhost:${PORT}/test-page.html`);
await page.waitForFunction(() => window.__ready, { timeout: 15000 });
await page.addScriptTag({ content: inject });
await page.waitForTimeout(200);
const sr = "document.getElementById('__aiff_host').shadowRoot";
const ev = (fn, arg) => page.evaluate(([sr, fn, arg]) => eval("(" + fn + ")")(eval(sr), arg), [sr, fn.toString(), arg]);

// open + click fill → preview
await ev((r) => r.querySelector(".bubble").click());
await page.waitForTimeout(200);
await ev((r) => r.querySelector("#fillBtn").click());
await page.waitForTimeout(400);

const reviewShown = await ev((r) => !r.querySelector("#reviewView").hidden);
const rows = await ev((r) => r.querySelectorAll(".rrow").length);
const v0 = await ev((r) => r.querySelector('.rval[data-id="0"]').value);
const isSelect = await ev((r) => r.querySelector('.rval[data-id="1"]').tagName.toLowerCase());
console.log("review shown:", reviewShown, "| rows:", rows, "| name value:", v0, "| gender is", isSelect);

// edit name, regenerate it
await ev((r) => { r.querySelector('.rval[data-id="0"]').value = "Edited Name"; });
await ev((r) => r.querySelector('.regen[data-id="0"]').click());
await page.waitForTimeout(300);
const afterRegen = await ev((r) => r.querySelector('.rval[data-id="0"]').value);
console.log("after regenerate name:", afterRegen);

// apply
await ev((r) => r.querySelector("#applyBtn").click());
await page.waitForTimeout(400);
const applied = await page.evaluate(() => window.__applied);
const backToForm = await ev((r) => !r.querySelector("#formView").hidden);
const status = await ev((r) => r.querySelector("#status").textContent);
console.log("applied values:", JSON.stringify(applied), "| back to form:", backToForm, "| status:", status.trim());

const ok = reviewShown && rows === 2 && v0 === "Jane Doe" && isSelect === "select" &&
  afterRegen === "Regen-0" && applied && applied["0"] === "Regen-0" && applied["1"] === "Female" &&
  backToForm && /Filled 2 of 2/.test(status);
console.log("\nRESULT:", ok ? "✅ PASS" : "❌ FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
