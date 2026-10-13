// Records docs/demo.mp4 + docs/demo.gif: the real extension filling test/forms/demo.html.
// The AI answer is canned (labels → values) so the clip is reproducible and costs no quota.
//   node record-demo.mjs   (needs the static server on :5199, e.g. `python3 -m http.server 5199` in test/)
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, readdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT = join(__dirname, ".."), DOCS = join(EXT, "docs");
const W = 1280, H = 800;
const vidDir = mkdtempSync(join(tmpdir(), "aiff-vid-"));

const ctx = await chromium.launchPersistentContext("", {
  channel: "chromium", headless: true, viewport: { width: W, height: H }, deviceScaleFactor: 1,
  recordVideo: { dir: vidDir, size: { width: W, height: H } },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
await sw.evaluate(() => chrome.storage.sync.set({ apiKey: "sk-or-demo", review: true, locale: "auto", inlineIcons: true }));

const ANSWERS = [
  [/họ và tên/i, "Trần Minh Khoa"], [/email/i, "khoa.tran@example.com"], [/điện thoại/i, "0905 284 617"],
  [/ngày sinh/i, "1998-04-12"], [/giới tính|gender/i, "Nam"], [/thành phố/i, "Đà Nẵng"],
  [/công ty/i, "Công ty CP Công nghệ Sông Hàn"], [/mã nhân viên/i, "DNG-2817"],
  [/giới thiệu/i, "Kỹ sư phần mềm 28 tuổi tại Đà Nẵng, 5 năm làm web với React và Node.js. Thích chạy bộ ven biển Mỹ Khê."],
  [/đồng ý/i, true],
];
let regen = 0;
await ctx.route("https://openrouter.ai/**", async (route) => {
  const prompt = route.request().postDataJSON().messages[1].content;
  const fields = JSON.parse(prompt.split("Fields (JSON):\n")[1].split("\n\nRespond")[0]);
  const vals = Object.fromEntries(fields.map((f) => [f.id, (ANSWERS.find(([re]) => re.test(f.label || f.name || "")) || [, "—"])[1]]));
  if (fields.length === 1 && /giới thiệu/i.test(fields[0].label)) // the ✨ regenerate at the end
    vals[fields[0].id] = ["Backend developer ở Đà Nẵng, mê tối ưu hiệu năng và viết test. Cuối tuần hay lướt sóng ở Mỹ Khê.",
      "Kỹ sư phần mềm, 28 tuổi, đang làm sản phẩm SaaS cho khách hàng Nhật. Thích cà phê và đọc sách."][regen++ % 2];
  await new Promise((r) => setTimeout(r, 1300)); // the real model takes a moment; show the spinner
  await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(vals) } }] } });
});

// a visible cursor (headless video has none) that follows the real mouse events
await ctx.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: 2147483647, pointerEvents: "none", transform: "translate(-200px,-200px)", transition: "none" });
    const ring = document.createElement("div");
    Object.assign(ring.style, { position: "fixed", width: "34px", height: "34px", marginLeft: "-17px", marginTop: "-17px", borderRadius: "50%",
      background: "rgba(26,115,232,.28)", zIndex: 2147483646, pointerEvents: "none", opacity: "0", left: "0", top: "0" });
    document.documentElement.append(ring, c);
    addEventListener("mousemove", (e) => { c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, true);
    addEventListener("mousedown", (e) => {
      ring.style.left = e.clientX + "px"; ring.style.top = e.clientY + "px";
      ring.animate([{ opacity: 1, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.4)" }], { duration: 450, easing: "ease-out" });
    }, true);
  });
});

const page = await ctx.newPage();
await page.goto("http://localhost:5199/forms/demo.html");
await page.waitForSelector("#__aiff_host", { state: "attached" });
const SR = "document.getElementById('__aiff_host').shadowRoot";
const box = async (sel) => page.evaluate(([sr, sel]) => {
  const el = eval(sr).querySelector(sel); const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, [SR, sel]);
let mx = 640, my = 420;
const moveTo = async (p) => { await page.mouse.move(p.x, p.y, { steps: 28 }); mx = p.x; my = p.y; };
const click = async (p) => { await moveTo(p); await page.waitForTimeout(180); await page.mouse.click(p.x, p.y); };
const wait = (ms) => page.waitForTimeout(ms);
await page.mouse.move(mx, my);
await wait(1200);

// 1) open the bubble
await click(await box(".bubble"));
await wait(900);
// 2) type an instruction
await click(await box("#instruction"));
await page.keyboard.type("kỹ sư phần mềm 28 tuổi ở Đà Nẵng", { delay: 55 });
await wait(600);
// 3) analyze → review
await click(await box("#fillBtn"));
await page.waitForFunction((sr) => !eval(sr).querySelector("#reviewView").hidden, SR, { timeout: 15000 });
await wait(900);
await page.evaluate((sr) => eval(sr).querySelector(".body").scrollTo({ top: 400, behavior: "smooth" }), SR);
await wait(1500);
await page.evaluate((sr) => eval(sr).querySelector(".body").scrollTo({ top: 0, behavior: "smooth" }), SR);
await wait(900);
// 4) apply
await click(await box("#applyBtn"));
await wait(3800); // fill, celebrate, dialog closes itself
// 5) show the filled form, then regenerate one field with the ✨ icon
await moveTo(await page.evaluate(() => { const r = document.querySelector("#bio").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }));
await page.locator("#bio").focus();
await wait(700);
const qa = await box(".qa");
await click(qa);
await wait(2600);
await moveTo({ x: 1150, y: 560 });
await wait(1500);

const video = page.video();
await page.close();
const src = await video.path();
await ctx.close();
const mp4 = join(DOCS, "demo.mp4"), gif = join(DOCS, "demo.gif");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-movflags", "+faststart", mp4]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf",
  "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", gif]);
console.log("→", mp4, "\n→", gif);
