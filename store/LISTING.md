# Chrome Web Store submission

Everything the Developer Dashboard asks for, ready to paste. Build the upload with `./build.sh`.

---

## Store listing

**Name** — `AI Form Filler`
(The store rejects duplicate names. Search it first; if taken, `AI Form Filler — QA` or similar.)

**Summary** (132 char max)

```
Fills every field on the page with realistic test data using free AI models via your own OpenRouter key.
```

**Description**

```
AI Form Filler puts a small button on any page. Press it, and every field in the form is
filled with realistic, coherent test data — names that match emails, dates in the right
format, dropdowns set to real options.

It is built for the forms that are tedious to test: shadcn and Radix selects, date pickers,
comboboxes whose options load asynchronously, checkboxes, radios and textareas — not just
plain inputs.

FEATURES
• One-click fill, with an optional Preview step to review and edit each value before applying
• A per-field ✨ button to regenerate a single value
• Saved instructions, e.g. "fill as a 30-year-old engineer from Vietnam", with one as default
• Undo the last fill
• Per-site toggle, draggable button, keyboard shortcut

MODELS
Runs on OpenRouter's free models. Paste your own free API key from openrouter.ai/keys into
Settings, pick a model, and you are done — or enter any OpenRouter model id, paid ones included.

PRIVACY
The extension sends a description of each field — its label, name, placeholder, type, format
rules (pattern, min/max, length), and for a dropdown the list of choices — plus a made-up person
to fill as. If the page rejects a value, the page's error message for that field is sent so the
model can correct it. Values already in the fields are never
sent. Password and file inputs are skipped entirely. There is no analytics and no server of
our own: one request per fill (two when a correction is needed), straight to OpenRouter. If OpenRouter
can't answer, the form is filled from locally generated data and nothing is sent.

Please note: dropdown options are read from the page, and providers behind OpenRouter's free
models may log prompts and use them to improve their models. Treat the free tier as public — use it on scratch and staging
forms, not on pages holding confidential data. The full policy is linked below and is also
inside the extension under Settings → Privacy.
```

**Category** — Developer Tools
**Language** — English

---

## Assets to produce

| Asset | Spec | Status |
|---|---|---|
| Store icon | 128×128 PNG | ✅ `icons/icon128.png` |
| Screenshots | 1280×800 or 640×400, 1–5 | ⬜ capture the Fill panel, the Preview list, Settings |
| Small promo tile | 440×280 | ⬜ optional but improves placement |
| Marquee tile | 1400×560 | ⬜ optional |

---

## Privacy tab — answers

**Single purpose**

```
Fill the form on the page the user is viewing with AI-generated test data.
```

**Permission justifications**

| Field | Paste |
|---|---|
| `scripting` | Reads the page's form fields and writes generated values into them. Runs in the page's main world because component libraries such as Radix only accept events dispatched from the page's own context. |
| `storage` | Persists the user's API key, chosen model and saved instructions between sessions. Stores nothing about the pages visited. |
| `host_permissions` | The extension fills whichever form the user is testing, which cannot be known in advance, so it must be available on any URL. It reads a page only when the user opens the panel and presses Analyze & Fill, or presses the per-field button. |
| Remote code | Not used. All code ships in the package; the extension only exchanges JSON with the AI provider's API. |

**Data usage — tick these**

- ☑ **Website content** — field labels, names, placeholders, format rules, dropdown option labels, and
  validation error messages for rejected values are sent
  to the AI provider so it can generate a matching value.
- ☐ Personally identifiable information — not collected by the extension.
- ☐ Health / financial / authentication / personal communications / location / user activity.

> Note when filling this in: the extension does not *collect* anything, but it does *transmit*
> website content to a third party, which is what the "Website content" box asks about. Tick it.
> Then certify: not sold to third parties, used only for the single purpose above, not used for
> creditworthiness or lending.

**Privacy policy URL** — required. Publish `store/privacy-policy.html`, e.g. via GitHub Pages:

```bash
# from the repo root, on a gh-pages branch or /docs folder
cp store/privacy-policy.html docs/index.html
# → https://<user>.github.io/<repo>/
```

---

## Before you submit

- [ ] `./build.sh` and upload `dist/ai-form-filler-<version>.zip`
- [ ] Bump `version` in `manifest.json` — the store refuses a version already uploaded
- [ ] Privacy policy is live at a public URL and pasted into the dashboard
- [ ] Screenshots captured
- [ ] Developer account registered (one-time US$5 fee)
- [ ] Decide **Public** vs **Unlisted** — unlisted still passes review but is reachable only by link

## After it is live

OpenRouter's `:free` catalogue changes: models get withdrawn, rate-limited, or restricted to
agent harnesses. When the default (`nvidia/nemotron-3-super-120b-a12b:free`) disappears, users
on it see an error until they pick another model or a new version ships. Check
`https://openrouter.ai/api/v1/models` for the `:free` ids before each release; the **Custom…**
model entry lets users switch without waiting for an update.
