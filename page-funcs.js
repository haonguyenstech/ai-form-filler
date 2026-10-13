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
    #${ID} .aiff-toast{position:fixed;top:24px;left:50%;transform:translateX(-50%);
      display:flex;align-items:center;gap:13px;padding:12px 22px 12px 12px;border-radius:9999px;
      background:#fff;color:#121317;border:1px solid rgba(18,19,23,.10);
      font-family:"Google Sans Flex","Google Sans","AIFF Sans",-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
      box-shadow:0 1px 2px rgba(18,19,23,.04),0 12px 32px rgba(18,19,23,.14);
      animation:aiffToast 2.8s cubic-bezier(.2,.8,.2,1) forwards}
    #${ID} .aiff-check{position:relative;width:34px;height:34px;flex:0 0 auto;
      background:#34A853;border-radius:50%;display:grid;place-items:center;animation:aiffPop .5s ease-out both}
    #${ID} .aiff-ring{position:absolute;inset:0;border-radius:50%;border:2px solid #34A853;animation:aiffRing .9s ease-out forwards}
    #${ID} .aiff-title{font-weight:500;font-size:14.5px;letter-spacing:-.02em;line-height:1.2}
    #${ID} .aiff-sub{font-size:12.5px;font-weight:400;letter-spacing:-.1px;color:#45474D;margin-top:2px}
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
  // Google's four brand colours — the same confetti motif as the antigravity.google hero
  const colors = ["#4285F4", "#EA4335", "#FBBC04", "#34A853"];
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

  // above a native modal <dialog> only its own subtree is painted on top
  const modal = [...document.querySelectorAll("dialog[open]")].filter((d) => { try { return d.matches(":modal"); } catch (e) { return false; } }).pop();
  (modal || document.documentElement).appendChild(wrap);
  setTimeout(() => wrap.remove(), 3200);
}

function aiffPageExtract() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // ---- page-dialog safety (repeated in each exported function: Chrome serialises
  // every one on its own, so they cannot share outer helpers) ----
  // A form inside a page dialog is easy to break: Escape and backdrop clicks are
  // exactly how that dialog closes. So Escape is only ever aimed at a popup we
  // opened, and with a page modal up, never at the document or its backdrop.
  const pageModal = () => {
    const shown = (d) => (d.checkVisibility ? d.checkVisibility({ visibilityProperty: true }) : getComputedStyle(d).display !== "none");
    const isModal = (d) => {
      try { if (d.matches(":modal")) return true; } catch (e) {}
      if (d.getAttribute("aria-modal") === "true" || d.matches(".modal.show")) return true;
      // Radix and MUI hide the rest of the page instead of saying aria-modal
      for (let n = d; n && n.parentElement && n !== document.body; n = n.parentElement)
        for (const sib of n.parentElement.children)
          if (sib !== n && (sib.getAttribute("aria-hidden") === "true" || sib.hasAttribute("inert")) &&
              sib.querySelector("input,textarea,select,button")) return true;
      return false;
    };
    const c = [...document.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"],.modal.show')]
      .filter((d) => !d.closest("#__aiff_host") && shown(d) && isModal(d) &&
        d.querySelector('input,textarea,select,[role="combobox"],[aria-haspopup]'));
    return c.filter((d) => !c.some((o) => o !== d && d.contains(o))).pop() || null; // innermost
  };
  const openPop = () => document.querySelector('[role="listbox"],[role="menu"]') ||
    document.querySelector('[role="option"]')?.parentElement ||
    document.querySelector('[role="grid"]')?.closest('[role="dialog"],[data-radix-popper-content-wrapper],[class*="popover" i],[class*="picker" i]') || null;
  const ESC = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true };
  const escapeAway = (el) => {
    const pop = openPop();
    if (!pageModal()) {
      for (const t of [pop, document.activeElement, el, document]) if (t) try { t.dispatchEvent(new KeyboardEvent("keydown", ESC)); } catch (e) {}
      return;
    }
    // Inside a page modal Escape is a trap: React bubbles it through portals, so
    // the dialog that owns the popup sees it too — MUI and antd closed exactly
    // that way. Close the popup as a user would instead: its own backdrop, or a
    // press on a neutral spot that is outside the popup but inside the modal.
    if (!pop) return;
    clickScrim();
    const modal = pageModal();
    const spot = modal && [...modal.querySelectorAll('h1,h2,h3,h4,h5,h6,[class*="title" i],[class*="header" i],p')]
      .find((n) => !pop.contains(n) && !n.closest("button,a,label,input,select,textarea,[role=button]"));
    if (spot) {
      const o = { bubbles: true, cancelable: true, composed: true, view: window, button: 0 };
      for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        try { spot.dispatchEvent(t.startsWith("pointer") && typeof PointerEvent === "function" ? new PointerEvent(t, o) : new MouseEvent(t, o)); } catch (e) {}
      }
    }
    if (el && el.blur) try { el.blur(); } catch (e) {}
  };
  const clickScrim = () => {
    const modal = pageModal();
    const scrim = [...document.querySelectorAll('.MuiBackdrop-root,[class*=backdrop i],[class*=scrim i]')]
      .find((n) => {
        if (n.closest("a,button") || n.tagName === "A") return false;
        // the page dialog's own backdrop — clicking it is how the dialog closes
        if (modal && (modal.contains(n) || (n.parentElement && n.parentElement.contains(modal)))) return false;
        const st = getComputedStyle(n), r = n.getBoundingClientRect();
        return st.position === "fixed" && r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9;
      });
    if (scrim) try { scrim.click(); } catch (e) {}
  };
  const waitFor = async (fn, t = 900, s = 50) => {
    const end = Date.now() + t;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(s); }
    return null;
  };
  const softClick = (el) => {
    if (!el) return;
    try { el.scrollIntoView({ block: "center" }); } catch (e) {}
    // Component libraries open on pointerdown/mousedown, not on click — a MUI
    // Select never opens from a bare el.click(). Replay the whole sequence, then
    // let the native click() supply the one activation so nothing fires twice
    // (dispatching a synthetic "click" as well would toggle a checkbox back).
    const o = { bubbles: true, cancelable: true, view: window, button: 0 };
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      try { el.dispatchEvent(typeof PointerEvent === "function" && t.startsWith("pointer")
        ? new PointerEvent(t, o) : new MouseEvent(t, o)); } catch (e) {}
    }
    try { el.click(); } catch (e) {}
  };
  const findCal = () =>
    document.querySelector('[role="grid"],.rdp,[class*="rdp"],[class*="calendar"],[data-slot="calendar"]');
  const vis = (el) => {
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return false;
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
  // a <label> that wraps its <select>/<textarea> would otherwise read every
  // option (or the typed text) into the label
  const labelText = (l) => {
    if (!l.querySelector("select,textarea,datalist")) return clean(l.innerText);
    const c = l.cloneNode(true);
    c.querySelectorAll("select,textarea,datalist").forEach((n) => n.remove());
    return clean(c.textContent);
  };
  const getLabel = (el) => {
    // 1) explicit <label for=id>
    if (el.id) { const x = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (x && ok(labelText(x))) return labelText(x); }
    // 2) wrapping <label>
    const pl = el.closest("label"); if (pl && ok(labelText(pl))) return labelText(pl);
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
    // Scanning clicks real controls, and filling dispatches real events; either
    // can trip a form submit and navigate the page away mid-run (it did on
    // ant.design). Nothing here should ever submit anything, so block it
    // outright for the duration and restore the page's own behaviour after.
    const noSubmit = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener("submit", noSubmit, true);
    const els = new Map();
    const fields = [];
    const seen = new Set(); // per-pass, unlike data-aiff-id which persists on the node
    // With a page modal open, its form is the one the user means. Fields behind it
    // are not reachable by hand either, and clicking one is an outside click.
    const scope = pageModal();
    // Site chrome is not the form. A version or language picker in the header is a
    // combobox like any other, and "filling" it navigated ant.design to 5x.ant.design.
    const siteChrome = (el) => !scope && !el.closest("form") &&
      !!el.closest('header,nav,[role="banner"],[role="navigation"],[role="search"]');
    const inScope = (el) => (!scope || scope.contains(el)) && !siteChrome(el);
    let idx = 0;
    const tag = (el) => {
      const id = String(idx++);
      el.setAttribute("data-aiff-id", id);
      els.set(id, el); seen.add(el);
      return id;
    };

    // 1) native inputs / textareas / selects
    document.querySelectorAll("input, textarea, select").forEach((el) => {
      const type = (el.type || "text").toLowerCase();
      // password is excluded on purpose: a credential field must never be part of
      // the request sent to the model, nor be overwritten by generated text
      if (["hidden", "submit", "button", "reset", "image", "file", "password"].includes(type)) return;
      if (el.readOnly || el.getAttribute("aria-readonly") === "true") return;
      if (!vis(el) || !inScope(el)) return;
      if (type === "radio") {
        // One field per group, offering each radio's own label. Sent one radio at
        // a time, the model only saw "Male" / "Female" as separate fields and never
        // the values to pick from, so a group was almost never set.
        if (seen.has(el)) return;
        const group = el.name
          ? [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)]
              .filter((r) => r.form === el.form && vis(r) && inScope(r))
          : [el];
        const opts = group.map((r) => getLabel(r) || r.value);
        group.forEach((r, i) => { r.setAttribute("data-aiff-opt", opts[i]); seen.add(r); });
        const box = el.closest('[role="radiogroup"],fieldset');
        const named = (t) => ok(t) && !opts.some((o) => o && t.includes(o)) ? t : "";
        let glbl = "";
        if (box) {
          const lg = box.querySelector(":scope > legend");
          const lb = (box.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean)
            .map((i) => clean(document.getElementById(i)?.innerText)).join(" ");
          glbl = named(clean(lg?.innerText)) || named(clean(box.getAttribute("aria-label"))) || named(lb) || named(getLabel(box));
        }
        glbl = glbl || humanize(el.name) || "Choice";
        const checked = group.find((r) => r.checked);
        fields.push({
          id: tag(el), kind: "input", type: "radio", name: el.name || "", placeholder: "", label: glbl,
          required: group.some((r) => r.required), maxLength: null, options: opts,
          currentValue: checked ? checked.getAttribute("data-aiff-opt") : "",
        });
        return;
      }
      const lbl = getLabel(el);
      const f = {
        id: tag(el), kind: el.tagName.toLowerCase() === "select" ? "select" : "input",
        type, name: el.name || "", placeholder: el.placeholder || "", label: lbl,
        required: !!isRequired(el, lbl), maxLength: el.maxLength > 0 ? el.maxLength : null,
        currentValue: type === "checkbox" ? el.checked : el.value,
      };
      // declared constraints, so the model can satisfy them instead of being
      // rejected by the page's own validation after the fill
      for (const a of ["pattern", "min", "max", "step"]) {
        const v = el.getAttribute(a);
        if (v !== null && v !== "" && !(a === "step" && v === "any")) f[a] = v;
      }
      if (el.minLength > 0) f.minLength = el.minLength;
      // a field already shown as invalid (a docs demo of the error state) is not
      // something this fill caused, so the post-fill check leaves it alone
      if (el.getAttribute("aria-invalid") === "true") f.preInvalid = true;
      if (el.tagName.toLowerCase() === "select") {
        // a prompt row ("Open this select menu", "-- Select --", value="") is not a
        // real choice; offered to the model, it gets picked and the field stays blank
        const isPrompt = (o, i) => o.disabled || (o.hasAttribute("value") && o.value === "") ||
          (i === 0 && /^\s*(-+|select\b|choose\b|pick\b|open this\b|please\b|none\b|\.\.\.)/i.test(o.text));
        const all = Array.from(el.options);
        const real = all.filter((o, i) => !isPrompt(o, i));
        f.options = (real.length ? real : all).map((o) => o.text || o.value);
      }
      fields.push(f);
    });

    // Open a Radix Select and harvest its options. Options frequently load
    // ASYNC (e.g. departments fetched from an API), so we (a) wait for the
    // first option to appear, (b) keep polling until the count STOPS growing
    // (list finished loading), and (c) retry the whole open once if it came
    // back empty. This fixes selects that previously scanned as options:[].
    // Closing matters as much as opening. Options are read with a document-wide
    // [role=option] query, so a popup left open makes the NEXT field harvest the
    // previous field's choices — or, once a modal backdrop stacks up, harvest
    // nothing at all. MUI listens for Escape on its own modal root, not on
    // document, so the key has to be aimed at the popup itself.
    const closePopup = async (el) => {
      if (!openPop()) return true; // nothing of ours is open — sending Escape anyway closed page dialogs
      escapeAway(el);
      clickScrim();
      if (!pageModal()) el.blur && el.blur();
      return waitFor(() => !document.querySelector('[role="option"]'), 900);
    };

    const harvest = async (el) => {
      await closePopup(el); // never open on top of a popup left by the previous field
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
        await closePopup(el);
        if (opts.length) return opts;
        await sleep(250); // let an async fetch kick in before retrying
      }
      return [];
    };

    // 2) Radix Select triggers — open to harvest options
    const combos = [...document.querySelectorAll('[role="combobox"],[data-slot="select-trigger"],[aria-haspopup="listbox"]')]
      .filter((el) => vis(el) && !seen.has(el) && inScope(el));
    for (const el of combos) {
      const lbl = getLabel(el);
      const ph = el.querySelector("[data-placeholder]") ? el.querySelector("[data-placeholder]").innerText.trim() : "";
      const f = { id: tag(el), kind: "combobox", type: "select", label: lbl, placeholder: ph, required: !!isRequired(el, lbl), currentValue: el.innerText.trim(), options: [] };
      try { f.options = await harvest(el); } catch (e) {}
      fields.push(f);
    }

    // 3) shadcn date pickers — only in-form popovers that open a calendar
    const pops = [...document.querySelectorAll('[aria-haspopup="dialog"],[data-slot="popover-trigger"]')]
      .filter((el) => vis(el) && !seen.has(el) && el.closest("form") && inScope(el));
    for (const el of pops) {
      let isDate = false;
      try { softClick(el); isDate = !!(await waitFor(findCal, 700)); } catch (e) {}
      escapeAway(el);
      await sleep(70);
      if (!isDate) continue;
      const lbl = getLabel(el);
      fields.push({ id: tag(el), kind: "datepicker", type: "date", label: lbl, required: !!isRequired(el, lbl), currentValue: el.innerText.trim() });
    }

    if (openPop()) escapeAway();
    await sleep(60);
    document.removeEventListener("submit", noSubmit, true);
    window.__aiffEls = els;
    return fields;
  })();
}

function aiffPageFill(values, fieldsMeta, keepUndo) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // ---- page-dialog safety (repeated in each exported function: Chrome serialises
  // every one on its own, so they cannot share outer helpers) ----
  // A form inside a page dialog is easy to break: Escape and backdrop clicks are
  // exactly how that dialog closes. So Escape is only ever aimed at a popup we
  // opened, and with a page modal up, never at the document or its backdrop.
  const pageModal = () => {
    const shown = (d) => (d.checkVisibility ? d.checkVisibility({ visibilityProperty: true }) : getComputedStyle(d).display !== "none");
    const isModal = (d) => {
      try { if (d.matches(":modal")) return true; } catch (e) {}
      if (d.getAttribute("aria-modal") === "true" || d.matches(".modal.show")) return true;
      // Radix and MUI hide the rest of the page instead of saying aria-modal
      for (let n = d; n && n.parentElement && n !== document.body; n = n.parentElement)
        for (const sib of n.parentElement.children)
          if (sib !== n && (sib.getAttribute("aria-hidden") === "true" || sib.hasAttribute("inert")) &&
              sib.querySelector("input,textarea,select,button")) return true;
      return false;
    };
    const c = [...document.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"],.modal.show')]
      .filter((d) => !d.closest("#__aiff_host") && shown(d) && isModal(d) &&
        d.querySelector('input,textarea,select,[role="combobox"],[aria-haspopup]'));
    return c.filter((d) => !c.some((o) => o !== d && d.contains(o))).pop() || null; // innermost
  };
  const openPop = () => document.querySelector('[role="listbox"],[role="menu"]') ||
    document.querySelector('[role="option"]')?.parentElement ||
    document.querySelector('[role="grid"]')?.closest('[role="dialog"],[data-radix-popper-content-wrapper],[class*="popover" i],[class*="picker" i]') || null;
  const ESC = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true };
  const escapeAway = (el) => {
    const pop = openPop();
    if (!pageModal()) {
      for (const t of [pop, document.activeElement, el, document]) if (t) try { t.dispatchEvent(new KeyboardEvent("keydown", ESC)); } catch (e) {}
      return;
    }
    // Inside a page modal Escape is a trap: React bubbles it through portals, so
    // the dialog that owns the popup sees it too — MUI and antd closed exactly
    // that way. Close the popup as a user would instead: its own backdrop, or a
    // press on a neutral spot that is outside the popup but inside the modal.
    if (!pop) return;
    clickScrim();
    const modal = pageModal();
    const spot = modal && [...modal.querySelectorAll('h1,h2,h3,h4,h5,h6,[class*="title" i],[class*="header" i],p')]
      .find((n) => !pop.contains(n) && !n.closest("button,a,label,input,select,textarea,[role=button]"));
    if (spot) {
      const o = { bubbles: true, cancelable: true, composed: true, view: window, button: 0 };
      for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        try { spot.dispatchEvent(t.startsWith("pointer") && typeof PointerEvent === "function" ? new PointerEvent(t, o) : new MouseEvent(t, o)); } catch (e) {}
      }
    }
    if (el && el.blur) try { el.blur(); } catch (e) {}
  };
  const clickScrim = () => {
    const modal = pageModal();
    const scrim = [...document.querySelectorAll('.MuiBackdrop-root,[class*=backdrop i],[class*=scrim i]')]
      .find((n) => {
        if (n.closest("a,button") || n.tagName === "A") return false;
        // the page dialog's own backdrop — clicking it is how the dialog closes
        if (modal && (modal.contains(n) || (n.parentElement && n.parentElement.contains(modal)))) return false;
        const st = getComputedStyle(n), r = n.getBoundingClientRect();
        return st.position === "fixed" && r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9;
      });
    if (scrim) try { scrim.click(); } catch (e) {}
  };
  const waitFor = async (fn, t = 1500, s = 50) => {
    const end = Date.now() + t;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(s); }
    return null;
  };
  const softClick = (el) => {
    if (!el) return;
    try { el.scrollIntoView({ block: "center" }); } catch (e) {}
    // Component libraries open on pointerdown/mousedown, not on click — a MUI
    // Select never opens from a bare el.click(). Replay the whole sequence, then
    // let the native click() supply the one activation so nothing fires twice
    // (dispatching a synthetic "click" as well would toggle a checkbox back).
    const o = { bubbles: true, cancelable: true, view: window, button: 0 };
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      try { el.dispatchEvent(typeof PointerEvent === "function" && t.startsWith("pointer")
        ? new PointerEvent(t, o) : new MouseEvent(t, o)); } catch (e) {}
    }
    try { el.click(); } catch (e) {}
  };
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
  const flash = (el) => { const o = el.style.outline; el.style.outline = "2px solid #121317"; setTimeout(() => (el.style.outline = o), 1200); };

  async function fillCombobox(el, value) {
    softClick(el);
    if (!(await waitFor(() => document.querySelector('[role="option"]'), 1200))) return false;
    const opts = [...document.querySelectorAll('[role="option"]')].map((o) => ({ text: o.innerText.trim(), el: o }));
    const m = bestMatch(value, opts) || opts[0];
    if (!m) { escapeAway(el); return false; }
    softClick(m.el); flash(el); await sleep(120); return true;
  }
  async function fillDatePicker(el, value) {
    const iso = toISO(value); if (!iso) return false;
    softClick(el);
    const cal = await waitFor(findCal, 1500);
    if (!cal) return false;

    const shown = () => [...document.querySelectorAll("[role='gridcell'][data-day],[data-day]")]
      .map((c) => c.getAttribute("data-day")).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const pick = () => document.querySelector(`[role="gridcell"][data-day="${iso}"],[data-day="${iso}"]`);

    // A birth date is 300+ months away, and clicking "previous month" that many
    // times is neither fast nor reliable. Most calendars that support far dates
    // also expose month/year <select>s (react-day-picker's dropdown layout,
    // jQuery UI, Bootstrap datepicker) — one hop each instead of hundreds.
    const [wantY, wantM] = iso.split("-").map(Number);
    const popup = cal.closest('[role="dialog"],[data-radix-popper-content-wrapper],[class*="popover" i]') || cal;
    for (const sel of popup.querySelectorAll("select")) {
      const opts = [...sel.options];
      const isYear = opts.length > 3 && opts.every((o) => /^\d{4}$/.test(o.text.trim() || o.value));
      const isMonth = opts.length === 12;
      const want = isYear ? wantY : isMonth ? wantM : null;
      if (want === null) continue;
      // month selects are 0-based in some libraries and 1-based in others
      const hit = opts.find((o) => Number(o.value) === want || Number(o.value) === want - 1 ||
                                   o.text.trim() === String(want)) ||
                  (isMonth ? opts[wantM - 1] : null);
      if (!hit) continue;
      sel.value = hit.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(150);
    }
    if (pick()) { softClick(pick().querySelector("button") || pick()); flash(el); await sleep(120); return true; }

    // Arrow fallback. The step budget is derived from how far the target really
    // is rather than a flat cap, so distant dates are reachable, and each step
    // waits for the grid to actually change instead of a fixed delay.
    const first = shown();
    let budget = 48;
    if (first.length) {
      const [cy, cm] = first[0].split("-").map(Number);
      budget = Math.min(720, Math.abs((wantY - cy) * 12 + (wantM - cm)) + 3);
    }
    for (let i = 0; i < budget; i++) {
      const cell = pick();
      if (cell) { softClick(cell.querySelector("button") || cell); flash(el); await sleep(120); return true; }
      const days = shown();
      if (!days.length) break;
      const dir = iso < days[0] ? "prev" : iso > days[days.length - 1] ? "next" : null;
      if (!dir) break;
      const navSel = dir === "next"
        ? '[aria-label*="next month" i],[aria-label*="next" i],button[name="next-month"]'
        : '[aria-label*="previous month" i],[aria-label*="previous" i],button[name="previous-month"]';
      const nav = document.querySelector(navSel); if (!nav) break;
      const before = days[0];
      softClick(nav);
      await waitFor(() => { const d = shown(); return d.length && d[0] !== before; }, 400, 25);
    }
    escapeAway(el);
    return false;
  }
  function fillNative(el, value) {
    const type = (el.type || "text").toLowerCase();
    if (type === "checkbox") {
      const want = value === true || value === "true" || value === "yes" || value === 1;
      if (el.checked !== want) { el.checked = want; fire(el); }
    } else if (type === "radio") {
      const group = el.name ? [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)].filter((r) => r.form === el.form) : [el];
      const cands = group.map((r) => ({ text: r.getAttribute("data-aiff-opt") || r.value, el: r }));
      const hit = group.find((r) => r.value == value) ? { el: group.find((r) => r.value == value) } : bestMatch(String(value), cands);
      if (!hit) return false;
      // a click, not .checked = true: React/MUI radio groups only follow real activation
      if (!hit.el.checked) hit.el.click();
      flash(hit.el);
      return true;
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
    if (type === "radio") {
      const group = el.name ? [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)].filter((r) => r.form === el.form) : [el];
      return { kind: "native", type, checkedIdx: group.findIndex((r) => r.checked) };
    }
    if (type === "checkbox") return { kind: "native", type, checked: el.checked };
    if (el.tagName.toLowerCase() === "select") return { kind: "native", type: "select", value: el.value };
    return { kind: "native", type, value: el.value };
  }

  return (async () => {
    const els = window.__aiffEls || new Map();
    const noSubmit = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener("submit", noSubmit, true);
    const meta = {}; (fieldsMeta || []).forEach((f) => (meta[f.id] = f));
    const log = [];
    // a correction pass refills fields the first pass already set; its "before"
    // would be the first pass's value, so keep the original entry instead
    const undo = keepUndo ? (window.__aiffUndo || []).slice() : [];
    const hadUndo = new Set(undo.map((u) => u.id));
    const filledIds = [];
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
        else ok = fillNative(el, value) !== false;
        if (ok) { filled++; filledIds.push(id); if (!hadUndo.has(id)) undo.push({ id, ...before }); }
        log.push(`id=${id} kind=${kind} value=${JSON.stringify(value)} -> ${ok ? "OK" : "FAIL"}`);
      } catch (e) { log.push(`id=${id} ERROR ${e.message}`); }
      await sleep(40);
    }
    // A dropdown whose selection failed stays open, and MUI marks the whole app
    // root aria-hidden while one of its modals is up — which made every later
    // scan of the page find zero fields. Always leave the page closed up.
    for (let i = 0; i < 12; i++) {
      if (!document.querySelector('[role="listbox"],[role="menu"]')) break;
      escapeAway();
      clickScrim();
      await sleep(120);
    }
    document.removeEventListener("submit", noSubmit, true);

    window.__aiffUndo = undo; // consumed by aiffPageUndo()
    return { filled, filledIds, total: Object.keys(values).length, log, canUndo: undo.length > 0 };
  })();
}

// After a fill: which of these fields does the page reject? Native constraint
// validation first (pattern, min/max, type=email, required…), then the
// aria-invalid that React/MUI/antd form libraries set after blur, with the
// error text they show next to the field. Returns [{id, message, value}].
function aiffPageCheck(ids) {
  return (async () => {
    await new Promise((r) => setTimeout(r, 300)); // async validators settle after blur
    const els = window.__aiffEls || new Map();
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
    const shownText = (n) => n && n.getClientRects().length ? clean(n.innerText || n.textContent) : "";
    const errorText = (el) => {
      for (const attr of ["aria-errormessage", "aria-describedby"]) {
        const t = (el.getAttribute(attr) || "").split(/\s+/).filter(Boolean)
          .map((i) => shownText(document.getElementById(i))).filter(Boolean).join(" ");
        if (t) return t;
      }
      // nearest wrapper that holds only this control
      let box = el.parentElement;
      for (let i = 0; box && i < 4; i++, box = box.parentElement) {
        if (box.querySelectorAll("input,select,textarea,[role=combobox]").length > 1) break;
        const msg = box.querySelector('[role="alert"],.invalid-feedback,.error,.error-message,.form-error,[class*="error-text" i],[class*="errorText" i],[class*="helper-text" i][class*="error" i],.ant-form-item-explain-error,.Mui-error.MuiFormHelperText-root');
        const t = shownText(msg);
        if (t && t.length < 200) return t;
      }
      return "";
    };
    const out = [];
    for (const id of ids || []) {
      const el = els.get(id) || document.querySelector(`[data-aiff-id="${id}"]`);
      if (!el || !el.isConnected) continue;
      let message = "";
      if (el.willValidate && el.validity && !el.validity.valid) message = el.validationMessage || "invalid value";
      else if (el.getAttribute("aria-invalid") === "true") message = errorText(el) || "the page marked this value as invalid";
      if (!message) continue;
      const value = el.type === "checkbox" ? el.checked : el.type === "radio"
        ? (document.querySelector(`input[type="radio"][name="${CSS.escape(el.name)}"]:checked`)?.getAttribute("data-aiff-opt") || "")
        : (el.value ?? clean(el.innerText));
      out.push({ id, message: message.slice(0, 200), value });
    }
    return out;
  })();
}

// Restore field values captured by the last aiffPageFill. Native fields restore
// exactly; Radix Selects re-select the previous option IF it was a real value
// (a placeholder can't be re-emptied — Radix has no clear), datepickers can't be
// reverted. Returns {restored, skipped}.
function aiffPageUndo() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // ---- page-dialog safety (repeated in each exported function: Chrome serialises
  // every one on its own, so they cannot share outer helpers) ----
  // A form inside a page dialog is easy to break: Escape and backdrop clicks are
  // exactly how that dialog closes. So Escape is only ever aimed at a popup we
  // opened, and with a page modal up, never at the document or its backdrop.
  const pageModal = () => {
    const shown = (d) => (d.checkVisibility ? d.checkVisibility({ visibilityProperty: true }) : getComputedStyle(d).display !== "none");
    const isModal = (d) => {
      try { if (d.matches(":modal")) return true; } catch (e) {}
      if (d.getAttribute("aria-modal") === "true" || d.matches(".modal.show")) return true;
      // Radix and MUI hide the rest of the page instead of saying aria-modal
      for (let n = d; n && n.parentElement && n !== document.body; n = n.parentElement)
        for (const sib of n.parentElement.children)
          if (sib !== n && (sib.getAttribute("aria-hidden") === "true" || sib.hasAttribute("inert")) &&
              sib.querySelector("input,textarea,select,button")) return true;
      return false;
    };
    const c = [...document.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"],.modal.show')]
      .filter((d) => !d.closest("#__aiff_host") && shown(d) && isModal(d) &&
        d.querySelector('input,textarea,select,[role="combobox"],[aria-haspopup]'));
    return c.filter((d) => !c.some((o) => o !== d && d.contains(o))).pop() || null; // innermost
  };
  const openPop = () => document.querySelector('[role="listbox"],[role="menu"]') ||
    document.querySelector('[role="option"]')?.parentElement ||
    document.querySelector('[role="grid"]')?.closest('[role="dialog"],[data-radix-popper-content-wrapper],[class*="popover" i],[class*="picker" i]') || null;
  const ESC = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true };
  const escapeAway = (el) => {
    const pop = openPop();
    if (!pageModal()) {
      for (const t of [pop, document.activeElement, el, document]) if (t) try { t.dispatchEvent(new KeyboardEvent("keydown", ESC)); } catch (e) {}
      return;
    }
    // Inside a page modal Escape is a trap: React bubbles it through portals, so
    // the dialog that owns the popup sees it too — MUI and antd closed exactly
    // that way. Close the popup as a user would instead: its own backdrop, or a
    // press on a neutral spot that is outside the popup but inside the modal.
    if (!pop) return;
    clickScrim();
    const modal = pageModal();
    const spot = modal && [...modal.querySelectorAll('h1,h2,h3,h4,h5,h6,[class*="title" i],[class*="header" i],p')]
      .find((n) => !pop.contains(n) && !n.closest("button,a,label,input,select,textarea,[role=button]"));
    if (spot) {
      const o = { bubbles: true, cancelable: true, composed: true, view: window, button: 0 };
      for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        try { spot.dispatchEvent(t.startsWith("pointer") && typeof PointerEvent === "function" ? new PointerEvent(t, o) : new MouseEvent(t, o)); } catch (e) {}
      }
    }
    if (el && el.blur) try { el.blur(); } catch (e) {}
  };
  const clickScrim = () => {
    const modal = pageModal();
    const scrim = [...document.querySelectorAll('.MuiBackdrop-root,[class*=backdrop i],[class*=scrim i]')]
      .find((n) => {
        if (n.closest("a,button") || n.tagName === "A") return false;
        // the page dialog's own backdrop — clicking it is how the dialog closes
        if (modal && (modal.contains(n) || (n.parentElement && n.parentElement.contains(modal)))) return false;
        const st = getComputedStyle(n), r = n.getBoundingClientRect();
        return st.position === "fixed" && r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9;
      });
    if (scrim) try { scrim.click(); } catch (e) {}
  };
  const waitFor = async (fn, t = 1200, s = 50) => {
    const end = Date.now() + t;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(s); }
    return null;
  };
  const softClick = (el) => {
    if (!el) return;
    try { el.scrollIntoView({ block: "center" }); } catch (e) {}
    // Component libraries open on pointerdown/mousedown, not on click — a MUI
    // Select never opens from a bare el.click(). Replay the whole sequence, then
    // let the native click() supply the one activation so nothing fires twice
    // (dispatching a synthetic "click" as well would toggle a checkbox back).
    const o = { bubbles: true, cancelable: true, view: window, button: 0 };
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      try { el.dispatchEvent(typeof PointerEvent === "function" && t.startsWith("pointer")
        ? new PointerEvent(t, o) : new MouseEvent(t, o)); } catch (e) {}
    }
    try { el.click(); } catch (e) {}
  };
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
          if (u.type === "radio") {
            const group = el.name ? [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)].filter((r) => r.form === el.form) : [el];
            if (u.checkedIdx >= 0) { if (!group[u.checkedIdx].checked) group[u.checkedIdx].click(); }
            else group.forEach((r) => { if (r.checked) { r.checked = false; fire(r); } });
          } else if (u.type === "checkbox") { if (el.checked !== u.checked) { el.checked = u.checked; fire(el); } }
          else if (u.type === "select") { el.value = u.value; fire(el); }
          else { el.focus(); setNativeValue(el, u.value || ""); fire(el); }
          restored++;
        } else if (u.kind === "combobox") {
          softClick(el);
          await waitFor(() => document.querySelector('[role="option"]'), 1000);
          const match = [...document.querySelectorAll('[role="option"]')].find((o) => norm(o.innerText) === norm(u.text));
          if (match) { softClick(match); restored++; }
          else { escapeAway(el); skipped++; }
          await sleep(120);
        } else { skipped++; } // datepicker: not revertible
      } catch (e) { skipped++; }
      await sleep(40);
    }
    window.__aiffUndo = [];
    return { restored, skipped };
  })();
}
