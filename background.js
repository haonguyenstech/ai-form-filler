// background.js — service worker. Orchestrates extract → AI → fill → celebrate,
// and calls the AI API (avoids page CORS issues).

// pull in aiffPageExtract / aiffPageFill / aiffCelebrate as worker globals so
// we can pass them to chrome.scripting.executeScript({ world: "MAIN", func }).
importScripts("page-funcs.js", "offline.js");

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OR_HEADERS = { "HTTP-Referer": "https://github.com/ai-form-filler", "X-Title": "AI Form Filler" };

function buildPrompt(fields, instruction, ctx = {}) {
  const slim = fields.map((f) => ({
    id: f.id,
    type: f.type,
    label: f.label,
    name: f.name,
    placeholder: f.placeholder,
    required: f.required,
    maxLength: f.maxLength,
    minLength: f.minLength,
    pattern: f.pattern,
    min: f.min,
    max: f.max,
    step: f.step,
    // a correction round: what the page rejected, and why
    rejectedValue: f.rejected ? f.rejected.value : undefined,
    error: f.rejected ? f.rejected.message : undefined,
    // page-funcs reports options as plain strings; .value/.text on a string is
    // undefined, which sent every select to the model as [null, null, …]
    options: f.options ? f.options.map((o) => (typeof o === "string" ? o : o.value || o.text)) : undefined,
  }));

  return `You are filling out a web form with realistic, coherent, plausible test data.
${instruction ? "User instruction: " + instruction + "\n" : ""}
For each field below, produce an appropriate value:
- text/email/tel/url/number/date/textarea: a realistic value matching the field's meaning (use the label, name and placeholder as hints). Respect maxLength.
- date / datepicker fields: ALWAYS use strict YYYY-MM-DD format. time: HH:MM.
- checkbox: return true or false.
- radio: return one of the listed options (exactly).
- select: return one of the listed options (exactly).
- pattern: the value MUST fully match this regular expression (an HTML pattern attribute, implicitly anchored).
- min / max / step / minLength / maxLength: stay within them.
- Keep all data for one person consistent (same name, matching email, etc.).
${ctx.retry ? "- These fields were filled before and the page REJECTED the value. Each has the rejected value and the page's error message: return a different value that fixes the error.\n" : ""}${ctx.locale ? `\nLocale: ${ctx.locale}. Use names, addresses, phone and postal-code formats, and free-text wording typical for this locale${instruction ? " unless the user instruction says otherwise" : ""}.\n` : ""}${ctx.persona ? `\nUse this person for every personal field (name, email, phone, address, birth date, company…) so the whole form describes one consistent person${instruction ? "; if the user instruction contradicts it, the instruction wins" : ""}:\n${JSON.stringify(personaForPrompt(ctx.persona))}\n` : ""}
Fields (JSON):
${JSON.stringify(slim, null, 2)}

Respond with ONLY a JSON object mapping each field "id" to its value. No markdown, no explanation.
Example: {"0":"Jane Doe","1":"jane.doe@example.com","2":true}`;
}

function parseJSON(text) {
  // strip code fences if present
  let t = text.trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  // grab the outermost {...}
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

// Turn an OpenRouter error response into something a user can act on. Two
// different 429s used to share "try again in a moment": the per-day cap on free
// models (50/day without credits) does not lift for hours.
function apiError(res, body) {
  let msg = "";
  try { msg = JSON.parse(body)?.error?.message || ""; } catch (e) {}
  if (res.status === 429 && /per-day/i.test(msg)) {
    const reset = Number(res.headers.get("x-ratelimit-reset")) ||
      Number((body.match(/"X-RateLimit-Reset":"(\d+)"/) || [])[1]);
    const at = reset ? " Resets at " + new Date(reset).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) + "." : "";
    return new Error("Daily free-model limit reached on this OpenRouter key." + at +
      " Adding 10 credits raises it to 1000 requests/day.");
  }
  if (res.status === 429) return new Error("This model is busy upstream — try again shortly or pick another model.");
  if (res.status === 401) return new Error("Invalid or expired API key.");
  if (res.status === 403) return new Error(msg || "Invalid or expired API key.");
  // free endpoints are off in the account's privacy settings: a new account's first
  // free-model call often lands here, and "model not found" sent people the wrong way
  if (/data policy|privacy/i.test(msg))
    return new Error("Your OpenRouter privacy settings block free models. Turn them on at openrouter.ai/settings/privacy, then try again.");
  if (res.status === 404) return new Error("Model not found — check the model id.");
  return new Error(`API ${res.status}: ${(msg || body).slice(0, 200)}`);
}

async function callAI({ apiKey, model, fields, instruction, persona, locale, retry }) {
  if (!apiKey) throw new Error("Add your OpenRouter API key in Settings.");
  if (!model) throw new Error("Pick or enter a model in Settings.");

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...OR_HEADERS };
  const body = {
    model,
    messages: [
      { role: "system", content: "You output only valid JSON. You generate realistic fake form data for testing." },
      { role: "user", content: buildPrompt(fields, instruction, { persona, locale, retry }) },
    ],
    temperature: 0.7,
  };

  let res;
  try {
    res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    throw transient(new Error("Can't reach OpenRouter. Check your internet connection and try again."));
  }

  if (!res.ok) {
    const err = apiError(res, await res.text());
    if (res.status === 429 || res.status >= 500) transient(err);
    throw err;
  }

  let data;
  try { data = await res.json(); } catch (e) { throw transient(new Error("The model sent an unreadable response.")); }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw transient(new Error("Empty response from model"));
  try { return parseJSON(content); } catch (e) { throw transient(new Error("The model's answer wasn't valid JSON.")); }
}

// Errors that mean "the AI is unavailable right now" (quota, busy, network, a
// garbled answer) — the fill goes ahead with offline data. Errors the user has
// to fix (no key, bad key, wrong model id) still stop the fill.
function transient(err) { err.transient = true; return err; }

// One persona per tab, made by the latest fill/preview, reused by the
// correction round and the ✨ / ⟳ single-field calls on that page.
const personas = new Map();
function personaFor(tabId, opts, fresh) {
  const locale = resolveLocale(opts.locale, opts.pageLang, globalThis.navigator?.language);
  let p = personas.get(tabId);
  if (fresh || !p || p.locale !== locale) { p = makePersona(locale); personas.set(tabId, p); }
  return p;
}
if (globalThis.chrome?.tabs?.onRemoved) chrome.tabs.onRemoved.addListener((id) => personas.delete(id));

// AI values when the AI answers, offline values when it can't. Either way every
// value is brought inside its field's declared constraints. `offline` carries
// the reason the AI was skipped, for the status line.
async function getValues(opts, fields, persona, retry) {
  let values, offline = "";
  try {
    // the first call of this fill already found the AI down — don't spend another request
    if (opts.aiDown) throw transient(new Error(opts.aiDown));
    values = await callAI({ apiKey: opts.apiKey, model: opts.model, fields, instruction: opts.instruction, persona, locale: persona.locale, retry });
  } catch (e) {
    if (!e.transient) throw e;
    offline = e.message;
    values = offlineValues(fields, persona, Date.now() & 0x7fffffff);
  }
  const byId = Object.fromEntries(fields.map((f) => [String(f.id), f]));
  for (const id of Object.keys(values || {})) if (byId[id]) values[id] = conformValue(byId[id], values[id], null);
  return { values: values || {}, offline };
}

// Fill, then ask the page which values it rejected and fix those: one more AI
// round with the page's own error messages, then (for fields with a pattern)
// a value generated from the pattern itself. Returns the merged result.
async function fillAndCheck(tabId, opts, fields, values, persona) {
  const exec = (func, args) => chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args }).then(([r]) => r?.result);
  const fill = (await exec(aiffPageFill, [values, fields])) || { filled: 0, filledIds: [] };
  const byId = Object.fromEntries(fields.map((f) => [String(f.id), f]));
  let fixed = 0, offline = "";
  let bad = (await exec(aiffPageCheck, [(fill.filledIds || []).filter((id) => !byId[id]?.preInvalid)])) || [];
  if (bad.length) {
    const retryFields = bad.filter((b) => byId[b.id]).map((b) => ({ ...byId[b.id], rejected: { value: b.value, message: b.message } }));
    let fix = {};
    try { ({ values: fix, offline } = await getValues(opts, retryFields, persona, true)); } catch (e) {}
    if (Object.keys(fix).length) {
      await exec(aiffPageFill, [fix, fields, true]);
      const still = (await exec(aiffPageCheck, [Object.keys(fix)])) || [];
      const stillIds = new Set(still.map((b) => b.id));
      fixed += Object.keys(fix).filter((id) => bad.some((b) => b.id === id) && !stillIds.has(id)).length;
      bad = bad.filter((b) => !fix[b.id] || stillIds.has(b.id));
    }
    // last resort for pattern fields: a string built to match the pattern
    const r = rng(Date.now() & 0x7fffffff);
    const gen = {};
    for (const b of bad) { const f = byId[b.id]; const g = f?.pattern ? sampleRegex(f.pattern, r) : null; if (g !== null) gen[b.id] = g; }
    if (Object.keys(gen).length) {
      await exec(aiffPageFill, [gen, fields, true]);
      const still = new Set(((await exec(aiffPageCheck, [Object.keys(gen)])) || []).map((b) => b.id));
      fixed += Object.keys(gen).filter((id) => !still.has(id)).length;
      bad = bad.filter((b) => !gen[b.id] || still.has(b.id));
    }
  }
  if (fill.filled > 0) exec(aiffCelebrate, [fill.filled]).catch(() => {});
  return { filled: fill.filled, total: fields.length, canUndo: fill.canUndo, fixed, invalid: bad.length, retryOffline: offline };
}

// Full flow run on behalf of the in-page dialog: extract (MAIN world) → AI →
// fill (MAIN world) → celebrate (MAIN world). Returns {filled,total}.
async function runFill(tabId, opts) {
  const [ext] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: aiffPageExtract,
  });
  let fields = ext?.result || [];
  if (!fields.length) throw new Error("No fillable form fields found on this page.");

  if (opts.scope === "required") fields = fields.filter((f) => f.required);
  else if (opts.scope === "optional") fields = fields.filter((f) => !f.required);
  if (!fields.length)
    throw new Error(
      opts.scope === "required"
        ? "No required fields detected on this page."
        : "No optional fields detected on this page."
    );

  const persona = personaFor(tabId, opts, true);
  const { values, offline } = await getValues(opts, fields, persona);
  // aiffPageFill records an undo entry per filled field; forwarding canUndo is
  // what makes the Undo button appear
  const r = await fillAndCheck(tabId, { ...opts, aiDown: offline }, fields, values, persona);
  return { ...r, offline, persona: persona.fullName };
}

// Extract + ask AI, but DON'T fill — return proposed values for review.
async function runPreview(tabId, opts) {
  const [ext] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: aiffPageExtract,
  });
  let fields = ext?.result || [];
  if (!fields.length) throw new Error("No fillable form fields found on this page.");
  if (opts.scope === "required") fields = fields.filter((f) => f.required);
  else if (opts.scope === "optional") fields = fields.filter((f) => !f.required);
  if (!fields.length)
    throw new Error(opts.scope === "required" ? "No required fields detected." : "No optional fields detected.");

  const persona = personaFor(tabId, opts, true);
  const { values, offline } = await getValues(opts, fields, persona);
  return { fields, values, offline, persona: persona.fullName };
}

// Apply reviewed values (already extracted; element refs persist in MAIN world).
async function runApply(tabId, values, fields, opts = {}) {
  return fillAndCheck(tabId, opts, fields, values, personaFor(tabId, opts, false));
}

// Quick connectivity/auth check — lightweight ping, no form prompt.
async function testConnection({ apiKey, model }) {
  if (!apiKey) throw new Error("Add your API key first.");
  if (!model) throw new Error("Pick or enter a model first.");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...OR_HEADERS };
  const body = {
    model,
    messages: [{ role: "user", content: "Reply with just: ok" }],
    // reasoning models spend tokens before any content; a 5-token cap made
    // them stop before emitting anything
    max_tokens: 64,
  };

  let res;
  try {
    res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    throw new Error("Network error — check your connection.");
  }

  if (!res.ok) throw apiError(res, await res.text());

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  // an empty reply from a reasoning-heavy model still proves the route works,
  // so only a malformed response counts as a failure here
  if (!data?.choices?.length) throw new Error("Connected, but the response was malformed.");
  return { model: body.model, terse: content == null };
}

// Regenerate a single field's value.
async function regenerateField(tabId, opts) {
  if (!opts.apiKey) throw new Error("Add your OpenRouter API key in Settings.");
  if (!opts.model) throw new Error("Pick or enter a model in Settings.");
  const persona = personaFor(tabId, opts, false);
  const { values, offline } = await getValues(opts, [opts.field], persona);
  return { value: values?.[opts.field.id], offline };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "generate") {
    callAI(msg.payload || {})
      .then((values) => sendResponse({ ok: true, values }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === "runFill") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "No tab" });
      return true;
    }
    runFill(tabId, msg.opts || {})
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === "runUndo") {
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ ok: false, error: "No tab" }); return true; }
    chrome.scripting
      .executeScript({ target: { tabId }, world: "MAIN", func: aiffPageUndo })
      .then(([r]) => sendResponse({ ok: true, ...(r?.result || { restored: 0, skipped: 0 }) }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === "runPreview") {
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ ok: false, error: "No tab" }); return true; }
    runPreview(tabId, msg.opts || {})
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === "runApply") {
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ ok: false, error: "No tab" }); return true; }
    runApply(tabId, msg.values || {}, msg.fields || [], msg.opts || {})
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === "testConnection") {
    testConnection(msg.opts || {})
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === "runRegenerate") {
    regenerateField(sender.tab?.id ?? -1, msg.opts || {})
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// Clicking the toolbar icon toggles the in-page bubble dialog.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) chrome.tabs.sendMessage(tab.id, { action: "toggleDialog" }).catch(() => {});
});

// Keyboard shortcut (Cmd/Ctrl+Shift+F) toggles the dialog on the active tab.
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd !== "toggle-dialog") return;
  chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => {
    if (t?.id) chrome.tabs.sendMessage(t.id, { action: "toggleDialog" }).catch(() => {});
  });
});
