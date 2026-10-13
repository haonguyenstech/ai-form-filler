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
  window.__lastField = null;
  window.chrome = {
    storage: { onChanged: { addListener: () => {} }, sync: { get: async () => ({ apiKey: "sk-or-test" }), set: () => {} }, local: { get: async () => ({}), set: () => {} } },
    runtime: {
      getURL: (p) => "data:application/octet-stream;base64,",
      onMessage: { addListener: () => {} },
      sendMessage: async (m) => {
        if (m.action === "runRegenerate") { window.__lastField = m.opts.field; return { ok: true, value: "Inline Jane" }; }
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
const ev = (fn) => page.evaluate(([sr, fn]) => eval("(" + fn + ")")(eval(sr)), [sr, fn.toString()]);

// focus the page's native input -> icon should appear
await page.focus("#fullName");
await page.waitForTimeout(250);
const shown = await ev((r) => r.querySelector(".qa").classList.contains("show"));
console.log("icon shows on focus:", shown);
await page.screenshot({ path: "/tmp/inline-icon.png" });

// click the icon -> should call runRegenerate and fill the input
await ev((r) => r.querySelector(".qa").click());
await page.waitForTimeout(300);
const value = await page.$eval("#fullName", (el) => el.value);
const sentLabel = await page.evaluate(() => window.__lastField?.label);
const sentType = await page.evaluate(() => window.__lastField?.type);
console.log("filled value:", JSON.stringify(value), "| sent label:", JSON.stringify(sentLabel), "| type:", sentType);

// disabling the setting hides the icon
await ev((r) => { const c = r.querySelector("#inlineToggle"); c.checked = false; c.dispatchEvent(new Event("change")); });
await page.focus("#fullName");
await page.waitForTimeout(150);
const hiddenWhenOff = await ev((r) => !r.querySelector(".qa").classList.contains("show"));
console.log("icon hidden when setting off:", hiddenWhenOff);

const ok = shown && value === "Inline Jane" && sentLabel === "Full Name *" && sentType === "text" && hiddenWhenOff;
console.log("\nRESULT:", ok ? "✅ PASS" : "❌ FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
