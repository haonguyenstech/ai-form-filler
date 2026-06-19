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
  window.__localSets = [];
  window.chrome = {
    storage: {
      sync: { get: async () => ({}), set: () => {} },
      local: { get: async () => ({}), set: (o) => window.__localSets.push(o) },
    },
    runtime: {
      onMessage: { addListener: () => {} },
      sendMessage: async (m) => {
        if (m.action === "runUndo") return { ok: true, restored: 2, skipped: 1 };
        await new Promise((r) => setTimeout(r, 1500)); // slow fill → test stays-open
        return { ok: true, filled: 3, total: 3, canUndo: true };
      },
    },
  };
});
await page.goto(`http://localhost:${PORT}/test-page.html`);
await page.waitForFunction(() => window.__ready, { timeout: 15000 });
await page.addScriptTag({ content: inject });
await page.waitForTimeout(200);
const sr = "document.getElementById('__aiff_host').shadowRoot";
const q = (sel) => page.evaluate(([sr, sel]) => eval(sr).querySelector(sel), [sr, sel]);
const isOpen = () => page.evaluate((sr) => eval(sr).querySelector(".overlay").classList.contains("open"), sr);

// open + screenshot the idle dialog
await page.evaluate((sr) => eval(sr).querySelector(".bubble").click(), sr);
await page.waitForTimeout(350);
console.log("dialog open:", await isOpen());
await page.screenshot({ path: "/tmp/bubble-idle.png" });

// this test covers the one-shot path (review off)
await page.evaluate((sr) => { eval(sr).querySelector("#reviewToggle").checked = false; }, sr);
// click fill → enters loading
await page.evaluate((sr) => eval(sr).querySelector("#fillBtn").click(), sr);
await page.waitForTimeout(300);
const loading = await page.evaluate((sr) => eval(sr).querySelector("#fillBtn").classList.contains("loading"), sr);
console.log("button loading:", loading);
await page.screenshot({ path: "/tmp/bubble-loading.png" });

// try to dismiss while loading (Esc + overlay click) — must STAY open
await page.keyboard.press("Escape");
await page.evaluate((sr) => eval(sr).querySelector(".overlay").click(), sr);
await page.waitForTimeout(100);
const openDuringLoad = await isOpen();
console.log("stays open during load (Esc + overlay click ignored):", openDuringLoad);

// wait for completion
await page.waitForTimeout(1600);
const openAfter = await isOpen();
const statusTxt = await page.evaluate((sr) => eval(sr).querySelector("#status").textContent, sr);
console.log("stays open after success:", openAfter, "| status:", statusTxt.trim());
await page.screenshot({ path: "/tmp/bubble-done.png" });

// undo button shows after fill, runs, then hides
const undoShown = await page.evaluate((sr) => !eval(sr).querySelector("#undoBtn").hidden, sr);
await page.evaluate((sr) => eval(sr).querySelector("#undoBtn").click(), sr);
await page.waitForTimeout(200);
const undoStatus = await page.evaluate((sr) => eval(sr).querySelector("#status").textContent, sr);
const undoHidAfter = await page.evaluate((sr) => eval(sr).querySelector("#undoBtn").hidden, sr);
console.log("undo button shown:", undoShown, "| after undo status:", undoStatus.trim(), "| hidden after:", undoHidAfter);

// per-site toggle hides the bubble + persists
await page.evaluate((sr) => { const c = eval(sr).querySelector("#siteToggle"); c.checked = false; c.dispatchEvent(new Event("change")); }, sr);
const bubbleHidden = await page.evaluate((sr) => eval(sr).querySelector(".bubble").style.display === "none", sr);
const savedDisabled = await page.evaluate(() => window.__localSets.some((o) => "aiff_disabled" in o));
console.log("site toggle hides bubble:", bubbleHidden, "| persisted:", savedDisabled);

const ok = loading && openDuringLoad && openAfter && /Filled 3 of 3/.test(statusTxt) &&
  undoShown && /Reverted 2/.test(undoStatus) && undoHidAfter && bubbleHidden && savedDisabled;
console.log("\nRESULT:", ok ? "✅ PASS" : "❌ FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
