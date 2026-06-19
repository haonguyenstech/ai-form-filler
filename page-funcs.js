// page-funcs.js — self-contained functions injected into the page's MAIN world
// via chrome.scripting.executeScript. They must NOT reference any outer scope
// (Chrome serializes them with toString). They run in the same JS world as the
// app's React/Radix, which is what makes synthetic clicks actually drive the
// widgets. Element references are stashed on window.__aiffEls between the
// extract and fill calls.

// Celebration overlay injected after a successful fill: a success toast with
// an animated checkmark + a confetti burst. Self-contained and self-removing.
function aiffCelebrate(count) {
  const ID = "__aiff_celebrate";
  const old = document.getElementById(ID);
  if (old) old.remove();

  const wrap = document.createElement("div");
  wrap.id = ID;
  wrap.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden;" +
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif";

  const style = document.createElement("style");
  style.textContent = `
    @keyframes aiffToast{0%{transform:translate(-50%,-24px);opacity:0}
      12%{transform:translate(-50%,0);opacity:1}82%{transform:translate(-50%,0);opacity:1}
      100%{transform:translate(-50%,-16px);opacity:0}}
    @keyframes aiffPop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
    @keyframes aiffDraw{to{stroke-dashoffset:0}}
    @keyframes aiffRing{0%{transform:scale(.6);opacity:.6}100%{transform:scale(2.4);opacity:0}}
    @keyframes aiffFall{0%{transform:translate(0,0) rotate(0);opacity:1}
      100%{transform:translate(var(--dx),var(--dy)) rotate(var(--rot));opacity:0}}
    #${ID} .aiff-toast{position:fixed;top:22px;left:50%;transform:translateX(-50%);
      display:flex;align-items:center;gap:12px;padding:13px 20px 13px 14px;border-radius:14px;
      background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;
      box-shadow:0 12px 34px rgba(99,102,241,.45);animation:aiffToast 2.8s cubic-bezier(.2,.8,.2,1) forwards}
    #${ID} .aiff-check{position:relative;width:34px;height:34px;flex:0 0 auto;
      background:rgba(255,255,255,.18);border-radius:50%;display:grid;place-items:center;animation:aiffPop .5s ease-out both}
    #${ID} .aiff-ring{position:absolute;inset:0;border-radius:50%;border:2px solid #fff;animation:aiffRing .9s ease-out forwards}
    #${ID} .aiff-title{font-weight:700;font-size:14px;letter-spacing:.01em;line-height:1.2}
    #${ID} .aiff-sub{font-size:11.5px;opacity:.85;margin-top:1px}
    #${ID} .aiff-piece{position:fixed;top:60px;width:9px;height:9px;border-radius:2px;
      will-change:transform,opacity;animation:aiffFall var(--dur) cubic-bezier(.15,.6,.4,1) forwards;animation-delay:var(--delay)}
  `;
  wrap.appendChild(style);

  const toast = document.createElement("div");
  toast.className = "aiff-toast";
  toast.innerHTML =
    '<div class="aiff-check"><span class="aiff-ring"></span>' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 12.5l5 5L20 6" style="stroke-dasharray:30;stroke-dashoffset:30;animation:aiffDraw .45s .25s ease-out forwards"/></svg></div>' +
    '<div><div class="aiff-title">Form filled by AI ✨</div>' +
    '<div class="aiff-sub">' + (count || 0) + ' field' + (count === 1 ? "" : "s") + ' completed</div></div>';
  wrap.appendChild(toast);

  // confetti burst from the top-center
  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#22c55e", "#f59e0b", "#06b6d4", "#fff"];
  const N = 70;
  for (let i = 0; i < N; i++) {
    const p = document.createElement("div");
    p.className = "aiff-piece";
    const left = 50 + (Math.random() * 24 - 12);
    const dx = (Math.random() * 2 - 1) * 320 + "px";
    const dy = 240 + Math.random() * 360 + "px";
    const rot = Math.random() * 720 - 360 + "deg";
    p.style.cssText =
      `left:${left}%;background:${colors[i % colors.length]};` +
      `--dx:${dx};--dy:${dy};--rot:${rot};--dur:${(1.4 + Math.random() * 1.1).toFixed(2)}s;` +
      `--delay:${(Math.random() * 0.25).toFixed(2)}s;` +
      (i % 3 === 0 ? "border-radius:50%;" : i % 3 === 1 ? "width:6px;height:12px;" : "");
    wrap.appendChild(p);
  }

  document.documentElement.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3200);
}

function aiffPageExtract() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, t = 900, s = 50) => {
    const end = Date.now() + t;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(s); }
    return null;
  };
  const softClick = (el) => { try { el.scrollIntoView({ block: "center" }); } catch (e) {} el.click(); };
  const findCal = () =>
    document.querySelector('[role="grid"],.rdp,[class*="rdp"],[class*="calendar"],[data-slot="calendar"]');
  const vis = (el) => {
    if (!el || el.disabled) return false;
    if (el.closest('[aria-hidden="true"]') || el.getAttribute("aria-hidden") === "true") return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const isRequired = (el, l) =>
    el.required || el.getAttribute("aria-required") === "true" || (l && /[*﹡＊]/.test(l));
  const clean = (t) => (t || "").replace(/\s+/g, " ").trim();
  const humanize = (s) =>
    clean(String(s || "").replace(/[_\-.]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2"))
      .replace(/\b\w/g, (c) => c.toUpperCase());
  const ok = (t) => t && t.length > 0 && t.length < 70;
  const getLabel = (el) => {
    // 1) explicit <label for=id>
    if (el.id) { const x = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (x && ok(clean(x.innerText))) return clean(x.innerText); }
    // 2) wrapping <label>
    const pl = el.closest("label"); if (pl && ok(clean(pl.innerText))) return clean(pl.innerText);
    // 3) aria-label
    const al = el.getAttribute("aria-label"); if (ok(clean(al))) return clean(al);
    // 4) aria-labelledby (may list several ids)
    const lb = el.getAttribute("aria-labelledby");
    if (lb) {
      const t = lb.split(/\s+/).map((i) => document.getElementById(i)).filter(Boolean)
        .map((n) => clean(n.innerText)).filter(Boolean).join(" ");
      if (ok(t)) return t;
    }
    // 5) climb ancestors; the nearest wrapper that owns a <label>/form-label is the field's group (shadcn FormItem)
    let node = el;
    for (let i = 0; i < 6 && node.parentElement; i++) {
      node = node.parentElement;
      const cand = node.querySelector('label,[data-slot="form-label"],legend');
      if (cand && !cand.contains(el)) { const t = clean(cand.innerText); if (ok(t)) return t; }
    }
    // 6) preceding sibling text (label rendered as a plain element before the control)
    let prev = el.previousElementSibling;
    while (prev) { const t = clean(prev.innerText); if (ok(t)) return t; prev = prev.previousElementSibling; }
    // 7) placeholder / name / id as last resort — never empty
    if (ok(clean(el.placeholder))) return clean(el.placeholder);
    if (el.name) return humanize(el.name);
    if (el.id && !/^[«»:r\d]+$/.test(el.id)) return humanize(el.id);
    return "";
  };

  return (async () => {
    const els = new Map();
    const fields = [];
    let idx = 0;
    const tag = (el) => { const id = String(idx++); el.setAttribute("data-aiff-id", id); els.set(id, el); return id; };

    // 1) native inputs / textareas / selects
    document.querySelectorAll("input, textarea, select").forEach((el) => {
      const type = (el.type || "text").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image", "file"].includes(type)) return;
      if (!vis(el)) return;
      const lbl = getLabel(el);
      const f = {
        id: tag(el), kind: el.tagName.toLowerCase() === "select" ? "select" : "input",
        type, name: el.name || "", placeholder: el.placeholder || "", label: lbl,
        required: !!isRequired(el, lbl), maxLength: el.maxLength > 0 ? el.maxLength : null,
        currentValue: type === "checkbox" || type === "radio" ? el.checked : el.value,
      };
      if (el.tagName.toLowerCase() === "select") f.options = Array.from(el.options).map((o) => o.text || o.value);
      fields.push(f);
    });

    // Open a Radix Select and harvest its options. Options frequently load
    // ASYNC (e.g. departments fetched from an API), so we (a) wait for the
    // first option to appear, (b) keep polling until the count STOPS growing
    // (list finished loading), and (c) retry the whole open once if it came
    // back empty. This fixes selects that previously scanned as options:[].
    const harvest = async (el) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        softClick(el);
        await waitFor(() => document.querySelector('[role="option"]'), 1300);
        let prev = -1, stable = 0;
        for (let i = 0; i < 14; i++) {
          const n = document.querySelectorAll('[role="option"]').length;
          if (n > 0 && n === prev) { if (++stable >= 2) break; } else stable = 0;
          prev = n;
          await sleep(110);
        }
        const opts = [...document.querySelectorAll('[role="option"]')].map((o) => o.innerText.trim()).filter(Boolean);
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        el.blur && el.blur();
        await sleep(80);
        if (opts.length) return opts;
        await sleep(250); // let an async fetch kick in before retrying
      }
      return [];
    };

    // 2) Radix Select triggers — open to harvest options
    const combos = [...document.querySelectorAll('[role="combobox"],[data-slot="select-trigger"],[aria-haspopup="listbox"]')]
      .filter((el) => vis(el) && !el.hasAttribute("data-aiff-id"));
    for (const el of combos) {
      const lbl = getLabel(el);
      const ph = el.querySelector("[data-placeholder]") ? el.querySelector("[data-placeholder]").innerText.trim() : "";
      const f = { id: tag(el), kind: "combobox", type: "select", label: lbl, placeholder: ph, required: !!isRequired(el, lbl), currentValue: el.innerText.trim(), options: [] };
      try { f.options = await harvest(el); } catch (e) {}
      fields.push(f);
    }

    // 3) shadcn date pickers — only in-form popovers that open a calendar
    const pops = [...document.querySelectorAll('[aria-haspopup="dialog"],[data-slot="popover-trigger"]')]
      .filter((el) => vis(el) && !el.hasAttribute("data-aiff-id") && el.closest("form"));
    for (const el of pops) {
      let isDate = false;
      try { softClick(el); isDate = !!(await waitFor(findCal, 700)); } catch (e) {}
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(70);
      if (!isDate) continue;
      const lbl = getLabel(el);
      fields.push({ id: tag(el), kind: "datepicker", type: "date", label: lbl, required: !!isRequired(el, lbl), currentValue: el.innerText.trim() });
    }

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(60);
    window.__aiffEls = els;
    return fields;
  })();
}

function aiffPageFill(values, fieldsMeta) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, t = 1500, s = 50) => {
    const end = Date.now() + t;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(s); }
    return null;
  };
  const softClick = (el) => { if (!el) return; try { el.scrollIntoView({ block: "center" }); } catch (e) {} el.click(); };
  const findCal = () =>
    document.querySelector('[role="grid"],.rdp,[class*="rdp"],[class*="calendar"],[data-slot="calendar"]');
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const bestMatch = (target, cands) => {
    const t = norm(target); if (!t) return null;
    let best = null, bs = 0;
    for (const c of cands) {
      const ct = norm(c.text); if (!ct) continue;
      let sc = ct === t ? 100 : ct.includes(t) || t.includes(ct) ? 60 : 0;
      if (!sc) { const tw = new Set(t.split(" ")); sc = ct.split(" ").filter((w) => tw.has(w)).length * 10; }
      if (sc > bs) { bs = sc; best = c; }
    }
    return bs > 0 ? best : null;
  };
  const toISO = (v) => {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
    const d = new Date(v); if (isNaN(d)) return null;
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const setNativeValue = (el, value) => {
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
    if (d && d.set) d.set.call(el, value); else el.value = value;
  };
  const fire = (el) => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  };
  const flash = (el) => { const o = el.style.outline; el.style.outline = "2px solid #6366f1"; setTimeout(() => (el.style.outline = o), 1200); };

  async function fillCombobox(el, value) {
    softClick(el);
    if (!(await waitFor(() => document.querySelector('[role="option"]'), 1200))) return false;
    const opts = [...document.querySelectorAll('[role="option"]')].map((o) => ({ text: o.innerText.trim(), el: o }));
    const m = bestMatch(value, opts) || opts[0];
    if (!m) { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return false; }
    softClick(m.el); flash(el); await sleep(120); return true;
  }
  async function fillDatePicker(el, value) {
    const iso = toISO(value); if (!iso) return false;
    softClick(el);
    if (!(await waitFor(findCal, 1500))) return false;
    for (let i = 0; i < 48; i++) {
      const cell = document.querySelector(`[role="gridcell"][data-day="${iso}"],[data-day="${iso}"]`);
      if (cell) { softClick(cell.querySelector("button") || cell); flash(el); await sleep(120); return true; }
      const vis = [...document.querySelectorAll("[role='gridcell'][data-day],[data-day]")]
        .map((c) => c.getAttribute("data-day")).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
      if (!vis.length) break;
      const dir = iso < vis[0] ? "prev" : iso > vis[vis.length - 1] ? "next" : null;
      if (!dir) break;
      const sel = dir === "next"
        ? '[aria-label*="next month" i],[aria-label*="next" i],button[name="next-month"]'
        : '[aria-label*="previous month" i],[aria-label*="previous" i],button[name="previous-month"]';
      const nav = document.querySelector(sel); if (!nav) break;
      softClick(nav); await sleep(170);
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return false;
  }
  function fillNative(el, value) {
    const type = (el.type || "text").toLowerCase();
    if (type === "checkbox") {
      const want = value === true || value === "true" || value === "yes" || value === 1;
      if (el.checked !== want) { el.checked = want; fire(el); }
    } else if (type === "radio") {
      document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`).forEach((r) => {
        if (r.value == value && !r.checked) { r.checked = true; fire(r); }
      });
    } else if (el.tagName.toLowerCase() === "select") {
      const opt = Array.from(el.options).find((o) => o.value == value || o.text == value);
      if (opt) { el.value = opt.value; fire(el); }
    } else { el.focus(); setNativeValue(el, String(value)); fire(el); }
    flash(el);
  }

  // snapshot a field's current state so it can be undone later
  function snapshot(el, kind) {
    if (kind === "combobox" || kind === "datepicker") return { kind, text: el.innerText.trim() };
    const type = (el.type || "text").toLowerCase();
    if (type === "checkbox" || type === "radio") return { kind: "native", type, checked: el.checked };
    if (el.tagName.toLowerCase() === "select") return { kind: "native", type: "select", value: el.value };
    return { kind: "native", type, value: el.value };
  }

  return (async () => {
    const els = window.__aiffEls || new Map();
    const meta = {}; (fieldsMeta || []).forEach((f) => (meta[f.id] = f));
    const log = [];
    const undo = [];
    let filled = 0;
    for (const [id, value] of Object.entries(values)) {
      const el = els.get(id) || document.querySelector(`[data-aiff-id="${id}"]`);
      const kind = meta[id]?.kind || "input";
      if (!el || !el.isConnected || value === null || value === undefined || value === "") {
        log.push(`skip id=${id} kind=${kind} value=${JSON.stringify(value)} el=${!!el}`); continue;
      }
      try {
        const before = snapshot(el, kind);
        let ok = true;
        if (kind === "combobox") ok = await fillCombobox(el, value);
        else if (kind === "datepicker") ok = await fillDatePicker(el, value);
        else fillNative(el, value);
        if (ok) { filled++; undo.push({ id, ...before }); }
        log.push(`id=${id} kind=${kind} value=${JSON.stringify(value)} -> ${ok ? "OK" : "FAIL"}`);
      } catch (e) { log.push(`id=${id} ERROR ${e.message}`); }
      await sleep(40);
    }
    window.__aiffUndo = undo; // consumed by aiffPageUndo()
    return { filled, total: Object.keys(values).length, log, canUndo: undo.length > 0 };
  })();
}

// Restore field values captured by the last aiffPageFill. Native fields restore
// exactly; Radix Selects re-select the previous option IF it was a real value
// (a placeholder can't be re-emptied — Radix has no clear), datepickers can't be
// reverted. Returns {restored, skipped}.
function aiffPageUndo() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, t = 1200, s = 50) => {
    const end = Date.now() + t;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(s); }
    return null;
  };
  const softClick = (el) => { if (!el) return; try { el.scrollIntoView({ block: "center" }); } catch (e) {} el.click(); };
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const setNativeValue = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
    if (d && d.set) d.set.call(el, v); else el.value = v;
  };
  const fire = (el) => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  };

  return (async () => {
    const els = window.__aiffEls || new Map();
    const undo = window.__aiffUndo || [];
    let restored = 0, skipped = 0;
    for (const u of undo) {
      const el = els.get(u.id);
      if (!el || !el.isConnected) { skipped++; continue; }
      try {
        if (u.kind === "native") {
          if (u.type === "checkbox" || u.type === "radio") { if (el.checked !== u.checked) { el.checked = u.checked; fire(el); } }
          else if (u.type === "select") { el.value = u.value; fire(el); }
          else { el.focus(); setNativeValue(el, u.value || ""); fire(el); }
          restored++;
        } else if (u.kind === "combobox") {
          softClick(el);
          await waitFor(() => document.querySelector('[role="option"]'), 1000);
          const match = [...document.querySelectorAll('[role="option"]')].find((o) => norm(o.innerText) === norm(u.text));
          if (match) { softClick(match); restored++; }
          else { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); skipped++; }
          await sleep(120);
        } else { skipped++; } // datepicker: not revertible
      } catch (e) { skipped++; }
      await sleep(40);
    }
    window.__aiffUndo = [];
    return { restored, skipped };
  })();
}
