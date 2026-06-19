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
              { id: "2", kind: "datepicker", type: "date", label: "" },                 // no label -> "Date"
              { id: "3", kind: "input", type: "email", label: "", name: "work_email" }, // no label -> "Work Email"
              { id: "4", kind: "input", type: "tel", label: "", placeholder: "+84..." },// no label -> placeholder
            ],
            values: { "0": "Jane Doe", "1": "Female", "2": "1995-03-15", "3": "jane@acme.io", "4": "+84 90 000 0000" } };
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

await ev((r) => r.querySelector(".bubble").click());
await page.waitForTimeout(150);
await ev((r) => r.querySelector("#fillBtn").click());
await page.waitForTimeout(400);

const names = await ev((r) => [...r.querySelectorAll(".rname")].map((n) => n.textContent));
console.log("displayed names:", JSON.stringify(names));
await page.screenshot({ path: "/tmp/names-review.png" });

const ok = names[0] === "Full Name" && names[1] === "Gender" && names[2] === "Date" &&
  names[3] === "Work Email" && names[4] === "+84...";
console.log("\nRESULT:", ok ? "✅ PASS" : "❌ FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
