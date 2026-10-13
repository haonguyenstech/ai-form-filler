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
    storage: { onChanged: { addListener: () => {} }, sync: { get: async () => ({}), set: () => {} }, local: { get: async () => ({}), set: () => {} } },
    runtime: {
      getURL: (p) => "data:application/octet-stream;base64,",
      onMessage: { addListener: () => {} },
      sendMessage: async (m) => {
        window.__sent.push(m);
        if (m.action === "testConnection") {
          // a real call takes seconds; delay so the in-flight button state is observable
          await new Promise((r) => setTimeout(r, 300));
          if (m.opts.apiKey === "bad") return { ok: false, error: "Invalid or expired API key." };
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

// OpenRouter is the only provider: no picker, key field + model select always shown
const noPicker = await ev((r) => !r.querySelector("#provider") && !r.querySelector("#opencodeBox"));
const orShown = await ev((r) => r.querySelector("#orBox").style.display !== "none");
console.log("no provider picker:", noPicker, "| OpenRouter box shown:", orShown);

// no key -> fails locally, nothing sent
await ev((r) => r.querySelector("#testConn").click());
await page.waitForTimeout(100);
const noKeyText = await ev((r) => r.querySelector("#testResult").textContent);
const sentNoKey = await page.evaluate(() => window.__sent.filter((m) => m.action === "testConnection").length);
console.log("no key:", JSON.stringify(noKeyText), "| requests sent:", sentNoKey);

// the default model is sent; switching the model changes what gets sent
await ev((r) => { r.querySelector("#apiKey").value = "sk-or-good"; });
const defModel = await ev((r) => r.querySelector("#model").value);
await ev((r) => r.querySelector("#testConn").click());
await page.waitForTimeout(450);
const sent1 = await page.evaluate(() => [...window.__sent].reverse().find((m) => m.action === "testConnection")?.opts.model);
await ev((r) => { const m = r.querySelector("#model"); m.value = "poolside/laguna-s-2.1:free"; m.dispatchEvent(new Event("change")); });
await ev((r) => r.querySelector("#testConn").click());
await page.waitForTimeout(450);
const sent2 = await page.evaluate(() => [...window.__sent].reverse().find((m) => m.action === "testConnection")?.opts.model);
console.log("default model:", JSON.stringify(defModel), "| sent:", JSON.stringify(sent1), "| after switch:", JSON.stringify(sent2));

// the button reflects progress: spinner + "Testing…" while in flight
await ev((r) => r.querySelector("#testConn").click());
const btnTesting = await ev((r) => {
  const b = r.querySelector("#testConn");
  return b.classList.contains("testing") && b.querySelector(".tlabel").textContent === "Testing…";
});
await page.waitForTimeout(500);
const btnOk = await ev((r) => {
  const b = r.querySelector("#testConn");
  return b.classList.contains("ok") && b.querySelector(".tlabel").textContent === "Connected";
});
console.log("button shows testing state:", btnTesting, "| settles to ok:", btnOk);

// success
await ev((r) => { r.querySelector("#apiKey").value = "sk-or-good"; });
await ev((r) => r.querySelector("#testConn").click());
await page.waitForTimeout(450);
const okText = await ev((r) => r.querySelector("#testResult").textContent);
const okClass = await ev((r) => r.querySelector("#testResult").className);
console.log("OR success:", JSON.stringify(okText), "| class:", okClass);

// failure (bad key)
await ev((r) => { r.querySelector("#apiKey").value = "bad"; });
await ev((r) => r.querySelector("#testConn").click());
await page.waitForTimeout(450);
const errText = await ev((r) => r.querySelector("#testResult").textContent);
const errClass = await ev((r) => r.querySelector("#testResult").className);
console.log("OR failure:", JSON.stringify(errText), "| class:", errClass);

const ok = tabOpen && noPicker && orShown &&
  /API key/.test(noKeyText) && sentNoKey === 0 &&
  defModel === "nvidia/nemotron-3-super-120b-a12b:free" && sent1 === defModel &&
  sent2 === "poolside/laguna-s-2.1:free" && btnTesting && btnOk &&
  /Connected/.test(okText) && /ok/.test(okClass) &&
  /Invalid or expired/.test(errText) && /err/.test(errClass);
console.log("\nRESULT:", ok ? "✅ PASS" : "❌ FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
