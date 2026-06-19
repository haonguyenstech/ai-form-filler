// background.js — service worker. Orchestrates extract → AI → fill → celebrate,
// and calls the AI API (avoids page CORS issues).

// pull in aiffPageExtract / aiffPageFill / aiffCelebrate as worker globals so
// we can pass them to chrome.scripting.executeScript({ world: "MAIN", func }).
importScripts("page-funcs.js");

const ENDPOINTS = {
  deepseek: "https://opencode.ai/zen/v1/chat/completions", // free DeepSeek — no key, no proxy
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};
const DEEPSEEK_MODEL = "deepseek-v4-flash-free"; // free model id for the direct (no-proxy) path

function buildPrompt(fields, instruction) {
  const slim = fields.map((f) => ({
    id: f.id,
    type: f.type,
    label: f.label,
    name: f.name,
    placeholder: f.placeholder,
    required: f.required,
    maxLength: f.maxLength,
    options: f.options ? f.options.map((o) => o.value || o.text) : undefined,
  }));

  return `You are filling out a web form with realistic, coherent, plausible test data.
${instruction ? "User instruction: " + instruction + "\n" : ""}
For each field below, produce an appropriate value:
- text/email/tel/url/number/date/textarea: a realistic value matching the field's meaning (use the label, name and placeholder as hints). Respect maxLength.
- date / datepicker fields: ALWAYS use strict YYYY-MM-DD format. time: HH:MM.
- checkbox: return true or false.
- radio: return the exact value/option to select.
- select: return one of the listed options (exactly).
- Keep all data for one person consistent (same name, matching email, etc.).

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

async function callAI({ provider, apiKey, model, fields, instruction }) {
  provider = provider || "deepseek";
  const endpoint = ENDPOINTS[provider];
  if (!endpoint) throw new Error("Unknown provider: " + provider);

  const headers = { "Content-Type": "application/json" };
  const body = {
    model: provider === "deepseek" ? DEEPSEEK_MODEL : model,
    messages: [
      { role: "system", content: "You output only valid JSON. You generate realistic fake form data for testing." },
      { role: "user", content: buildPrompt(fields, instruction) },
    ],
    temperature: 0.7,
  };
  if (provider === "deepseek") {
    headers.Authorization = "Bearer ";      // free Zen backend — empty bearer, no key needed
    body.thinking = { type: "disabled" };   // skip reasoning tokens; return JSON directly
  } else if (provider === "openrouter") {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["HTTP-Referer"] = "https://github.com/ai-form-filler";
    headers["X-Title"] = "AI Form Filler";
  }

  let res;
  try {
    res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    if (provider === "deepseek") {
      throw new Error("Can't reach the free DeepSeek service. Check your internet connection and try again.");
    }
    throw e;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from model");
  return parseJSON(content);
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

  const values = await callAI({
    provider: opts.provider,
    apiKey: opts.apiKey,
    model: opts.model,
    fields,
    instruction: opts.instruction,
  });

  const [fillRes] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: aiffPageFill,
    args: [values, fields],
  });
  const fill = fillRes?.result || { filled: 0 };

  if (fill.filled > 0) {
    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: aiffCelebrate,
      args: [fill.filled],
    });
  }
  return { filled: fill.filled, total: fields.length };
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

  const values = await callAI({
    provider: opts.provider, apiKey: opts.apiKey, model: opts.model,
    fields, instruction: opts.instruction,
  });
  return { fields, values };
}

// Apply reviewed values (already extracted; element refs persist in MAIN world).
async function runApply(tabId, values, fields) {
  const [fillRes] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: aiffPageFill,
    args: [values, fields],
  });
  const fill = fillRes?.result || { filled: 0 };
  if (fill.filled > 0) {
    chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: aiffCelebrate, args: [fill.filled] });
  }
  return { filled: fill.filled, total: fields.length, canUndo: fill.canUndo };
}

// Quick connectivity/auth check — lightweight ping, no form prompt.
async function testConnection({ provider, apiKey, model }) {
  provider = provider || "deepseek";
  const endpoint = ENDPOINTS[provider];
  if (!endpoint) throw new Error("Unknown provider.");
  const headers = { "Content-Type": "application/json" };
  const body = {
    model: provider === "deepseek" ? DEEPSEEK_MODEL : model,
    messages: [{ role: "user", content: "Reply with just: ok" }],
    max_tokens: 5,
  };
  if (provider === "deepseek") {
    headers.Authorization = "Bearer ";
    body.thinking = { type: "disabled" };
  } else if (provider === "openrouter") {
    if (!apiKey) throw new Error("Add your API key first.");
    headers.Authorization = `Bearer ${apiKey}`;
    headers["HTTP-Referer"] = "https://github.com/ai-form-filler";
    headers["X-Title"] = "AI Form Filler";
  }
  if (!body.model) throw new Error("Pick or enter a model first.");

  let res;
  try {
    res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    if (provider === "deepseek") throw new Error("Can't reach the free DeepSeek service. Check your internet connection.");
    throw new Error("Network error — check your connection.");
  }

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403) throw new Error("Invalid or expired API key.");
    if (res.status === 404) throw new Error("Model not found — check the model id.");
    if (res.status === 429) throw new Error("Rate limited — try again in a moment.");
    throw new Error(`Connection failed (${res.status}): ${body.slice(0, 120)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (content == null) throw new Error("Connected, but the model returned no reply.");
  return { model: body.model };
}

// Regenerate a single field's value.
async function regenerateField(opts) {
  const v = await callAI({
    provider: opts.provider, apiKey: opts.apiKey, model: opts.model,
    fields: [opts.field], instruction: opts.instruction,
  });
  return v?.[opts.field.id];
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
    runApply(tabId, msg.values || {}, msg.fields || [])
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
    regenerateField(msg.opts || {})
      .then((value) => sendResponse({ ok: true, value }))
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
