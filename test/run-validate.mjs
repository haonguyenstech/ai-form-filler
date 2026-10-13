// After a fill the page's own validation decides: values it rejects go back to
// the model with the page's error message, pattern fields that are still wrong
// get a value built from the pattern, and Undo still restores the originals.
// Then the AI is out of quota: the fill must still happen, with offline data.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT = join(__dirname, "..");
const PORT = process.env.PORT || "5199";
const URL = `http://localhost:${PORT}/forms/validate.html`;

const ctx = await chromium.launchPersistentContext("", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
await sw.evaluate(() => chrome.storage.sync.set({ apiKey: "sk-or-test", review: false, locale: "auto" }));

let mode = "ai";
const prompts = [];
await ctx.route("https://openrouter.ai/**", async (route) => {
  const prompt = route.request().postDataJSON().messages[1].content;
  prompts.push(prompt);
  if (mode === "quota")
    return route.fulfill({ status: 429, json: { error: { message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day" } } });
  const fields = JSON.parse(prompt.split("Fields (JSON):\n")[1].split("\n\nRespond")[0]);
  const retry = /REJECTED/.test(prompt);
  const bad = { "Họ và tên": "Ann", Email: "not-an-email", "Mã nhân viên": "abc", "Tuổi": "99", "Mã giới thiệu": "XYZ" };
  const good = { Email: "an@example.com", "Mã nhân viên": "still wrong", "Mã giới thiệu": "VN123" };
  const vals = Object.fromEntries(fields.map((f) => [f.id, (retry ? good : bad)[f.label] ?? "x"]));
  await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(vals) } }] } });
});

const SR = "document.getElementById('__aiff_host').shadowRoot";
const ev = (p, fn) => p.evaluate(([sr, fn]) => eval("(" + fn + ")")(eval(sr)), [SR, fn.toString()]);
const state = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll("#f input")].map((i) => [i.id, {
  v: i.value, ok: i.validity.valid && i.getAttribute("aria-invalid") !== "true" }])));
async function fill(p) {
  await ev(p, (r) => { if (r.querySelector(".dialog")?.classList.contains("open") !== true) r.querySelector(".bubble").click(); });
  await p.waitForTimeout(200);
  await ev(p, (r) => r.querySelector("#fillBtn").click());
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(250);
    if (await ev(p, (r) => !r.querySelector("#fillBtn").classList.contains("loading") && !!r.querySelector("#status").textContent)) break;
  }
  return ev(p, (r) => r.querySelector("#status").textContent.trim());
}

const page = await ctx.newPage();
await page.goto(URL);
await page.waitForSelector("#__aiff_host", { state: "attached" });
await page.waitForTimeout(400);

// 1) AI answers badly, the page rejects, the correction round fixes it
const s1 = await fill(page);
const v1 = await state(page);
console.log("status:", s1);
console.log("values:", JSON.stringify(Object.fromEntries(Object.entries(v1).map(([k, x]) => [k, x.v]))));
const retryPrompt = prompts.find((x) => /REJECTED/.test(x)) || "";
const retried = JSON.parse(retryPrompt.split("Fields (JSON):\n")[1]?.split("\n\nRespond")[0] || "[]");
console.log("sent back for correction:", retried.map((f) => `${f.label} (${f.error})`).join(" | "));
const firstPrompt = prompts[0];
const ok1 = Object.values(v1).every((x) => x.ok) && v1.age.v === "30" && v1.ref.v === "VN123" && /^[A-Z]{3}-\d{4}$/.test(v1.code.v) &&
  /fixed 3/.test(s1) && !/still invalid/.test(s1) && /Locale: vi-VN/.test(firstPrompt) && /"pattern": "\[A-Z\]\{3\}-\\\\d\{4\}"/.test(firstPrompt) &&
  retried.some((f) => f.label === "Mã giới thiệu" && /VN \+ 3/.test(f.error)) && retried.some((f) => f.label === "Email") && !retried.some((f) => f.label === "Tuổi");
console.log("correction round:", ok1 ? "ok" : "FAILED");

// 2) Undo brings back the empty form, not the first (rejected) values
await ev(page, (r) => { r.querySelector(".bubble").click(); });
await page.waitForTimeout(200);
await ev(page, (r) => r.querySelector("#undoBtn").click());
await page.waitForTimeout(800);
const v2 = await state(page);
const ok2 = Object.values(v2).every((x) => x.v === "");
console.log("undo restores originals:", ok2, JSON.stringify(Object.fromEntries(Object.entries(v2).map(([k, x]) => [k, x.v]))));

// 3) daily quota hit: fill anyway with offline data, and say so
mode = "quota";
const before = prompts.length;
await page.reload();
await page.waitForSelector("#__aiff_host", { state: "attached" });
await page.waitForTimeout(400);
const s3 = await fill(page);
const v3 = await state(page);
console.log("status:", s3);
console.log("values:", JSON.stringify(Object.fromEntries(Object.entries(v3).map(([k, x]) => [k, x.v]))));
console.log("requests spent while out of quota:", prompts.length - before);
const ok3 = prompts.length - before === 1 && /with offline data/.test(s3) && /Daily free-model limit/.test(s3) && v3.name.v.split(" ").length >= 2 &&
  v3.email.ok && v3.code.ok && v3.age.ok && +v3.age.v >= 18;
console.log("offline fallback:", ok3 ? "ok" : "FAILED");

const ok = ok1 && ok2 && ok3;
console.log("\nRESULT:", ok ? "✅ PASS" : "❌ FAIL");
await ctx.close();
process.exit(ok ? 0 : 1);
