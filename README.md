# 🤖 AI Form Filler

A Chrome extension (Manifest V3) that analyzes **every form field on the current page** and fills them with realistic, coherent data using a **free AI model** — no API key and nothing to install on the backend.

It works on plain HTML inputs **and** modern component libraries: shadcn / Radix Selects, react-day-picker date pickers, comboboxes with async-loaded options, checkboxes, radios, and textareas.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue) ![No API key](https://img.shields.io/badge/free-no%20API%20key-22c55e)

---

## ✨ Features

- **One-click fill** — a floating bubble scans the page, asks the AI, and fills everything. An optional **Preview** step lets you review and edit each value before applying.
- **Per-field ✨ icon** — a Grammarly-style button appears on the focused field; click it to generate just that one value.
- **Saved instructions** — store reusable prompts (e.g. *"fill as a 30-year-old engineer from Vietnam"*) and mark one as the ⭐ default that pre-fills on new pages.
- **Robust label detection** — never shows "field 3"; climbs the DOM for the real `<label>` / `aria-label` / placeholder.
- **Undo** the last fill, **per-site toggle**, **draggable bubble**, keyboard shortcut `⌘/Ctrl+Shift+F`.
- **Tabbed UI** — *Fill · Instructions · Settings*.

## 🔌 Providers (Settings tab)

| Provider | Endpoint | Needs |
|---|---|---|
| **DeepSeek** (default) | direct cloud call | nothing — no key, no proxy |
| **OpenRouter** | cloud `:free` models | a free API key from [openrouter.ai/keys](https://openrouter.ai/keys) |

The default **DeepSeek** provider calls a free, keyless endpoint directly from the background service worker — there is no local server to run and no account to create. Use the **Test connection** button in Settings to verify it any time.

## 🚀 Install (load unpacked)

1. Clone or download this repo.
2. Open `chrome://extensions`.
3. Toggle **Developer mode** (top-right).
4. Click **Load unpacked** and select the project folder.
5. Open any page with a form, click the floating bubble (bottom-right), and hit **Analyze & Fill Form**.

> The toolbar icon and `⌘/Ctrl+Shift+F` also toggle the dialog.

## 🧠 How it works

- `inject.js` — content script (top frame, `<all_urls>`). Renders the bubble + a Shadow-DOM dialog so the page's CSS can't leak in or out. Holds all UI, settings, the per-field icon, and the review flow.
- `background.js` — service worker. Calls the AI (avoids page CORS) and orchestrates **extract → AI → fill → celebrate**. The extract/fill steps run in the page's **MAIN world** via `chrome.scripting.executeScript`, because synthetic clicks from the isolated content-script world don't reliably drive Radix widgets — the same clicks from the MAIN world do.
- `page-funcs.js` — self-contained functions injected into the page's MAIN world to scan fields, fill values (React-safe: native value setter + `input`/`change`/`blur` events), and run the success animation.

## 🧪 Tests

A Playwright suite runs against a real Radix + react-day-picker test page:

```bash
cd test
npm install
npm test
```

## 🔒 Privacy

Field labels/placeholders and your instruction are sent to the selected AI provider to generate values. Nothing else is collected or stored remotely; your settings live in `chrome.storage`. Password and file inputs are skipped by design.

## 📄 License

MIT
