// Annotated usage screenshots for the README → docs/usage/*.png.
// The real extension on test/forms/demo.html, with a canned AI answer (no quota, same shots every run).
//   node usage-shots.mjs   (needs the static server on :5199, e.g. `python3 -m http.server 5199` in test/)
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT = join(__dirname, ".."), OUT = join(EXT, "docs", "usage");
mkdirSync(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "aiff-shots-")), {
  channel: "chromium", headless: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
await sw.evaluate(() => chrome.storage.sync.set({
  apiKey: "sk-or-demo", review: true, locale: "auto", inlineIcons: true,
  instrPresets: ["Kỹ sư phần mềm 28 tuổi ở Đà Nẵng", "Fill as a 30-year-old software engineer from Vietnam", "Minimal valid test data only"],
  instrDefault: "Kỹ sư phần mềm 28 tuổi ở Đà Nẵng",
}));

const ANSWERS = [
  [/họ và tên/i, "Trần Minh Khoa"], [/email/i, "khoa.tran@example.com"], [/điện thoại/i, "0905 284 617"],
  [/ngày sinh/i, "1998-04-12"], [/giới tính|gender/i, "Nam"], [/thành phố/i, "Đà Nẵng"],
  [/công ty/i, "Công ty CP Công nghệ Sông Hàn"], [/mã nhân viên/i, "DNG-2817"],
  [/giới thiệu/i, "Kỹ sư phần mềm 28 tuổi tại Đà Nẵng, 5 năm làm web với React và Node.js. Thích chạy bộ ven biển Mỹ Khê."],
  [/đồng ý/i, true],
];
await ctx.route("https://openrouter.ai/**", async (route) => {
  const prompt = route.request().postDataJSON().messages[1].content;
  const fields = JSON.parse(prompt.split("Fields (JSON):\n")[1].split("\n\nRespond")[0]);
  const vals = Object.fromEntries(fields.map((f) => [f.id, (ANSWERS.find(([re]) => re.test(f.label || f.name || "")) || [, "—"])[1]]));
  if (fields.length === 1 && /giới thiệu/i.test(fields[0].label))
    vals[fields[0].id] = "Backend developer ở Đà Nẵng, mê tối ưu hiệu năng và viết test. Cuối tuần hay lướt sóng ở Mỹ Khê.";
  await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(vals) } }] } });
});

const page = await ctx.newPage();
await page.goto("http://localhost:5199/forms/demo.html");
await page.waitForSelector("#__aiff_host", { state: "attached" });
await page.addScriptTag({ content: readFileSync(join(__dirname, "tutorial-mark.js"), "utf8") });
const SR = "document.getElementById('__aiff_host').shadowRoot";
const $ = (sel) => page.evaluateHandle(([sr, sel]) => eval(sr).querySelector(sel) || document.querySelector(sel), [SR, sel]);
const click = async (sel) => { const h = await $(sel); await h.asElement().click(); };
const wait = (ms) => page.waitForTimeout(ms);
// marks: [[selector, badge, label, side]]; the badge sits left or right of the box so it never covers
// the UI, and the shot is cropped to the marks plus `frame` (the dialog or the form).
async function shot(name, marks, frame) {
  const clip = await page.evaluate(([sr, marks, frame]) => {
    const q = (sel) => eval(sr).querySelector(sel) || document.querySelector(sel);
    for (const [sel, n, label, side = "left"] of marks) {
      __mark(q(sel), n, label);
      const [box, b] = [...document.querySelectorAll(".__tut")].slice(-2), r = box.getBoundingClientRect(), w = b.getBoundingClientRect();
      b.style.top = r.top + r.height / 2 - w.height / 2 + "px";
      b.style.left = (side === "left" ? r.left - w.width - 10 : r.right + 10) + "px";
    }
    document.documentElement.append(...document.querySelectorAll(".__tut"));
    const rs = [...document.querySelectorAll(".__tut"), q(frame)].map((e) => e.getBoundingClientRect());
    const x = Math.max(0, Math.min(...rs.map((r) => r.left)) - 24), y = Math.max(0, Math.min(...rs.map((r) => r.top)) - 24);
    return { x, y, width: Math.min(innerWidth, Math.max(...rs.map((r) => r.right)) + 24) - x, height: Math.min(innerHeight, Math.max(...rs.map((r) => r.bottom)) + 24) - y };
  }, [SR, marks, frame]);
  await wait(150);
  await page.screenshot({ path: join(OUT, name + ".png"), clip });
  await page.evaluate(() => __clear());
}

// 1) the bubble on a page
await wait(800);
await shot("1-bubble", [[".bubble", "Bước 1", "Bấm bong bóng"]], "form");
// 2) Fill tab: instruction, preview toggle, button
await click(".bubble"); await wait(700);
await shot("2-fill", [["#instruction", "Bước 2", "Mô tả người cần điền (tuỳ chọn)"], ["label:has(#reviewToggle), .row:has(#reviewToggle), div:has(> #reviewToggle)", "Bước 3", "Bật xem trước", "right"], ["#fillBtn", "Bước 4", "Analyze & Fill"]], ".dialog");
// 3) review
await click("#fillBtn");
await page.waitForFunction((sr) => !eval(sr).querySelector("#reviewView").hidden, SR, { timeout: 15000 });
await wait(600);
await shot("3-review", [["#reviewList", "Bước 5", "Sửa giá trị nếu cần"], ["#applyBtn", "Bước 6", "Apply"]], ".dialog");
// 4) filled form + per-field ✨
await click("#applyBtn"); await wait(4200);
await page.locator("#bio").focus(); await wait(700);
await shot("4-sparkle", [[".qa", "✨", "Tạo lại riêng field này", "right"]], "form");
// 5) undo
await click(".bubble"); await wait(700);
await shot("5-undo", [["#undoBtn", "↩", "Hoàn tác lần điền vừa rồi"]], ".dialog");
// 6) saved instructions
await click("#tabInstr"); await wait(500);
await shot("6-instructions", [["#newInstr", "1", "Viết rồi bấm Save"], ["#instrList .istar.on", "2", "★ = mặc định cho trang mới"], ["#instrList .irow:nth-child(2) .itext", "3", "Bấm để dùng", "right"]], ".dialog");
await ctx.close();
console.log("→", OUT);
