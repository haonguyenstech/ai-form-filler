// Two tabs, one extension: a setting changed in tab 1 must reach tab 2 — its UI,
// the request it sends, and it must not write the old value back on its next save.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT = join(__dirname, "..");
const PORT = process.env.PORT || "5199";
const URL = `http://localhost:${PORT}/dialogs/native.html`;

const ctx = await chromium.launchPersistentContext("", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
await sw.evaluate(() => chrome.storage.sync.set({ apiKey: "sk-or-test", model: "nvidia/nemotron-3-super-120b-a12b:free", review: true }));
const sentModels = [];
await ctx.route("https://openrouter.ai/**", async (route) => {
  const body = route.request().postDataJSON();
  sentModels.push(body.model);
  const f = JSON.parse(body.messages[1].content.split("Fields (JSON):\n")[1].split("\n\nRespond")[0]);
  await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(Object.fromEntries(f.map((x) => [x.id, "x"]))) } }] } });
});

const SR = "document.getElementById('__aiff_host').shadowRoot";
const open = async () => {
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.waitForSelector("#__aiff_host", { state: "attached" });
  await p.waitForTimeout(400);
  return p;
};
const ev = (p, fn, arg) => p.evaluate(([sr, fn, arg]) => eval("(" + fn + ")")(eval(sr), arg), [SR, fn.toString(), arg]);
const tab1 = await open(), tab2 = await open();

// tab 1: change the model through the real UI (custom select → option)
await ev(tab1, (r) => { r.querySelector(".bubble").click(); r.querySelector("#tabSettings").click(); });
await tab1.waitForTimeout(150);
await ev(tab1, (r) => r.querySelector("#model").closest(".sel").querySelector(".sel-btn").click());
await tab1.waitForTimeout(150);
await ev(tab1, (r) => [...r.querySelectorAll(".sel-opt")].find((o) => /Laguna/.test(o.textContent)).click());
await tab1.waitForTimeout(400);

// tab 2: value and visible label follow
const t2 = await ev(tab2, (r) => ({
  value: r.querySelector("#model").value,
  label: r.querySelector("#model").closest(".sel").querySelector(".sel-label").textContent,
}));
console.log("tab 2 model after tab 1 changed it:", JSON.stringify(t2));

// tab 2: a fill sends the new model
await ev(tab2, (r) => { r.querySelector(".bubble").click(); r.querySelector("#reviewToggle").checked = false; });
await ev(tab2, (r) => r.querySelector("#fillBtn").click());
await tab2.waitForTimeout(2500);
console.log("model tab 2 sent:", sentModels.at(-1));

// tab 2 saving any setting must not put the old model back
await ev(tab2, (r) => { const t = r.querySelector("#reviewToggle"); t.checked = true; t.dispatchEvent(new Event("change", { bubbles: true })); });
await tab2.waitForTimeout(300);
const stored = (await sw.evaluate(() => chrome.storage.sync.get("model"))).model;
console.log("stored model after tab 2 saved:", stored);
const reviewInTab1 = await ev(tab1, (r) => r.querySelector("#reviewToggle").checked);

// saved instructions and the per-site bubble toggle follow too
await ev(tab1, (r) => { r.querySelector("#tabInstr").click(); r.querySelector("#newInstr").value = "fill as a nurse from Hue"; r.querySelector("#addInstr").click(); });
await ev(tab1, (r) => { r.querySelector("#tabSettings").click(); const t = r.querySelector("#siteToggle"); t.checked = false; t.dispatchEvent(new Event("change", { bubbles: true })); });
await tab1.waitForTimeout(400);
const instrInTab2 = await ev(tab2, (r) => [...r.querySelectorAll("#instrList .itext")].some((n) => n.textContent === "fill as a nurse from Hue"));
const bubbleHiddenInTab2 = await ev(tab2, (r) => r.querySelector(".bubble").style.display === "none");
console.log("instruction reached tab 2:", instrInTab2, "| bubble hidden in tab 2:", bubbleHiddenInTab2, "| review toggle reached tab 1:", reviewInTab1);

const ok = t2.value === "poolside/laguna-s-2.1:free" && /Laguna/.test(t2.label) &&
  sentModels.at(-1) === "poolside/laguna-s-2.1:free" && stored === "poolside/laguna-s-2.1:free" &&
  reviewInTab1 === true && instrInTab2 && bubbleHiddenInTab2;
console.log("\nRESULT:", ok ? "✅ PASS" : "❌ FAIL");
await ctx.close();
process.exit(ok ? 0 : 1);
