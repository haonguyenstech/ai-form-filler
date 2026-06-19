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
  window.__sent = [];
  window.chrome = {
    storage: { sync: { get: async () => ({}), set: () => {} }, local: { get: async () => ({}), set: () => {} } },
    runtime: {
      onMessage: { addListener: () => {} },
      sendMessage: async (m) => {
        window.__sent.push(m);
        if (m.action === "testConnection") {
          if (m.opts.provider === "openrouter" && m.opts.apiKey === "bad") return { ok: false, error: "Invalid or expired API key." };
          return { ok: true, model: m.opts.model };
        }
        return { ok: true };
      },
    },
  };
});
await page.goto(`http://localhost:${PORT}/test-page.html`);
await page.waitForFunction(() => window.__ready, { timeout: 15000 });
await page.addScriptTag({ content: inject });
await page.waitForTimeout(200);
const SR = "document.getElementById('__aiff_host').shadowRoot";
const ev = (fn) => page.evaluate(([sr, fn]) => eval("(" + fn + ")")(eval(sr)), [SR, fn.toString()]);

// open dialog, switch to the new Settings tab
await ev((r) => r.querySelector(".bubble").click());
await page.waitForTimeout(100);
await ev((r) => r.querySelector("#tabSettings").click());
await page.waitForTimeout(80);
const tabOpen = await ev((r) => !r.querySelector("#panelSettings").hidden && r.querySelector("#panelFill").hidden);
console.log("Settings tab open:", tabOpen);
await page.screenshot({ path: "/tmp/settings-tab.png" });

// default provider is the no-proxy DeepSeek, deepseekBox shown, orBox hidden
const defProvider = await ev((r) => r.querySelector("#provider").value);
const dsBoxShown = await ev((r) => r.querySelector("#deepseekBox").style.display !== "none");
const orHidden = await ev((r) => r.querySelector("#orBox").style.display === "none");
console.log("default provider:", JSON.stringify(defProvider), "| deepseekBox shown:", dsBoxShown, "| orBox hidden:", orHidden);

// test connection on DeepSeek needs no key
await ev((r) => r.querySelector("#testConn").click());
await page.waitForTimeout(150);
const dsResult = await ev((r) => r.querySelector("#testResult").textContent);
const dsSentModel = await page.evaluate(() => [...window.__sent].reverse().find((m) => m.action === "testConnection")?.opts.model);
console.log("DeepSeek test result:", JSON.stringify(dsResult), "| model sent:", JSON.stringify(dsSentModel));

// switch to OpenRouter -> key field + model select appear
await ev((r) => { const p = r.querySelector("#provider"); p.value = "openrouter"; p.dispatchEvent(new Event("change")); });
await page.waitForTimeout(60);
const orShown = await ev((r) => r.querySelector("#orBox").style.display !== "none" && r.querySelector("#deepseekBox").style.display === "none");
console.log("OpenRouter box shown:", orShown);

// success
await ev((r) => { r.querySelector("#apiKey").value = "sk-or-good"; });
await ev((r) => r.querySelector("#testConn").click());
await page.waitForTimeout(150);
const okText = await ev((r) => r.querySelector("#testResult").textContent);
const okClass = await ev((r) => r.querySelector("#testResult").className);
console.log("OR success:", JSON.stringify(okText), "| class:", okClass);

// failure (bad key)
await ev((r) => { r.querySelector("#apiKey").value = "bad"; });
await ev((r) => r.querySelector("#testConn").click());
await page.waitForTimeout(150);
const errText = await ev((r) => r.querySelector("#testResult").textContent);
const errClass = await ev((r) => r.querySelector("#testResult").className);
console.log("OR failure:", JSON.stringify(errText), "| class:", errClass);

const ok = tabOpen && defProvider === "deepseek" && dsBoxShown && orHidden &&
  /Connected/.test(dsResult) && dsSentModel === "deepseek-v4-flash-free" &&
  orShown && /Connected/.test(okText) && /ok/.test(okClass) &&
  /Invalid or expired/.test(errText) && /err/.test(errClass);
console.log("\nRESULT:", ok ? "✅ PASS" : "❌ FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
