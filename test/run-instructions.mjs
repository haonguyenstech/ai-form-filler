import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const inject = readFileSync(join(__dirname, "..", "inject.js"), "utf8");
const PORT = process.env.PORT || "5199";

const browser = await chromium.launch();

// mountInject(syncData) loads a fresh page where chrome.storage.sync.get returns syncData
async function mount(syncData) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await page.addInitScript((data) => {
    window.__set = [];
    window.chrome = {
      storage: {
        sync: { get: async () => data, set: (o) => window.__set.push(o) },
        local: { get: async () => ({}), set: () => {} },
      },
      runtime: { onMessage: { addListener: () => {} }, sendMessage: async () => ({ ok: true }) },
    };
  }, syncData);
  await page.goto(`http://localhost:${PORT}/test-page.html`);
  await page.waitForFunction(() => window.__ready, { timeout: 15000 });
  await page.addScriptTag({ content: inject });
  await page.waitForTimeout(250);
  return page;
}

const SR = "document.getElementById('__aiff_host').shadowRoot";
const ev = (page, fn) => page.evaluate(([sr, fn]) => eval("(" + fn + ")")(eval(sr)), [SR, fn.toString()]);

// ── A) management in the Instructions tab (first run seeds 4 defaults) ─────────
const page = await mount({});
await ev(page, (r) => r.querySelector(".bubble").click());
await page.waitForTimeout(150);
await ev(page, (r) => r.querySelector("#tabInstr").click());
await page.waitForTimeout(100);

const tabSwitched = await ev(page, (r) => !r.querySelector("#panelInstr").hidden && r.querySelector("#panelFill").hidden);
const seeded = await ev(page, (r) => r.querySelectorAll("#instrList .irow").length);
console.log("instructions tab open:", tabSwitched, "| seeded rows (expect 4):", seeded);
await page.screenshot({ path: "/tmp/instr-tab.png" });

// add a new instruction
await ev(page, (r) => { r.querySelector("#newInstr").value = "Always use Vietnamese names"; r.querySelector("#addInstr").click(); });
await page.waitForTimeout(80);
const afterAdd = await ev(page, (r) => r.querySelectorAll("#instrList .irow").length);
const topText = await ev(page, (r) => r.querySelector("#instrList .irow .itext").textContent);
console.log("rows after add (expect 5):", afterAdd, "| top:", JSON.stringify(topText));

// mark it default (star on first row)
await ev(page, (r) => r.querySelector('#instrList .istar[data-i="0"]').click());
await page.waitForTimeout(60);
const starOn = await ev(page, (r) => r.querySelector('#instrList .istar[data-i="0"]').classList.contains("on"));
const savedDefault = await page.evaluate(() => [...window.__set].reverse().find((o) => "instrDefault" in o)?.instrDefault);
console.log("default starred:", starOn, "| persisted default:", JSON.stringify(savedDefault));

// delete a row
await ev(page, (r) => r.querySelector('#instrList .idel[data-i="2"]').click());
await page.waitForTimeout(60);
const afterDel = await ev(page, (r) => r.querySelectorAll("#instrList .irow").length);
console.log("rows after delete (expect 4):", afterDel);

// click an instruction's text -> uses it (fills box + switches back to Fill tab)
await ev(page, (r) => r.querySelector('#instrList .itext[data-i="0"]').click());
await page.waitForTimeout(80);
const used = await ev(page, (r) => r.querySelector("#instruction").value);
const backToFill = await ev(page, (r) => !r.querySelector("#panelFill").hidden);
console.log("used instruction:", JSON.stringify(used), "| switched to Fill:", backToFill);
await page.close();

// ── B) a stored default pre-fills the instruction box on a fresh page ─────────
const page2 = await mount({ instrPresets: ["My saved default"], instrDefault: "My saved default" });
const prefilled = await ev(page2, (r) => r.querySelector("#instruction").value);
console.log("default pre-fills box on load:", JSON.stringify(prefilled));
await page2.close();

const ok = tabSwitched && seeded === 4 && afterAdd === 5 && /Vietnamese/.test(topText) &&
  starOn && savedDefault === "Always use Vietnamese names" && afterDel === 4 &&
  used === "Always use Vietnamese names" && backToFill && prefilled === "My saved default";
console.log("\nRESULT:", ok ? "✅ PASS" : "❌ FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
