// Rasterises the extension icon from SVG into ../icons at every size Chrome asks for.
//   cd test && npm run icons
// It lives here rather than in icons/ because Node resolves `playwright` from the
// script's own directory, and that dependency belongs to this folder.
//
// Chrome renders the 16px version on the toolbar, so the mark is designed for
// that size first: one bold silhouette in the extension's own accent blue, no
// hairlines, no text, nothing that turns to mush when it is 16 device pixels.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZES = [16, 32, 48, 128];
const OUT_DIR = join(__dirname, "..", "icons");

// Four-point sparkle with concave sides — the same glyph as the in-page bubble.
// `pull` sets how far the control points sit from centre: lower = pointier.
const sparkle = (cx, cy, r, pull = 0.3) => {
  const k = r * pull;
  return `<path fill="#fff" d="M${cx} ${cy - r}
    C${cx + k * 0.35} ${cy - k} ${cx + k} ${cy - k * 0.35} ${cx + r} ${cy}
    C${cx + k} ${cy + k * 0.35} ${cx + k * 0.35} ${cy + k} ${cx} ${cy + r}
    C${cx - k * 0.35} ${cy + k} ${cx - k} ${cy + k * 0.35} ${cx - r} ${cy}
    C${cx - k} ${cy - k * 0.35} ${cx - k * 0.35} ${cy - k} ${cx} ${cy - r}Z"/>`;
};

// Optical sizing: the same drawing does not work at 16px and at 128px. Pointy
// arms and the companion sparkle read as detail when large and as dirt when
// small, so the toolbar sizes get a single, blunter, bigger star.
const icon = (px) => {
  const small = px <= 32;
  const star = small
    ? sparkle(64, 64, 50, 0.46)
    : sparkle(60, 68, 42, 0.3) + sparkle(99, 30, 17, 0.3);
  return `<svg viewBox="0 0 128 128" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4A93FF"/><stop offset="1" stop-color="#1662CE"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".22"/>
      <stop offset=".55" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="${small ? 26 : 30}" fill="url(#bg)"/>
  <rect width="128" height="128" rx="${small ? 26 : 30}" fill="url(#sheen)"/>
  ${star}
</svg>`;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
await page.setContent(`<body style="margin:0;background:transparent"><div id="i"></div></body>`);
for (const s of SIZES) {
  await page.evaluate(([n, svg]) => {
    const d = document.getElementById("i");
    d.style.width = d.style.height = n + "px";
    d.innerHTML = svg;
  }, [s, icon(s)]);
  await page.locator("#i").screenshot({ path: join(OUT_DIR, `icon${s}.png`), omitBackground: true });
  console.log(`icon${s}.png`);
}
await browser.close();
