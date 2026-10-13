// Survey: load the real extension, drive its UI on many form pages, answer the AI
// call with deterministic values built from the request's own field list (so the
// numbers measure this code, not the model).
//   node survey.mjs                 # every page
//   node survey.mjs dialog          # only entries whose name contains "dialog"
//   node survey.mjs local           # only the local dialog pages (part of npm test)
// Local pages (test/dialogs/*.html) need the static server: run-all.mjs starts one,
// or `python3 -m http.server 5199` from test/.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT = join(__dirname, "..");
const PORT = process.env.PORT || "5199";
const L = (p) => `http://localhost:${PORT}/dialogs/${p}`;

// open: CSS selector or visible text of the button that opens the page's dialog
const PAGES = [
  { name: "dialog: native <dialog>", url: L("native.html"), open: "#open" },
  { name: "dialog: Bootstrap modal", url: L("bootstrap.html"), open: "#open" },
  { name: "dialog: Radix + Select", url: L("radix.html"), open: "#open" },
  { name: "dialog: MUI Dialog", url: L("mui.html"), open: "#open" },
  { name: "dialog: Headless UI", url: L("headless.html"), open: "#open" },
  { name: "dialog: Ant Design Modal", url: L("antd.html"), open: "#open" },
  { name: "dialog: mui.com form dialog", url: "https://mui.com/material-ui/react-dialog/", open: "text=Open form dialog" },
  { name: "dialog: shadcn dialog", url: "https://ui.shadcn.com/docs/components/dialog", open: "text=Open Dialog" },
  { name: "dialog: Bootstrap docs modal", url: "https://getbootstrap.com/docs/5.3/components/modal/", open: "text=Open modal for @mdo" },
  { name: "dialog: Mantine modal", url: "https://mantine.dev/core/modal/", open: "text=Open modal" },
  { name: "page: selenium web-form", url: "https://www.selenium.dev/selenium/web/web-form.html" },
  { name: "page: demoqa practice form", url: "https://demoqa.com/automation-practice-form" },
  { name: "page: httpbin forms", url: "https://httpbin.org/forms/post" },
  { name: "page: formy", url: "https://formy-project.herokuapp.com/form" },
  { name: "page: testautomationpractice", url: "https://testautomationpractice.blogspot.com/" },
  { name: "page: expandtesting inputs", url: "https://practice.expandtesting.com/inputs" },
  { name: "page: Bootstrap forms docs", url: "https://getbootstrap.com/docs/5.3/forms/overview/" },
  { name: "page: MUI text field", url: "https://mui.com/material-ui/react-text-field/" },
  { name: "page: MUI select", url: "https://mui.com/material-ui/react-select/" },
  { name: "page: Ant Design form", url: "https://ant.design/components/form/" },
  { name: "page: Element Plus form", url: "https://element-plus.org/en-US/component/form.html" },
  { name: "page: Vuetify forms", url: "https://vuetifyjs.com/en/components/forms/" },
  { name: "page: Mantine text input", url: "https://mantine.dev/core/text-input/" },
  { name: "page: Angular Material input", url: "https://material.angular.dev/components/input/overview" },
  { name: "page: Chakra input", url: "https://chakra-ui.com/docs/components/input" },
  { name: "page: shadcn react-hook-form", url: "https://ui.shadcn.com/docs/forms/react-hook-form" },
];

const valueFor = (f) => {
  if (f.options && f.options.length) return f.options[f.options.length > 1 ? 1 : 0];
  const t = (f.type || "").toLowerCase(), l = `${f.label} ${f.name} ${f.placeholder}`.toLowerCase();
  if (t === "checkbox") return true;
  if (t === "radio") return f.label || "on";
  if (t === "email" || /e-?mail/.test(l)) return "jane.doe@example.com";
  if (t === "date" || /date|birth|dob/.test(l)) return "1990-05-15";
  if (t === "number" || t === "range" || /age|number|qty|quantity/.test(l)) return "42";
  if (t === "tel" || /phone|mobile/.test(l)) return "0901234567";
  if (t === "url" || /website|url/.test(l)) return "https://example.com";
  if (t === "color") return "#336699";
  if (t === "time") return "09:30";
  if (t === "month") return "1990-05";
  if (t === "week") return "1990-W20";
  if (t === "textarea") return "Hello from AI Form Filler";
  return "Jane Doe";
};

const filter = process.argv[2];
const pages = PAGES.filter((p) => !filter || (filter === "local" ? p.url.includes("localhost") : p.name.includes(filter)));
const ctx = await chromium.launchPersistentContext("", {
  channel: "chromium", headless: true, viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
// ORKEY=<key> runs against the real model instead of the deterministic answers
await sw.evaluate((k) => chrome.storage.sync.set({ apiKey: k || "sk-or-test", review: false }), process.env.ORKEY || "");
let lastFields = [];
if (!process.env.ORKEY) await ctx.route("https://openrouter.ai/**", async (route) => {
  const prompt = route.request().postDataJSON().messages[1].content;
  const fields = JSON.parse(prompt.split("Fields (JSON):\n")[1].split("\n\nRespond")[0]);
  if (!/REJECTED/.test(prompt)) lastFields = fields; // a correction round is not the page's field count
  const vals = Object.fromEntries(fields.map((f) => [f.id, valueFor(f)]));
  await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(vals) } }] } });
});

// visible modal-ish containers: native <dialog open>, aria dialogs, Bootstrap .modal.show
// (a local test page reports its own state through window.__isOpen; a wrapper with
// role=dialog can be 0px tall while its fixed panel is what shows, so measure both)
const dialogsOpen = () => {
  if (typeof window.__isOpen === "function") return window.__isOpen() ? 1 : 0;
  const shown = (d) => { const r = d.getBoundingClientRect(), s = getComputedStyle(d); return r.width > 50 && r.height > 50 && s.visibility !== "hidden" && s.display !== "none"; };
  return [...document.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"],.modal.show')]
    .filter((d) => shown(d) || [...d.children].some(shown)).length;
};
// value snapshot of every form control, keyed by position, flagged inside/outside a dialog
const snap = () => [...document.querySelectorAll("input,textarea,select,[role=combobox],.ant-picker input")].map((e) => ({
  inDlg: !!e.closest('dialog,[role="dialog"],.modal,.ant-modal'),
  v: e.type === "checkbox" || e.type === "radio" ? String(e.checked) : (e.value ?? e.innerText ?? "").slice(0, 40),
}));

const rows = [];
for (const p of pages) {
  const page = await ctx.newPage();
  if (process.env.TRACE) {
    const t0 = Date.now();
    page.on("framenavigated", (f) => f === page.mainFrame() && console.log(`  [nav +${Date.now() - t0}ms] ${f.url()}`));
    page.on("console", (m) => /aiff|stage/i.test(m.text()) && console.log("  [console]", m.text()));
  }
  const row = { name: p.name, status: "", fields: 0, dialog: "", changedIn: 0, changedOut: 0 };
  try {
    await page.goto(p.url, { waitUntil: "load", timeout: 45000 });
    await page.waitForTimeout(p.url.includes("localhost") ? 2500 : 3500);
    await page.waitForSelector("#__aiff_host", { state: "attached", timeout: 10000 });
    if (p.open) {
      await page.locator(p.open).first().click({ timeout: 10000 });
      await page.waitForTimeout(900);
      if (!(await page.evaluate(dialogsOpen))) throw new Error("page dialog did not open");
    }
    const before = await page.evaluate(snap);
    const sr = "document.getElementById('__aiff_host').shadowRoot";
    const ev = (js) => page.evaluate(new Function("sr", `const r=eval(sr);${js}`), sr);
    // drive the UI with real pointer input, the way a user would
    const bubble = await page.evaluateHandle((s) => eval(s).querySelector(".bubble"), sr);
    await bubble.asElement().click();
    await page.waitForTimeout(400);
    const fill = await page.evaluateHandle((s) => eval(s).querySelector("#fillBtn"), sr);
    lastFields = [];
    if (process.env.TRACE) console.log("  [stage] clicking fill");
    await fill.asElement().click();
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(500);
      const busy = await ev("return r.querySelector('#fillBtn').classList.contains('loading')");
      row.status = (await ev("return r.querySelector('#status').textContent")).trim();
      if (!busy && row.status) break;
    }
    await page.waitForTimeout(2200); // the extension's own dialog auto-closes after a fill
    row.fields = lastFields.length;
    if (p.open) row.dialog = (await page.evaluate(dialogsOpen)) ? "open" : "CLOSED";
    const after = await page.evaluate(snap);
    after.forEach((a, i) => { if (before[i] && before[i].v !== a.v) a.inDlg ? row.changedIn++ : row.changedOut++; });
    if (p.open) await page.screenshot({ path: `/tmp/survey-${p.name.replace(/\W+/g, "_")}.png` });
  } catch (e) {
    row.status = "ERROR " + e.message.split("\n")[0].slice(0, 90);
  }
  rows.push(row);
  const flag = p.open ? (row.dialog === "open" && row.changedOut === 0 ? "✅" : "❌") : (/^Filled/.test(row.status) ? "✅" : "❌");
  console.log(`${flag} ${row.name.padEnd(32)} | ${row.status.slice(0, 70).padEnd(70)} | fields ${String(row.fields).padStart(3)}` +
    (p.open ? ` | dialog ${row.dialog.padEnd(6)} | changed in ${row.changedIn} / behind ${row.changedOut}` : ""));
  await page.close();
}
await ctx.close();
const bad = rows.filter((r, i) => (pages[i].open ? !(r.dialog === "open" && r.changedOut === 0) : !/^Filled/.test(r.status)));
console.log(`\n${rows.length - bad.length}/${rows.length} pages OK`);
process.exit(bad.length ? 1 : 0);
