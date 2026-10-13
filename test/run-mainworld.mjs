import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const funcs = readFileSync(join(__dirname, "..", "page-funcs.js"), "utf8");
const PORT = process.env.PORT || "5199";

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => { const t = m.text(); if (!t.includes("React DevTools")) console.log("  [page]", t); });
await page.goto(`http://localhost:${PORT}/test-page.html`);
await page.waitForFunction(() => window.__ready && document.querySelector('[role="combobox"]'), { timeout: 15000 });
// load the page-funcs into the page (defines aiffPageExtract / aiffPageFill globally)
await page.addScriptTag({ content: funcs });

// credentials and file pickers must never reach the model, so they are not even
// extracted — injected here rather than baked into the fixture so the other
// tests' expected field lists stay untouched
await page.evaluate(() => {
  const box = document.createElement("div");
  box.innerHTML = `<label>Account Password<input type="password" id="pw" value="hunter2"></label>
                   <label>Attachment<input type="file" id="fileUp"></label>`;
  document.body.appendChild(box);
});

// 1) EXTRACT (main world = page.evaluate)
const fields = await page.evaluate(() => window.aiffPageExtract());
const leaked = fields.filter((f) => f.type === "password" || f.type === "file" ||
  /password|attachment/i.test(f.label || ""));
console.log("credential/file fields extracted (expect 0):", leaked.length,
  leaked.length ? JSON.stringify(leaked) : "");
console.log("=== EXTRACTED ===");
console.log(JSON.stringify(fields.map((f) => ({ id: f.id, kind: f.kind, label: f.label, opts: f.options })), null, 2));

// 2) build values (simulating the AI) keyed by id
const byLabel = {};
fields.forEach((f) => (byLabel[(f.label || "").replace(/\s*\*/, "").trim().toLowerCase()] = f));
const values = {};
if (byLabel["full name"]) values[byLabel["full name"].id] = "Jane Doe";
if (byLabel["gender"]) values[byLabel["gender"].id] = "Female";
if (byLabel["birth date"]) values[byLabel["birth date"].id] = "2026-03-15";
console.log("\n=== VALUES ===", JSON.stringify(values));

// 3) FILL (main world)
const res = await page.evaluate(([v, f]) => window.aiffPageFill(v, f), [values, fields]);
console.log("\n=== FILL LOG ===");
res.log.forEach((l) => console.log("  " + l));
console.log("filled:", res.filled + "/" + res.total);

await page.waitForTimeout(300);
const observed = await page.evaluate(() => ({
  fullName: document.querySelector("#fullName")?.value,
  gender: document.querySelector('[role="combobox"]')?.innerText.trim(),
  birthDate: document.querySelector('[data-slot="popover-trigger"]')?.innerText.trim(),
}));
console.log("\n=== OBSERVED ===", JSON.stringify(observed, null, 2));
// --- regressions found by surveying 29 real form pages ---

// 1) a second scan must see the same fields. data-aiff-id persists on the node,
//    so filtering on it once made every combobox/date trigger invisible to the
//    next scan (MUI Select lost 20 of 26 fields, ng-material-select 16 of 26).
const rescan = (await page.evaluate(() => window.aiffPageExtract())).length;
console.log("re-scan sees the same field count:", rescan >= fields.length, `(${fields.length} → ${rescan})`);

// 2) readonly controls cannot be typed into by a user either, so they must not
//    reach the model and inflate the count
await page.evaluate(() => {
  const b = document.createElement("div");
  b.innerHTML = `<label>Reference Code<input type="text" id="ro" readonly value="RO-1"></label>`;
  document.body.appendChild(b);
});
const roLeaked = (await page.evaluate(() => window.aiffPageExtract()))
  .some((f) => /reference code/i.test(f.label || ""));
console.log("readonly input kept out of the scan:", !roLeaked);

// 3) scanning clicks real controls; it must never submit the page
const submitted = await page.evaluate(async () => {
  const form = document.createElement("form");
  form.innerHTML = `<input name="q"><button type="submit">Go</button>`;
  let fired = false;
  // bubble-phase: the guard runs in capture and stops propagation, so this
  // listener firing means the submit got through
  form.addEventListener("submit", (e) => { fired = true; e.preventDefault(); });
  document.body.appendChild(form);
  const scan = window.aiffPageExtract();     // start it, don't await yet
  form.requestSubmit();                      // would navigate the page away
  const blockedDuringScan = !fired;
  await scan;
  form.requestSubmit();                      // guard is gone; the page owns its behaviour again
  return { blockedDuringScan, restoredAfter: fired };
});
console.log("scan blocks form submits:", submitted.blockedDuringScan,
            "| page behaviour restored after:", submitted.restoredAfter);

// 4) a birth date is ~430 months back; the old flat 48-step cap could not reach it
const farDate = await page.evaluate(async () => {
  const fs = await window.aiffPageExtract();
  const dp = fs.find((f) => f.kind === "datepicker");
  if (!dp) return "no datepicker";
  await window.aiffPageFill({ [dp.id]: "1990-05-15" }, fs);
  return document.querySelector('[data-slot="popover-trigger"]')?.innerText.trim();
});
console.log("date picker reaches a 1990 birth date:", farDate === "1990-05-15", `(${farDate})`);

// 5) a select's prompt row is not a real choice — offered to the model it gets
//    picked and the field stays blank (selenium web-form: "Open this select menu")
const selOpts = await page.evaluate(async () => {
  const b = document.createElement("div");
  b.innerHTML = `<label>Size<select id="s1"><option selected>Open this select menu</option><option value="1">One</option><option value="2">Two</option></select></label>
    <label>Tier<select id="s2"><option value="">-- Select --</option><option disabled>Legacy</option><option>Gold</option></select></label>
    <label>Selection mode<select id="s3"><option>Select all</option><option>None</option></select></label>`;
  document.body.appendChild(b);
  const fs = await window.aiffPageExtract();
  const o = (l) => fs.find((f) => f.label === l)?.options;
  return { size: o("Size"), tier: o("Tier"), mode: o("Selection mode") };
});
console.log("select prompt rows dropped:", JSON.stringify(selOpts));
const selOk = JSON.stringify(selOpts.size) === '["One","Two"]' && JSON.stringify(selOpts.tier) === '["Gold"]' &&
  JSON.stringify(selOpts.mode) === '["None"]';

// 6) a radio group is ONE field offering each radio's label; filling by label
//    checks that radio, and undo puts the original one back
const radio = await page.evaluate(async () => {
  const b = document.createElement("div");
  b.innerHTML = `<form><fieldset><legend>Delivery</legend>
    <label><input type="radio" name="dlv" value="std" checked> Standard</label>
    <label><input type="radio" name="dlv" value="exp"> Express</label></fieldset></form>`;
  document.body.appendChild(b);
  const fs = await window.aiffPageExtract();
  const g = fs.filter((f) => f.type === "radio" && f.name === "dlv");
  await window.aiffPageFill({ [g[0].id]: "Express" }, fs);
  const afterFill = document.querySelector('input[name="dlv"]:checked').value;
  await window.aiffPageUndo();
  return { count: g.length, label: g[0].label, options: g[0].options, afterFill, afterUndo: document.querySelector('input[name="dlv"]:checked').value };
});
console.log("radio group:", JSON.stringify(radio));
const radioOk = radio.count === 1 && radio.label === "Delivery" && JSON.stringify(radio.options) === '["Standard","Express"]' &&
  radio.afterFill === "exp" && radio.afterUndo === "std";

// 7) site chrome is not the form: a version/language picker in the header was
//    "filled" and navigated ant.design away
const chromeLeak = await page.evaluate(async () => {
  const h = document.createElement("header");
  h.innerHTML = `<label>Docs version <select id="ver"><option>6.x</option><option>5.x</option></select></label>
    <nav><label>Search docs <input id="q"></label></nav>`;
  document.body.prepend(h);
  const fs = await window.aiffPageExtract();
  h.remove();
  // by element, not label: an unlabelled input elsewhere borrows nearby text
  return fs.map((f) => window.__aiffEls.get(f.id)?.id).filter((id) => id === "ver" || id === "q");
});
console.log("header/nav controls kept out of the scan:", chromeLeak.length === 0, JSON.stringify(chromeLeak));

const pwUntouched = await page.evaluate(() => document.querySelector("#pw")?.value);
console.log("password field left alone:", pwUntouched === "hunter2");
const pass = observed.fullName === "Jane Doe" && /female/i.test(observed.gender) &&
  (observed.birthDate || "").includes("2026-03-15") && leaked.length === 0 && pwUntouched === "hunter2" &&
  rescan >= fields.length && !roLeaked && submitted.blockedDuringScan && submitted.restoredAfter && farDate === "1990-05-15" && selOk && radioOk && chromeLeak.length === 0;
console.log("\n=== RESULT:", pass ? "✅ PASS" : "❌ FAIL", "===");
await browser.close();
process.exit(pass ? 0 : 1);
