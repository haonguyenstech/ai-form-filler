// inject.js — content script. Floating chat bubble + centered modal dialog
// (Shadow DOM so the page's CSS can't touch it). Drives the fill via the
// background service worker (which runs extract/fill in the page's MAIN world).

(async () => {
  if (window.top !== window.self) return;            // top frame only
  if (document.getElementById("__aiff_host")) return; // once per page

  // ---- inline SVG icons (Lucide-style stroke) ----
  const I = {
    sparkles:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 3.5 11 8l4.5 1.5L11 11 9.5 15.5 8 11 3.5 9.5 8 8 9.5 3.5Z"/><path d="M18 4.5 18.8 7l2.5.8-2.5.8L18 11l-.8-2.4L14.7 7.8 17.2 7 18 4.5Z"/><path d="m17.5 15 .6 1.8 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.8Z"/></svg>',
    bot:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7V4"/><circle cx="12" cy="3" r="1"/><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M9 13h.01M15 13h.01"/><path d="M8 19v1M16 19v1"/></svg>',
    x:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    gear:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    alert:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
    undo:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 3L3 13"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>',
    back:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
    chev:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5.5c0 4.3 2.9 8.3 7 9.5 4.1-1.2 7-5.2 7-9.5V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    chevRight:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    plug:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6"/><path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8Z"/><path d="M12 17v5"/></svg>',
    save:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M8 3v5h7"/><path d="M12 12v6M9 15h6"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>',
  };

  // @font-face can't live inside a shadow root (Chrome only resolves faces declared
  // at document level), so the family is registered on the page under a private name
  // and referenced from the shadow CSS. Bundled locally → no network, no page CSP.
  // getURL is absent outside a real extension host (e.g. the test harness) — the CSS
  // stack falls back to the system font there, so never let this stop the UI booting.
  if (!document.getElementById("__aiff_font") && typeof chrome?.runtime?.getURL === "function") {
    const url = (f) => chrome.runtime.getURL(`fonts/${f}`);
    const fs = document.createElement("style");
    fs.id = "__aiff_font";
    fs.textContent = `
      @font-face { font-family:"AIFF Sans"; font-style:normal; font-weight:300 900; font-display:swap;
        src:url("${url("figtree-latin.woff2")}") format("woff2");
        unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
      @font-face { font-family:"AIFF Sans"; font-style:normal; font-weight:300 900; font-display:swap;
        src:url("${url("figtree-latin-ext.woff2")}") format("woff2");
        unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }
    `;
    document.documentElement.appendChild(fs);
  }

  const host = document.createElement("div");
  host.id = "__aiff_host";
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
    <style>
      /* ================================================================
         Design system mirrored from antigravity.google: near-black ink on
         white, a cool blue-grey tint for every secondary surface, pill
         geometry and hairline borders. Google blue carries the primary
         action; the other brand colours appear only in the success confetti.
         ================================================================ */
      :host {
        all: initial;
        color-scheme: light; /* always light, whatever the system theme — native date/select popups too */
        --ink:      #121317;
        --ink-2:    #45474D;
        --ink-3:    #74777F;
        --surface:  #FFFFFF;
        --surface-2:#FAFAFB;
        --tint:     rgba(183,191,217,.09);
        --tint-2:   rgba(183,191,217,.20);
        --line:     rgba(18,19,23,.10);
        --line-2:   rgba(18,19,23,.16);
        --on-ink:   #FFFFFF;
        /* Google blue carries the primary action so the dialog stays light instead of
           resting on a full-width black slab */
        --accent:      #1A73E8;
        --accent-hi:   #1B66C9;
        --accent-soft: rgba(66,133,244,.10);
        --on-accent:   #FFFFFF;
        --green:    #34A853;
        --red:      #EA4335;
        --blue:     #4285F4;
        --yellow:   #FBBC04;
        --pill:     9999px;
        --r-card:   28px;
        --r-ctl:    14px;
        --shadow:   0 1px 2px rgba(18,19,23,.04), 0 12px 32px rgba(18,19,23,.10), 0 40px 80px rgba(18,19,23,.12);
        --ease:     cubic-bezier(.2,.8,.2,1);
      }
      * { box-sizing: border-box;
          font-family: "Google Sans Flex", "Google Sans", "Google Sans Text", "AIFF Sans",
                       -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          font-feature-settings: "cv11"; }
      svg { width: 1em; height: 1em; display: block; }
      ::selection { background: var(--tint-2); }

      /* ---------- bubble — the site's pill button, made round ---------- */
      .bubble {
        position: fixed; right: 24px; bottom: 24px; width: 52px; height: 52px; border: none; padding: 0;
        border-radius: 50%; cursor: pointer; z-index: 2147483646; font-size: 22px;
        background: var(--accent); color: #fff;
        display: grid; place-items: center; isolation: isolate;
        box-shadow: 0 2px 6px rgba(26,115,232,.24), 0 10px 26px rgba(26,115,232,.28);
        transition: transform .25s var(--ease), box-shadow .25s var(--ease);
      }
      /* the four Google colours orbit the mark on hover — the only chromatic moment */
      .bubble::before {
        content: ""; position: absolute; inset: -2px; border-radius: 50%; z-index: -1; opacity: 0;
        background: conic-gradient(from 0deg, #4285F4, #EA4335, #FBBC04, #34A853, #4285F4);
        filter: blur(7px); transition: opacity .3s var(--ease); animation: orbit 6s linear infinite;
      }
      .bubble:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(26,115,232,.26), 0 16px 36px rgba(26,115,232,.34); }
      .bubble:hover::before { opacity: .85; }
      .bubble:active { transform: translateY(0) scale(.95); }
      @keyframes orbit { to { transform: rotate(360deg) } }

      /* ---------- overlay + dialog ---------- */
      .overlay {
        position: fixed; inset: 0; z-index: 2147483647; display: none;
        align-items: center; justify-content: center; padding: 16px;
        background: rgba(18,19,23,.16); backdrop-filter: blur(14px) saturate(1.1);
      }
      .overlay.open { display: flex; animation: fade .2s var(--ease); }
      @keyframes fade { from{opacity:0} to{opacity:1} }

      .dialog {
        position: relative; display: flex; flex-direction: column;
        width: 720px; max-width: 100%; max-height: calc(100vh - 32px); overflow: hidden;
        border-radius: var(--r-card); background: var(--surface); color: var(--ink);
        border: 1px solid var(--line); box-shadow: var(--shadow);
        animation: pop .34s var(--ease);
      }
      @keyframes pop { from{ transform: scale(.96) translateY(10px); opacity:0 } to{ transform:none; opacity:1 } }

      /* ---------- head ---------- */
      .head { position: relative; flex: 0 0 auto; padding: 28px 32px 18px; }
      .head h1 { margin:0; font-size:20px; font-weight:500; letter-spacing:-.04em; line-height:1.15;
        display:flex; align-items:center; gap:11px; }
      .head p { margin:9px 0 0; font-size:13.5px; font-weight:400; line-height:1.45; letter-spacing:-.1px; color:var(--ink-2); max-width:52ch; }
      .logo { position:relative; width:34px; height:34px; border-radius:11px; display:grid; place-items:center;
        font-size:17px; color:var(--accent); background:var(--accent-soft); flex:0 0 auto; }
      .x { position:absolute; top:24px; right:26px; width:34px; height:34px; border:none; border-radius:var(--pill); padding:0;
        background:var(--tint); color:var(--ink-2); font-size:15px; cursor:pointer; display:grid; place-items:center;
        transition: background .18s var(--ease), color .18s var(--ease); }
      .x:hover { background:var(--tint-2); color:var(--ink); }
      .x:disabled { opacity:.35; cursor:not-allowed; }

      .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 18px 32px 28px; }
      .body::-webkit-scrollbar { width: 8px; }
      .body::-webkit-scrollbar-thumb { background: var(--tint-2); border-radius: var(--pill); border:2px solid transparent; background-clip:content-box; }
      #formView, #reviewView { animation: viewIn .28s var(--ease) both; }
      @keyframes viewIn { from{ opacity:0; transform:translateY(6px) } to{ opacity:1; transform:none } }
      #formView[hidden], #reviewView[hidden] { display:none; }

      label { display:block; font-weight:500; margin-bottom:8px; font-size:13px; letter-spacing:-.1px; color:var(--ink); }
      .muted { color:var(--ink-3); font-weight:400; }
      .field { width:100%; padding:11px 14px; border:1px solid var(--line); border-radius:var(--r-ctl); font-size:14px;
        font-weight:400; letter-spacing:-.1px; background:var(--surface); color:var(--ink); font-family:inherit;
        transition:border-color .18s var(--ease), box-shadow .18s var(--ease); }
      .field::placeholder { color:var(--ink-3); }
      .field:hover { border-color:var(--line-2); }
      .field:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }
      textarea.field { resize:vertical; min-height:76px; line-height:1.5; }
      .row { margin-top:16px; }

      /* ---------- select — native <select> stays as the source of truth (so the
         value, change events and every existing listener keep working); it is
         visually replaced by a trigger + a fixed-position popover, because a
         popover inside .body would be clipped by its own scroll container ---------- */
      .sel { position:relative; }
      .sel > select { position:absolute; inset:0; width:100%; height:100%; opacity:0; pointer-events:none; }
      .sel-btn { display:flex; align-items:center; gap:10px; width:100%; padding:11px 12px 11px 14px;
        border:1px solid var(--line); border-radius:var(--r-ctl); background:var(--surface); color:var(--ink);
        font-family:inherit; font-size:14px; font-weight:400; letter-spacing:-.1px; text-align:left; cursor:pointer;
        transition:border-color .18s var(--ease), box-shadow .18s var(--ease); }
      .sel-btn:hover { border-color:var(--line-2); }
      .sel-btn.open, .sel-btn:focus-visible { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }
      .sel-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .sel-label:empty::before { content:attr(data-ph); color:var(--ink-3); }
      .sel-btn .chev { flex:0 0 auto; font-size:16px; color:var(--ink-3); transition:transform .22s var(--ease); }
      .sel-btn.open .chev { transform:rotate(180deg); }

      .sel-pop { position:fixed; z-index:2147483647; padding:6px; border-radius:18px; overflow-y:auto;
        background:var(--surface); border:1px solid var(--line);
        box-shadow:0 1px 2px rgba(18,19,23,.04), 0 12px 32px rgba(18,19,23,.14), 0 24px 56px rgba(18,19,23,.10);
        animation:popIn .16s var(--ease); }
      @keyframes popIn { from{ opacity:0; transform:translateY(-4px) } to{ opacity:1; transform:none } }
      .sel-pop::-webkit-scrollbar { width:8px; }
      .sel-pop::-webkit-scrollbar-thumb { background:var(--tint-2); border-radius:var(--pill); border:2px solid transparent; background-clip:content-box; }
      .sel-opt { display:flex; align-items:center; gap:10px; width:100%; padding:9px 12px; border:none; border-radius:12px;
        background:transparent; color:var(--ink); font-family:inherit; font-size:14px; font-weight:400; letter-spacing:-.1px;
        text-align:left; cursor:pointer; transition:background .12s var(--ease); }
      .sel-opt .otext { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .sel-opt .otick { flex:0 0 auto; font-size:15px; color:var(--accent); opacity:0; }
      .sel-opt[aria-selected="true"] { font-weight:500; }
      .sel-opt[aria-selected="true"] .otick { opacity:1; }
      .sel-opt:hover, .sel-opt.active { background:var(--tint-2); }

      /* ---------- checkbox ---------- */
      input[type=checkbox] { appearance:none; -webkit-appearance:none; margin:0; flex:0 0 auto;
        width:20px; height:20px; border:1.5px solid var(--line-2); border-radius:7px; background:var(--surface);
        cursor:pointer; display:grid; place-items:center;
        transition:background .16s var(--ease), border-color .16s var(--ease), box-shadow .16s var(--ease); }
      input[type=checkbox]:hover { border-color:var(--accent); }
      input[type=checkbox]:focus-visible { outline:none; box-shadow:0 0 0 3px var(--accent-soft); }
      input[type=checkbox]:checked { background:var(--accent); border-color:var(--accent); }
      input[type=checkbox]::after { content:""; width:11px; height:11px; background:var(--on-accent);
        transform:scale(0); transition:transform .18s cubic-bezier(.3,1.5,.5,1);
        clip-path:polygon(14% 44%, 0 60%, 39% 100%, 100% 16%, 86% 0, 39% 71%); }
      input[type=checkbox]:checked::after { transform:scale(1); }

      /* ---------- tabs — the site's pill nav, as a segmented control ---------- */
      .tabs { flex:0 0 auto; display:flex; gap:2px; margin:0 24px 4px; padding:3px;
        background:var(--tint); border-radius:var(--pill); }
      .tab { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:8px 6px; border:none;
        background:transparent; color:var(--ink-2); font-size:13px; font-weight:450; letter-spacing:-.1px; cursor:pointer;
        white-space:nowrap; border-radius:var(--pill); font-family:inherit;
        transition:color .18s var(--ease), background .18s var(--ease), box-shadow .18s var(--ease); }
      .tab .tico { font-size:14px; display:grid; place-items:center; }
      .tab:hover { color:var(--ink); }
      .tab.on { color:var(--ink); font-weight:500; background:var(--surface);
        box-shadow:0 1px 2px rgba(18,19,23,.08), 0 1px 6px rgba(18,19,23,.06); }

      /* ---------- instructions tab ---------- */
      .instr-head { display:flex; align-items:center; gap:9px; font-size:15px; font-weight:500; letter-spacing:-.02em; margin-bottom:14px; }
      .instr-head .tico { color:var(--accent); font-size:16px; display:grid; place-items:center; }
      .instr-head .muted2 { margin-left:auto; font-size:12px; font-weight:450; color:var(--ink-3); }
      .btn.sm { margin-top:12px; padding:11px 18px; font-size:13.5px; }
      #instrList { margin-top:14px; display:flex; flex-direction:column; gap:8px; }
      .irow { display:flex; align-items:center; gap:10px; padding:11px 12px; border:1px solid var(--line); border-radius:16px;
        background:var(--tint); transition:border-color .18s var(--ease), background .18s var(--ease); animation:viewIn .22s var(--ease) both; }
      .irow:hover { border-color:var(--line-2); background:var(--tint-2); }
      .istar { flex:0 0 auto; width:28px; height:28px; border:none; border-radius:var(--pill); background:transparent; color:var(--ink-3);
        cursor:pointer; font-size:16px; line-height:1; display:grid; place-items:center; transition:color .18s var(--ease), transform .18s var(--ease); }
      .istar:hover { transform:scale(1.15); color:var(--yellow); } .istar.on { color:var(--yellow); }
      .itext { flex:1; min-width:0; font-size:13px; line-height:1.45; letter-spacing:-.1px; color:var(--ink-2); cursor:pointer;
        overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; transition:color .18s var(--ease); }
      .itext:hover { color:var(--ink); }
      .idel { flex:0 0 auto; width:28px; height:28px; border:none; border-radius:var(--pill); background:transparent; color:var(--ink-3);
        cursor:pointer; display:grid; place-items:center; transition:color .18s var(--ease), background .18s var(--ease); }
      .idel svg { width:15px; height:15px; }
      .idel:hover { color:var(--red); background:rgba(234,67,53,.10); }
      .iempty { font-size:13px; color:var(--ink-3); text-align:center; padding:26px 10px; line-height:1.55; letter-spacing:-.1px; }

      /* ---------- buttons — the site's black pill + tinted secondary ---------- */
      .btn { position:relative; overflow:hidden; width:100%; margin-top:20px; padding:13px 20px; border:none; border-radius:var(--pill);
        cursor:pointer; color:var(--on-ink); font-size:14.5px; font-weight:500; letter-spacing:-.1px; font-family:inherit;
        display:inline-flex; align-items:center; justify-content:center; gap:9px;
        background:var(--accent); color:var(--on-accent);
        transition:transform .18s var(--ease), box-shadow .18s var(--ease), background .18s var(--ease); }
      .btn:hover { transform:translateY(-1px); background:var(--accent-hi); box-shadow:0 6px 18px rgba(26,115,232,.28); }
      .btn:active { transform:translateY(0); }
      .btn:disabled { cursor:progress; }
      .btn .ico { font-size:17px; display:grid; place-items:center; }
      .btn.loading { opacity:.9; }
      .btn.loading::before { content:""; position:absolute; inset:0;
        background:linear-gradient(100deg, transparent 25%, rgba(255,255,255,.16) 50%, transparent 75%);
        transform:translateX(-100%); animation:shimmer 1.3s infinite; }
      @keyframes shimmer { to{ transform:translateX(100%) } }
      .btn.done { background:var(--green); color:#fff; }
      .spin { width:16px; height:16px; border-radius:50%; border:2px solid currentColor; opacity:.9;
        border-top-color:transparent; animation:spin .7s linear infinite; }
      @keyframes spin { to{ transform:rotate(360deg) } }
      .btn.loading .ico, .btn:not(.loading) .spin { display:none; }

      .ghost { margin-top:10px; width:100%; padding:11px 20px; border:none; border-radius:var(--pill); background:var(--tint);
        color:var(--ink); font-size:13.5px; font-weight:450; letter-spacing:-.1px; cursor:pointer; font-family:inherit;
        display:inline-flex; align-items:center; justify-content:center; gap:8px;
        transition:background .18s var(--ease); }
      .ghost:hover { background:var(--tint-2); }
      .ghost[hidden] { display:none; }
      .ghost .ico { font-size:15px; display:grid; place-items:center; }

      /* test connection — same three states as the primary button, in ghost weight */
      .ghost.test { margin-top:14px; }
      .ghost.test .spin { width:15px; height:15px; }
      .ghost.test:not(.testing) .spin { display:none; }
      .ghost.test.testing .ico { display:none; }
      .ghost.test.testing { cursor:progress; color:var(--ink-2); }
      .ghost.test.ok { background:rgba(52,168,83,.12); color:var(--green); }
      .ghost.test.err { background:rgba(234,67,53,.12); color:var(--red); }
      .ghost.test:disabled { opacity:1; }
      .check { display:flex; align-items:center; gap:10px; font-size:13px; font-weight:450; letter-spacing:-.1px; margin-top:16px; cursor:pointer; color:var(--ink-2); }
      .check b { font-weight:500; color:var(--ink); }
      .check input { width:19px; height:19px; }
      .grip { position:absolute; inset:0; cursor:grab; } .grip:active { cursor:grabbing; }

      /* ---------- preview toggle ---------- */
      .prev-row { display:flex; align-items:center; gap:14px; margin-top:20px; padding:14px 16px; border-radius:20px;
        background:var(--tint); border:1px solid var(--line); }
      .prev-txt { display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
      .prev-title { font-size:13.5px; font-weight:500; letter-spacing:-.02em; color:var(--ink); }
      .prev-sub { font-size:12px; font-weight:400; color:var(--ink-3); line-height:1.4; letter-spacing:-.1px; }
      .switch { position:relative; flex:0 0 auto; width:44px; height:26px; cursor:pointer; }
      .switch input { position:absolute; appearance:none; -webkit-appearance:none; opacity:0; width:0; height:0; border:none; }
      .switch .track { position:absolute; inset:0; border-radius:var(--pill); background:var(--tint-2);
        border:1px solid var(--line); transition:background .22s var(--ease), border-color .22s var(--ease); }
      .switch .track::after { content:""; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%;
        background:var(--surface); box-shadow:0 1px 3px rgba(18,19,23,.3); transition:transform .26s var(--ease), background .22s var(--ease); }
      .switch input:checked + .track { background:var(--accent); border-color:var(--accent); }
      .switch input:checked + .track::after { transform:translateX(18px); background:var(--on-ink); }
      .switch input:focus-visible + .track { box-shadow:0 0 0 3px var(--tint-2); }

      /* ---------- inline per-field generate icon ---------- */
      .qa { position:fixed; z-index:2147483645; width:24px; height:24px; padding:0; border:none; border-radius:var(--pill);
        cursor:pointer; display:none; place-items:center; color:var(--on-accent); background:var(--accent); opacity:0;
        box-shadow:0 2px 8px rgba(26,115,232,.35);
        transition:transform .18s var(--ease), box-shadow .18s var(--ease), opacity .18s var(--ease), background .2s var(--ease); }
      .qa.show { display:grid; opacity:1; animation:qaIn .22s var(--ease); }
      @keyframes qaIn { from{ transform:scale(.5); opacity:0 } to{ transform:scale(1); opacity:1 } }
      .qa:hover { transform:scale(1.12); box-shadow:0 4px 12px rgba(26,115,232,.45); }
      .qa:active { transform:scale(.92); }
      .qa svg { width:13px; height:13px; }
      .qa .qspin { display:none; width:12px; height:12px; border-radius:50%; border:2px solid rgba(255,255,255,.35); border-top-color:currentColor; animation:spin .7s linear infinite; }
      .qa.busy { cursor:progress; opacity:.85; }
      .qa.busy svg { display:none; } .qa.busy .qspin { display:block; }
      .qa.ok { background:var(--green); color:#fff; }
      .qa.err { background:var(--red); color:#fff; animation:qaShake .4s; }
      @keyframes qaShake { 0%,100%{ transform:translateX(0) } 25%{ transform:translateX(-3px) } 75%{ transform:translateX(3px) } }

      /* ---------- review view ---------- */
      .rv-head { font-size:15px; font-weight:500; letter-spacing:-.02em; margin-bottom:12px; display:flex; align-items:center; gap:8px; }
      .rv-head .cnt { font-size:12px; font-weight:500; color:var(--accent); background:var(--accent-soft); padding:2px 10px; border-radius:var(--pill); }
      #reviewList { margin:0 -4px; padding:0 4px; }
      .rrow { padding:13px 0; border-bottom:1px solid var(--line); }
      .rrow:last-child { border-bottom:none; }
      .rrow .rl { font-size:12.5px; margin-bottom:7px; display:flex; gap:6px; align-items:center; }
      .rrow .rname { font-weight:500; color:var(--ink); letter-spacing:-.1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .rrow .req { color:var(--red); font-weight:500; flex:0 0 auto; }
      .rrow .tag { margin-left:auto; flex:0 0 auto; font-size:9.5px; font-weight:500; text-transform:uppercase; letter-spacing:.06em;
        color:var(--ink-3); background:var(--tint); padding:3px 8px; border-radius:var(--pill); }
      .rin { display:flex; gap:8px; align-items:center; }
      .rin .rval { flex:1; min-width:0; }
      .rin .sel { flex:1; min-width:0; } /* the wrapper takes over the row slot from the select */
      /* must out-specify the .rin .rval flex:1 above, or the box stretches across the row */
      .rin .rval[type=checkbox] { flex:0 0 auto; margin-left:2px; }
      .regen { flex:0 0 auto; width:38px; height:38px; border:none; border-radius:var(--pill); background:var(--tint);
        color:var(--ink); cursor:pointer; display:grid; place-items:center; font-size:15px; transition:background .18s var(--ease); }
      .regen:hover { background:var(--tint-2); }
      .regen.spin-on svg { animation:spin .7s linear infinite; }
      .rv-actions { position:sticky; bottom:-28px; z-index:3; display:flex; gap:10px; margin-top:16px; padding:14px 0 0; background:var(--surface); }
      .rv-actions::before { content:""; position:absolute; left:0; right:0; top:-24px; height:24px; pointer-events:none;
        background:linear-gradient(to top, var(--surface) 30%, transparent); }
      .rv-actions .btn { margin-top:0; flex:1; }
      .rv-actions .ghost { margin-top:0; width:auto; flex:0 0 auto; padding:0 18px; }

      #status { margin-top:16px; font-size:13px; font-weight:450; letter-spacing:-.1px; min-height:18px;
        display:flex; align-items:center; justify-content:center; gap:7px; text-align:center; color:var(--ink-2); }
      #status:empty { display:none; margin:0; min-height:0; }
      #status .si { font-size:15px; display:grid; place-items:center; }
      .ok { color:var(--green); } .err { color:var(--red); }
      #status .sub { display:block; margin-top:3px; font-size:12px; color:var(--ink-2); font-weight:400; }
      #status.warn .si { color:#B26A00; }
      #status.pop { animation:spop .4s var(--ease); }
      @keyframes spop { from{ transform:translateY(4px); opacity:0 } to{ transform:none; opacity:1 } }

      details { margin-top:18px; border-top:1px solid var(--line); padding-top:14px; }
      summary { cursor:pointer; font-size:13px; color:var(--ink-2); font-weight:450; letter-spacing:-.1px;
        list-style:none; display:flex; align-items:center; gap:8px; }
      summary::-webkit-details-marker { display:none; }
      summary .gico { font-size:14px; display:grid; place-items:center; transition:transform .28s var(--ease); }
      details[open] summary .gico { transform:rotate(90deg); }
      summary .sico { font-size:15px; display:grid; place-items:center; color:var(--green); }
      .policy { margin:12px 0 2px; padding:0; list-style:none; display:flex; flex-direction:column; gap:9px; }
      .policy li { position:relative; padding-left:14px; font-size:12.5px; line-height:1.6;
        letter-spacing:-.1px; color:var(--ink-3); }
      .policy li::before { content:""; position:absolute; left:0; top:8px; width:5px; height:5px;
        border-radius:50%; background:var(--tint-2); }
      .policy b { font-weight:500; color:var(--ink-2); }
      .policy i { font-style:normal; color:var(--ink-2); }
      .hint { font-size:12.5px; color:var(--ink-3); margin-top:8px; line-height:1.55; letter-spacing:-.1px; }
      .hint b { font-weight:500; color:var(--ink-2); }
      .hint a { color:var(--accent); text-decoration:none; }
      .hint a:hover { text-decoration:underline; }
      code { background:var(--tint-2); border-radius:6px; padding:2px 6px; font-size:11.5px;
        font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
      .badge { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:450; letter-spacing:-.1px;
        margin-left:auto; background:var(--tint); color:var(--ink-2); padding:4px 11px; border-radius:var(--pill); }
      .dot { width:6px; height:6px; border-radius:50%; background:var(--green); }
    </style>

    <button class="bubble" title="AI Form Filler" aria-label="AI Form Filler">${I.sparkles}</button>
    <button class="qa" title="Generate this field with AI" aria-label="Generate this field with AI">${I.sparkles}<span class="qspin"></span></button>

    <div class="overlay">
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="head">
          <button class="x" title="Close">${I.x}</button>
          <h1><span class="logo">${I.sparkles}</span> AI Form Filler</h1>
          <p>Reads every field on this page and fills it in.</p>
        </div>
        <div class="tabs">
          <button class="tab on" id="tabFill"><span class="tico">${I.sparkles}</span> Fill</button>
          <button class="tab" id="tabInstr"><span class="tico">${I.save}</span> Instructions</button>
          <button class="tab" id="tabSettings"><span class="tico">${I.gear}</span> Settings</button>
        </div>
        <div class="body">
         <div id="panelFill">
          <div id="formView">
            <label for="instruction">Instruction <span class="muted">(optional)</span></label>
            <textarea id="instruction" class="field" placeholder="e.g. fill as a 30-year-old engineer from Vietnam"></textarea>

            <div class="row">
              <label for="scope">Fill which fields</label>
              <select id="scope" class="field">
                <option value="all">All fields</option>
                <option value="required">Required only (marked *)</option>
                <option value="optional">Optional only</option>
              </select>
            </div>

            <div class="prev-row">
              <div class="prev-txt">
                <span class="prev-title">Preview before filling</span>
                <span class="prev-sub">Review &amp; edit the AI's values, then apply</span>
              </div>
              <label class="switch"><input type="checkbox" id="reviewToggle" checked /><span class="track"></span></label>
            </div>

            <button id="fillBtn" class="btn"><span class="ico">${I.sparkles}</span><span class="spin"></span><span class="label">Analyze &amp; Fill Form</span></button>
            <button id="undoBtn" class="ghost" hidden><span class="ico">${I.undo}</span> Undo last fill</button>
          </div>

          <div id="reviewView" hidden>
            <div class="rv-head">${I.sparkles} Review values <span class="cnt" id="rvCount">0</span></div>
            <div id="reviewList"></div>
            <div class="rv-actions">
              <button id="backBtn" class="ghost"><span class="ico">${I.back}</span></button>
              <button id="applyBtn" class="btn"><span class="ico">${I.check}</span><span class="spin"></span><span class="label">Apply</span></button>
            </div>
          </div>

          <div id="status"></div>
         </div>

         <div id="panelInstr" hidden>
           <div class="instr-head"><span class="tico">${I.save}</span> Saved instructions <span class="muted2" id="instrCount"></span></div>
           <textarea id="newInstr" class="field" placeholder="Write an instruction to save & reuse…&#10;e.g. fill as a 30-year-old engineer from Vietnam"></textarea>
           <button id="addInstr" class="btn sm"><span class="ico">${I.save}</span><span>Save instruction</span></button>
           <div id="instrList"></div>
           <div class="hint">Click an instruction to use it · the ⭐ one is your <b>default</b> — it pre-fills the box on new pages.</div>
         </div>

         <div id="panelSettings" hidden>
           <div class="instr-head"><span class="tico">${I.gear}</span> Settings <span id="provBadge" class="badge"><span class="dot"></span>OpenRouter</span></div>
           <div id="orBox">
             <div class="row">
               <label for="apiKey">OpenRouter API Key</label>
               <input type="password" id="apiKey" class="field" placeholder="sk-or-v1-..." />
               <div class="hint">Free key at <a href="https://openrouter.ai/settings/keys" target="_blank">openrouter.ai/settings/keys</a> · <a href="https://github.com/haonguyenstech/ai-form-filler#-lấy-openrouter-api-key-miễn-phí" target="_blank">step-by-step guide</a></div>
             </div>
             <div class="row">
               <label for="model">Model (free)</label>
               <select id="model" class="field">
                 <option value="nvidia/nemotron-3-super-120b-a12b:free">Nemotron 3 Super — fast</option>
                 <option value="cohere/north-mini-code:free">North Mini Code — fast</option>
                 <option value="poolside/laguna-s-2.1:free">Laguna S 2.1</option>
                 <option value="nvidia/nemotron-3.5-lightning:free">Nemotron 3.5 Lightning</option>
                 <option value="nvidia/nemotron-3-ultra-550b-a55b:free">Nemotron 3 Ultra</option>
                 <option value="__custom__">Custom…</option>
               </select>
               <input type="text" id="customModel" class="field" placeholder="provider/model:free" style="display:none;margin-top:6px;" />
             </div>
           </div>
           <div class="row">
             <label for="locale">Fake data locale</label>
             <select id="locale" class="field">
               <option value="auto">Auto — follow the page's language</option>
               <option value="en-US">English (US)</option>
               <option value="vi-VN">Tiếng Việt</option>
               <option value="ja-JP">日本語</option>
               <option value="fr-FR">Français</option>
               <option value="de-DE">Deutsch</option>
               <option value="es-ES">Español</option>
             </select>
             <div class="hint">Names, addresses and phone formats · one consistent person per fill</div>
           </div>
           <button id="testConn" class="ghost test" type="button">
             <span class="ico">${I.plug}</span><span class="spin"></span><span class="tlabel">Test connection</span>
           </button>
           <div id="testResult" class="hint"></div>
           <label class="check"><input type="checkbox" id="inlineToggle" checked /><span>Show the <b>✨ generate</b> icon on each field</span></label>
           <label class="check"><input type="checkbox" id="siteToggle" checked /><span>Show the bubble on <b id="siteHost"></b></span></label>
           <div class="hint">Tip: drag the bubble to reposition it · shortcut <code>⌘/Ctrl+Shift+F</code></div>

           <details id="privacy">
             <summary><span class="gico">${I.chevRight}</span><span class="sico">${I.shield}</span> Privacy — what leaves your browser</summary>
             <ul class="policy">
               <li><b>Sent:</b> only a <i>description</i> of each field — its label, name, placeholder, type, whether it's
                   required, its format rules (pattern, min/max, length), and for a dropdown the list of choices — plus any
                   instruction you write and the made-up person to fill as. If the page rejects a value, that value and
                   the page's error message for that one field are sent back so the model can correct it.</li>
               <li><b>Never sent:</b> values already in the fields, the page's text, its URL, your cookies, or anything
                   from other tabs. <b>Password</b> and file inputs are skipped entirely — never read, never filled.</li>
               <li><b>Where:</b> straight to OpenRouter, and nowhere else. There is no analytics, no
                   telemetry and no server of ours — the extension makes exactly one request per fill.</li>
               <li><b>Stored:</b> your settings and saved instructions live in <code>chrome.storage</code> on this
                   machine. Filled values are never recorded.</li>
               <li><b>Worth knowing:</b> dropdown choices are read from the page, so if a select lists real records
                   those option labels do travel with the request.</li>
               <li><b>The free models:</b> providers behind OpenRouter's <code>:free</code> models may log
                   prompts and <b>use them to improve their models</b>. Treat the free tier as public — for
                   anything confidential, pick a paid model and check that provider's terms.</li>
             </ul>
           </details>
         </div>
        </div>
      </div>
    </div>
  `;
  document.documentElement.appendChild(host);

  // Our UI must look like nothing at all to the page. A form inside a page
  // dialog is the case that matters: Radix/shadcn, MUI and Headless UI close
  // their dialog on a pointerdown or focus that lands outside it, and a click
  // on the bubble reached their document listeners as exactly that. Stop every
  // interaction event at the host, after our own shadow listeners have run.
  for (const t of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "contextmenu",
    "touchstart", "touchend", "focusin", "focusout", "keydown", "keyup", "keypress", "input", "change",
    "wheel", "touchmove"]) {
    host.addEventListener(t, (e) => e.stopPropagation());
  }
  // A native <dialog> opened with showModal() makes everything outside it inert —
  // the bubble could not even be clicked. Top-layer popovers stay inert too, so
  // the only way through is to live inside the topmost modal while it is open.
  const placeHost = () => {
    const modals = [...document.querySelectorAll("dialog[open]")].filter((d) => { try { return d.matches(":modal"); } catch (e) { return false; } });
    const target = modals[modals.length - 1] || document.documentElement;
    if (host.parentNode !== target) target.appendChild(host);
  };
  new MutationObserver(placeHost).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["open"], childList: true });

  const $ = (s) => root.querySelector(s);
  const overlay = $(".overlay");
  const statusEl = $("#status");
  const fillBtn = $("#fillBtn");
  const xBtn = $(".x");
  let busy = false; // while filling, the dialog stays open and can't be dismissed
  let inlineOn = true; // per-field ✨ generate icon enabled

  function setStatus(msg, cls = "", icon = "") {
    statusEl.className = cls;
    statusEl.innerHTML = (icon ? `<span class="si">${icon}</span>` : "") + `<span>${msg}</span>`;
    statusEl.classList.remove("pop"); void statusEl.offsetWidth; statusEl.classList.add("pop");
  }

  // ---- custom <select> ---------------------------------------------------
  // The native element is kept in the DOM and stays authoritative: every option
  // click writes to it and re-dispatches `change`, so existing listeners (and
  // anything reading `.value`) never learn that the UI was replaced.
  let openSel = null;
  function closeSel() {
    if (!openSel) return;
    openSel.pop.remove();
    openSel.btn.classList.remove("open");
    openSel.btn.setAttribute("aria-expanded", "false");
    root.querySelector(".body")?.removeEventListener("scroll", closeSel, true);
    openSel = null;
  }
  function placePop(btn, pop) {
    const r = btn.getBoundingClientRect();
    const GAP = 6, MARGIN = 12;
    pop.style.width = r.width + "px";
    pop.style.left = r.left + "px";
    const below = window.innerHeight - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    // flip above only when there is meaningfully more room up there
    if (below < 160 && above > below) {
      pop.style.maxHeight = Math.min(320, above) + "px";
      pop.style.top = ""; pop.style.bottom = window.innerHeight - r.top + GAP + "px";
    } else {
      pop.style.maxHeight = Math.min(320, below) + "px";
      pop.style.bottom = ""; pop.style.top = r.bottom + GAP + "px";
    }
  }
  function openPop(sel, btn) {
    closeSel();
    const pop = document.createElement("div");
    pop.className = "sel-pop";
    pop.setAttribute("role", "listbox");
    pop.innerHTML = [...sel.options].map((o, i) =>
      `<button type="button" class="sel-opt" role="option" data-i="${i}" aria-selected="${i === sel.selectedIndex}">` +
      `<span class="otext">${esc(o.textContent)}</span><span class="otick">${I.check}</span></button>`).join("");
    root.appendChild(pop);
    btn.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    openSel = { sel, btn, pop };
    placePop(btn, pop);
    pop.querySelector(`[data-i="${sel.selectedIndex}"]`)?.scrollIntoView({ block: "nearest" });
    pop.addEventListener("click", (e) => {
      const opt = e.target.closest(".sel-opt");
      if (!opt) return;
      sel.selectedIndex = +opt.dataset.i;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      closeSel();
      btn.focus();
    });
    // the dialog body scrolls under a fixed popover, so follow it by closing
    root.querySelector(".body")?.addEventListener("scroll", closeSel, true);
  }
  function enhanceSelect(sel) {
    if (sel.dataset.aiffSel) return;
    sel.dataset.aiffSel = "1";
    const wrap = document.createElement("div");
    wrap.className = "sel";
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sel-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `<span class="sel-label"></span><span class="chev">${I.chev}</span>`;
    wrap.appendChild(btn);
    const label = btn.querySelector(".sel-label");
    const sync = () => { label.textContent = sel.options[sel.selectedIndex]?.textContent ?? ""; };
    sel.addEventListener("change", sync);
    sel.__aiffSync = sync; // set from code (another tab's change) without firing "change"
    sync();
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openSel && openSel.sel === sel ? closeSel() : openPop(sel, btn);
    });
    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = sel.options.length;
        if (!n) return;
        sel.selectedIndex = (sel.selectedIndex + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }
  const enhanceSelectsIn = (el) => el.querySelectorAll("select:not([data-aiff-sel])").forEach(enhanceSelect);

  // ---- settings ----
  function chosenModel() {
    return $("#model").value === "__custom__" ? $("#customModel").value.trim() : $("#model").value;
  }
  function toggleCustom() { $("#customModel").style.display = $("#model").value === "__custom__" ? "block" : "none"; }
  function saveSettings() {
    chrome.storage.sync.set({
      apiKey: $("#apiKey").value.trim(),
      model: $("#model").value, customModel: $("#customModel").value.trim(),
      scope: $("#scope").value, locale: $("#locale").value,
      review: $("#reviewToggle").checked, inlineIcons: $("#inlineToggle").checked,
    });
  }
  // Applies stored settings, or just the keys another tab changed. Every open tab
  // holds its own copy of this UI; one that never heard of a change kept filling
  // with the old model, and its next save wrote the old model back over the new.
  function applySettings(s) {
    if ("apiKey" in s) $("#apiKey").value = s.apiKey || "";
    if ("model" in s && s.model) {
      $("#model").value = [...$("#model").options].some((o) => o.value === s.model) ? s.model : "__custom__";
    }
    if ("customModel" in s) $("#customModel").value = s.customModel || "";
    if ("scope" in s && s.scope) $("#scope").value = s.scope;
    if ("locale" in s) $("#locale").value = s.locale || "auto";
    if ("review" in s) $("#reviewToggle").checked = s.review !== false;
    if ("inlineIcons" in s) {
      $("#inlineToggle").checked = s.inlineIcons !== false;
      inlineOn = $("#inlineToggle").checked;
      if (!inlineOn && typeof hideQA === "function") hideQA();
    }
    $("#model").__aiffSync?.(); $("#scope").__aiffSync?.(); $("#locale").__aiffSync?.();
    toggleCustom();
  }
  const SETTING_KEYS = ["apiKey", "model", "customModel", "scope", "locale", "review", "inlineIcons"];
  applySettings(await chrome.storage.sync.get(SETTING_KEYS));
  ["apiKey", "model", "customModel", "scope", "locale", "reviewToggle", "inlineToggle"].forEach((id) => $("#" + id).addEventListener("change", saveSettings));
  $("#model").addEventListener("change", toggleCustom);

  // ---- test connection (OpenRouter) ----
  const testBtn = $("#testConn"), testResult = $("#testResult"), testLabel = testBtn.querySelector(".tlabel");
  let testT = null;
  const setTest = (state, label) => {
    clearTimeout(testT);
    testBtn.classList.remove("testing", "ok", "err");
    if (state) testBtn.classList.add(state);
    testLabel.textContent = label;
    // ok/err are a momentary acknowledgement — the button returns to rest after
    if (state === "ok" || state === "err") testT = setTimeout(() => setTest("", "Test connection"), 2600);
  };
  testBtn.addEventListener("click", async () => {
    saveSettings();
    const o = { apiKey: $("#apiKey").value.trim(), model: chosenModel() };
    const fail = (msg) => { testResult.className = "hint err"; testResult.textContent = "✕ " + msg; setTest("err", "Failed"); };
    if (!o.apiKey) return fail("Add your API key first.");
    if (!o.model) return fail("Pick or enter a model first.");
    testBtn.disabled = true;
    setTest("testing", "Testing…");
    testResult.className = "hint"; testResult.textContent = "Contacting " + o.model + "…";
    try {
      const r = await chrome.runtime.sendMessage({ action: "testConnection", opts: o });
      if (!r || !r.ok) throw new Error(r?.error || "Failed");
      testResult.className = "hint ok";
      testResult.textContent = "✓ Connected" + (r.model ? " · " + r.model : "");
      setTest("ok", "Connected");
    } catch (e) {
      fail(e.message);
    } finally { testBtn.disabled = false; }
  });

  // ---- local UI prefs: per-site visibility, bubble position, last instruction ----
  const bubble = $(".bubble");
  const siteName = location.hostname;
  $("#siteHost").textContent = siteName;
  const lp = await chrome.storage.local.get(["aiff_disabled", "aiff_pos", "aiff_instruction"]);
  const disabled = new Set(lp.aiff_disabled || []);
  const siteOn = !disabled.has(siteName);
  $("#siteToggle").checked = siteOn;
  if (!siteOn) bubble.style.display = "none";
  if (lp.aiff_instruction) $("#instruction").value = lp.aiff_instruction;
  if (lp.aiff_pos) {
    bubble.style.left = lp.aiff_pos.left + "px"; bubble.style.top = lp.aiff_pos.top + "px";
    bubble.style.right = "auto"; bubble.style.bottom = "auto";
  }
  $("#siteToggle").addEventListener("change", (e) => {
    if (e.target.checked) { disabled.delete(siteName); bubble.style.display = ""; }
    else { disabled.add(siteName); bubble.style.display = "none"; }
    chrome.storage.local.set({ aiff_disabled: [...disabled] });
  });
  $("#instruction").addEventListener("input", () =>
    chrome.storage.local.set({ aiff_instruction: $("#instruction").value }));

  // ---- open / close (locked while busy) ----
  // A finished fill dismisses the dialog on its own; any deliberate interaction
  // in that window means the user still wants it, so the pending close is dropped.
  const AUTO_CLOSE_MS = 1400;
  let autoCloseT = null;
  const cancelAutoClose = () => { clearTimeout(autoCloseT); autoCloseT = null; };
  $(".dialog").addEventListener("pointerdown", cancelAutoClose, true);
  $(".dialog").addEventListener("keydown", cancelAutoClose, true);

  const open = () => { cancelAutoClose(); overlay.classList.add("open"); };
  const close = () => { if (busy) return; cancelAutoClose(); closeSel(); overlay.classList.remove("open"); };
  const toggle = () => (overlay.classList.contains("open") ? close() : open());
  xBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  // a click anywhere that isn't the open popover dismisses it; Escape peels one
  // layer at a time — the select first, the dialog only once no select is open
  overlay.addEventListener("pointerdown", (e) => { if (openSel && !e.target.closest(".sel-pop, .sel-btn")) closeSel(); }, true);
  const onEscape = () => {
    if (openSel) { closeSel(); return; }
    if (overlay.classList.contains("open")) close();
  };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") onEscape(); });
  // Escape typed inside our UI is ours alone. Radix and Headless UI listen for it
  // in the capture phase on document, which the host-level stop above cannot
  // reach, and a native modal <dialog> would cancel itself — so catch it on the
  // window first (capture runs window → document), and keep the default from
  // closing a native dialog.
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !e.composedPath().includes(host)) return;
    e.stopPropagation(); e.preventDefault();
    onEscape();
  }, true);
  window.addEventListener("resize", closeSel);
  chrome.runtime.onMessage.addListener((msg) => { if (msg.action === "toggleDialog") toggle(); });

  // ---- draggable bubble (click to open, drag to reposition) ----
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  let drag = null, suppressClick = false;
  bubble.addEventListener("pointerdown", (e) => {
    const r = bubble.getBoundingClientRect();
    drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
    bubble.setPointerCapture(e.pointerId);
  });
  bubble.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    const sz = bubble.offsetWidth;
    const nx = clamp(drag.ox + dx, 8, innerWidth - sz - 8);
    const ny = clamp(drag.oy + dy, 8, innerHeight - sz - 8);
    bubble.style.left = nx + "px"; bubble.style.top = ny + "px";
    bubble.style.right = "auto"; bubble.style.bottom = "auto";
    drag.last = { left: nx, top: ny };
  });
  bubble.addEventListener("pointerup", () => {
    if (drag?.moved && drag.last) { suppressClick = true; chrome.storage.local.set({ aiff_pos: drag.last }); }
    drag = null;
  });
  bubble.addEventListener("click", () => { if (suppressClick) { suppressClick = false; return; } open(); });

  // ---- views (form ⇄ review) ----
  const formView = $("#formView"), reviewView = $("#reviewView");
  const applyBtn = $("#applyBtn"), backBtn = $("#backBtn");
  const showForm = () => { reviewView.hidden = true; formView.hidden = false; };
  const showReview = () => { formView.hidden = true; reviewView.hidden = false; };
  let reviewFields = [];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const opts = () => ({ apiKey: $("#apiKey").value.trim(), model: chosenModel(), scope: $("#scope").value, instruction: $("#instruction").value.trim(),
    locale: $("#locale").value, pageLang: document.documentElement.lang || "" });

  function rowInput(f, val) {
    const id = esc(f.id);
    if (f.kind === "input" && f.type === "checkbox")
      return `<input type="checkbox" class="rval" data-id="${id}" ${val === true || val === "true" ? "checked" : ""}>`;
    if (f.kind === "datepicker" || f.type === "date")
      return `<input type="date" class="rval field" data-id="${id}" value="${esc(val)}">`;
    if ((f.kind === "combobox" || f.kind === "select" || f.type === "radio") && Array.isArray(f.options) && f.options.length) {
      const opt = f.options.map((o) =>
        `<option value="${esc(o)}" ${String(o).toLowerCase() === String(val ?? "").toLowerCase() ? "selected" : ""}>${esc(o)}</option>`).join("");
      return `<select class="rval field" data-id="${id}">${opt}</select>`;
    }
    return `<input type="text" class="rval field" data-id="${id}" value="${esc(val)}">`;
  }

  const humanize = (s) =>
    String(s || "").replace(/[_\-.]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim()
      .replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const TYPE_NAME = { date: "Date", email: "Email", tel: "Phone", number: "Number", url: "Website",
    password: "Password", checkbox: "Checkbox", radio: "Choice", select: "Selection" };
  // Never show "field N": prefer detected label, then name/placeholder, then a humanized type name.
  function fieldName(f) {
    // the required marker is rendered separately, so drop any "*" the label already carries
    if (f.label && f.label.trim()) return f.label.trim().replace(/\s*\*+$/, "");
    if (f.name) return humanize(f.name);
    if (f.placeholder) return f.placeholder.trim();
    const t = f.kind === "datepicker" ? "date" : f.kind === "combobox" ? "select" : (f.type || "text");
    return TYPE_NAME[t] || "Text field";
  }

  function renderReview(fields, values) {
    reviewFields = fields;
    $("#rvCount").textContent = fields.length;
    $("#reviewList").innerHTML = fields.map((f, i) => {
      const tag = f.kind === "datepicker" ? "date" : f.kind === "combobox" ? "select" : (f.type || "text");
      return `<div class="rrow" data-id="${esc(f.id)}">
        <div class="rl"><span class="rname">${esc(fieldName(f))}</span>${f.required ? '<span class="req" title="Required">*</span>' : ""}<span class="tag">${esc(tag)}</span></div>
        <div class="rin">${rowInput(f, values[f.id])}<button class="regen" title="Regenerate this value" data-id="${esc(f.id)}">${I.refresh}</button></div>
      </div>`;
    }).join("");
    reviewView.querySelectorAll(".regen").forEach((b) => b.addEventListener("click", () => regenerate(b.dataset.id, b)));
    enhanceSelectsIn(reviewView); // rows are rebuilt from scratch on every render
  }

  const collectValues = () => {
    const out = {};
    reviewView.querySelectorAll(".rval").forEach((el) => { out[el.dataset.id] = el.type === "checkbox" ? el.checked : el.value; });
    return out;
  };

  async function regenerate(id, btn) {
    if (busy) return;
    const field = reviewFields.find((f) => String(f.id) === String(id));
    if (!field) return;
    btn.classList.add("spin-on"); btn.disabled = true;
    try {
      const r = await chrome.runtime.sendMessage({ action: "runRegenerate", opts: { ...opts(), field } });
      if (r?.ok && r.value != null) {
        const input = reviewView.querySelector(`.rval[data-id="${CSS.escape(id)}"]`);
        if (input) {
          if (input.type === "checkbox") input.checked = !!r.value; else input.value = r.value;
          // a select's custom trigger label only refreshes on `change`
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    } catch (e) {} finally { btn.classList.remove("spin-on"); btn.disabled = false; }
  }

  // "Filled 7 of 7 fields", plus what happened on the way: values the page
  // rejected and we corrected, ones it still rejects, and whether the AI was
  // skipped (daily quota, model busy, offline) in favour of local data
  function fillDone(r) {
    const off = r.offline || r.retryOffline;
    let msg = `Filled ${r.filled} of ${r.total} fields${r.offline ? " with offline data" : ""}`;
    if (r.fixed) msg += ` · fixed ${r.fixed} the page rejected`;
    if (r.invalid) msg += ` · ${r.invalid} still invalid`;
    if (off) msg += `<span class="sub">AI unavailable: ${esc(off)}</span>`;
    setStatus(msg, r.invalid || off ? "warn" : "ok", r.invalid || off ? I.alert : I.check);
    fillBtn.classList.remove("loading"); fillBtn.classList.add("done");
    fillBtn.querySelector(".label").textContent = `Filled ${r.filled} field${r.filled === 1 ? "" : "s"}`;
    $("#undoBtn").hidden = !r.canUndo;
    setTimeout(() => { fillBtn.classList.remove("done"); fillBtn.querySelector(".label").textContent = "Analyze & Fill Form"; }, 2600);
    // The work is done and the page shows its own toast, so get out of the way —
    // but leave long enough to read the count, and let any interaction cancel it
    // (reaching for Undo must not race a dialog that is closing under the cursor).
    // `busy` is still true here; it clears before this fires, so close() goes through.
    // a note worth reading stays up; a clean fill gets out of the way
    if (!r.invalid && !off) autoCloseT = setTimeout(close, AUTO_CLOSE_MS);
  }

  // ---- main button: preview (review on) or one-shot fill (review off) ----
  fillBtn.addEventListener("click", async () => {
    if (busy) return;
    const o = opts();
    if (!o.apiKey) { setStatus("Add your OpenRouter API key in Settings.", "err", I.alert); switchTab("settings"); return; }
    if (!o.model) { setStatus("Pick or enter a model.", "err", I.alert); return; }
    saveSettings();

    busy = true; fillBtn.disabled = true; xBtn.disabled = true; fillBtn.classList.add("loading");
    setStatus("Scanning & asking AI…");
    try {
      if ($("#reviewToggle").checked) {
        const r = await chrome.runtime.sendMessage({ action: "runPreview", opts: o });
        if (!r || !r.ok) throw new Error(r?.error || "Unknown error");
        renderReview(r.fields, r.values);
        showReview();
        if (r.offline) setStatus(`Offline data for ${r.fields.length} fields — edit then Apply<span class="sub">AI unavailable: ${esc(r.offline)}</span>`, "warn", I.alert);
        else setStatus(`AI proposed ${r.fields.length} values — edit then Apply`, "");
      } else {
        const r = await chrome.runtime.sendMessage({ action: "runFill", opts: o });
        if (!r || !r.ok) throw new Error(r?.error || "Unknown error");
        fillDone(r);
      }
    } catch (e) {
      setStatus(e.message, "err", I.alert);
    } finally {
      busy = false; fillBtn.disabled = false; xBtn.disabled = false; fillBtn.classList.remove("loading");
    }
  });

  // ---- apply reviewed values ----
  applyBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true; applyBtn.disabled = true; backBtn.disabled = true; xBtn.disabled = true; applyBtn.classList.add("loading");
    setStatus("Applying…");
    try {
      const r = await chrome.runtime.sendMessage({ action: "runApply", values: collectValues(), fields: reviewFields, opts: opts() });
      if (!r || !r.ok) throw new Error(r?.error || "Unknown error");
      applyBtn.classList.remove("loading");
      showForm();
      fillDone(r);
    } catch (e) {
      setStatus(e.message, "err", I.alert); applyBtn.classList.remove("loading");
    } finally {
      busy = false; applyBtn.disabled = false; backBtn.disabled = false; xBtn.disabled = false;
    }
  });
  backBtn.addEventListener("click", () => { if (busy) return; showForm(); setStatus(""); });

  // ---- undo last fill ----
  const undoBtn = $("#undoBtn");
  undoBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true; undoBtn.disabled = true; xBtn.disabled = true;
    setStatus("Undoing…");
    try {
      const r = await chrome.runtime.sendMessage({ action: "runUndo" });
      if (!r || !r.ok) throw new Error(r?.error || "Undo failed");
      const note = r.skipped ? ` (${r.skipped} can't be reverted)` : "";
      setStatus(`Reverted ${r.restored} field${r.restored === 1 ? "" : "s"}${note}`, "ok", I.undo);
      undoBtn.hidden = true;
    } catch (e) {
      setStatus(e.message, "err", I.alert);
    } finally {
      busy = false; undoBtn.disabled = false; xBtn.disabled = false;
    }
  });

  // ---- tabs (Fill ⇄ Instructions) -------------------------------------------
  function switchTab(name) {
    $("#tabFill").classList.toggle("on", name === "fill");
    $("#tabInstr").classList.toggle("on", name === "instr");
    $("#tabSettings").classList.toggle("on", name === "settings");
    $("#panelFill").hidden = name !== "fill";
    $("#panelInstr").hidden = name !== "instr";
    $("#panelSettings").hidden = name !== "settings";
  }
  $("#tabFill").addEventListener("click", () => switchTab("fill"));
  $("#tabInstr").addEventListener("click", () => { renderInstr(); switchTab("instr"); });
  $("#tabSettings").addEventListener("click", () => switchTab("settings"));

  // ---- stored instructions + default (managed in the Instructions tab) ------
  const DEFAULT_PRESETS = [
    "Fill as a 30-year-old software engineer from Vietnam",
    "Realistic US-based customer, professional tone",
    "Minimal valid test data only",
    "Coherent random data for one fictional person",
  ];
  let presets = [];
  let instrDefault = ""; // text of the preset marked as default (pre-fills new pages)
  const instrList = $("#instrList"), newInstr = $("#newInstr");
  const persistPresets = () => chrome.storage.sync.set({ instrPresets: presets, instrDefault });

  function useInstr(text) { $("#instruction").value = text; chrome.storage.local.set({ aiff_instruction: text }); switchTab("fill"); }
  function renderInstr() {
    $("#instrCount").textContent = presets.length ? presets.length + " saved" : "";
    instrList.innerHTML = presets.length
      ? presets.map((p, i) => `<div class="irow" data-i="${i}">
          <button class="istar ${p === instrDefault ? "on" : ""}" data-i="${i}" title="${p === instrDefault ? "Default — click to unset" : "Set as default"}">★</button>
          <div class="itext" data-i="${i}" title="Use this instruction">${esc(p)}</div>
          <button class="idel" data-i="${i}" title="Delete">${I.trash}</button></div>`).join("")
      : `<div class="iempty">No saved instructions yet.<br>Write one above and hit Save.</div>`;
    instrList.querySelectorAll(".istar").forEach((b) => b.onclick = () => {
      const t = presets[+b.dataset.i]; instrDefault = instrDefault === t ? "" : t; persistPresets(); renderInstr();
    });
    instrList.querySelectorAll(".itext").forEach((b) => b.onclick = () => useInstr(presets[+b.dataset.i]));
    instrList.querySelectorAll(".idel").forEach((b) => b.onclick = () => {
      const t = presets[+b.dataset.i]; presets.splice(+b.dataset.i, 1); if (instrDefault === t) instrDefault = "";
      persistPresets(); renderInstr();
    });
  }
  $("#addInstr").addEventListener("click", () => {
    const t = newInstr.value.trim();
    if (!t) { newInstr.focus(); return; }
    if (!presets.includes(t)) { presets.unshift(t); persistPresets(); }
    newInstr.value = ""; renderInstr();
  });

  const psStore = await chrome.storage.sync.get(["instrPresets", "instrDefault"]);
  presets = Array.isArray(psStore.instrPresets) ? psStore.instrPresets : DEFAULT_PRESETS.slice();
  instrDefault = psStore.instrDefault || "";
  if (!Array.isArray(psStore.instrPresets)) persistPresets(); // seed defaults once on first run
  if (!$("#instruction").value && instrDefault) $("#instruction").value = instrDefault; // apply default
  renderInstr();

  // settings are loaded by now, so every static <select> has its final value
  enhanceSelectsIn(root);

  chrome.storage.onChanged.addListener((changes, area) => {
    const fresh = (keys) => Object.fromEntries(keys.filter((k) => k in changes).map((k) => [k, changes[k].newValue]));
    if (area === "sync") {
      const set = fresh(SETTING_KEYS);
      if (Object.keys(set).length) applySettings(set);
      if ("instrPresets" in changes || "instrDefault" in changes) {
        if ("instrPresets" in changes && Array.isArray(changes.instrPresets.newValue)) presets = changes.instrPresets.newValue;
        if ("instrDefault" in changes) instrDefault = changes.instrDefault.newValue || "";
        renderInstr();
      }
    } else if (area === "local" && "aiff_disabled" in changes) {
      // hiding the bubble on a site from one tab hides it in that site's other tabs
      disabled.clear(); (changes.aiff_disabled.newValue || []).forEach((h) => disabled.add(h));
      const on = !disabled.has(siteName);
      $("#siteToggle").checked = on;
      bubble.style.display = on ? "" : "none";
    }
  });

  // ---- inline per-field ✨ generate icon -------------------------------------
  // A single floating button follows the focused/hovered text field. Clicking it
  // asks the AI for just that one field (reusing the runRegenerate path) and fills
  // it in place. Native inputs fill fine from the content script — no MAIN world.
  const qaIcon = $(".qa");
  let qaTarget = null, qaBusy = false, qaHideT = null;
  const INPUT_TYPES = ["text", "email", "tel", "url", "search", "number", ""];

  const qaEligible = (el) => {
    if (!inlineOn || !el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA") return false;
    if (el.disabled || el.readOnly) return false;
    if (tag === "INPUT" && !INPUT_TYPES.includes((el.type || "text").toLowerCase())) return false;
    if (!el.offsetWidth && !el.offsetHeight) return false;
    if (el.closest("#__aiff_host")) return false; // never our own UI
    return true;
  };

  const qaLabel = (el) => {
    const c = (t) => (t || "").replace(/\s+/g, " ").trim();
    if (el.id) { const x = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (x && c(x.innerText)) return c(x.innerText); }
    const pl = el.closest("label"); if (pl && c(pl.innerText)) return c(pl.innerText);
    if (c(el.getAttribute("aria-label"))) return c(el.getAttribute("aria-label"));
    let n = el;
    for (let i = 0; i < 5 && n.parentElement; i++) {
      n = n.parentElement;
      const cand = n.querySelector('label,[data-slot="form-label"]');
      if (cand && !cand.contains(el)) { const t = c(cand.innerText); if (t && t.length < 70) return t; }
    }
    return c(el.placeholder) || c(el.name);
  };

  const qaMeta = (el) => ({
    id: "q", type: el.tagName === "TEXTAREA" ? "textarea" : (el.type || "text").toLowerCase(),
    label: qaLabel(el), name: el.name || "", placeholder: el.placeholder || "",
    required: el.required || el.getAttribute("aria-required") === "true",
    maxLength: el.maxLength > 0 ? el.maxLength : null,
    ...Object.fromEntries(["pattern", "min", "max", "step"].map((a) => [a, el.getAttribute(a)]).filter(([, v]) => v !== null && v !== "" && v !== "any")),
    ...(el.minLength > 0 ? { minLength: el.minLength } : {}),
  });

  const fillInput = (el, value) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, "value");
    el.focus();
    if (d && d.set) d.set.call(el, String(value)); else el.value = String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const flashField = (el) => {
    const o = el.style.outline, off = el.style.outlineOffset;
    el.style.outline = "2px solid #1A73E8"; el.style.outlineOffset = "2px";
    setTimeout(() => { el.style.outline = o; el.style.outlineOffset = off; }, 1100);
  };
  const qaFlash = (cls, msg) => {
    qaIcon.classList.add(cls); if (msg) qaIcon.title = msg;
    setTimeout(() => { qaIcon.classList.remove(cls); qaIcon.title = "Generate this field with AI"; }, 1500);
  };

  const positionQA = () => {
    if (!qaTarget) return;
    const r = qaTarget.getBoundingClientRect();
    if (r.width < 40 || r.bottom < 4 || r.top > innerHeight - 4) { hideQA(); return; }
    const sz = 24;
    qaIcon.style.left = Math.round(r.right - sz - 6) + "px";
    qaIcon.style.top = Math.round(qaTarget.tagName === "TEXTAREA" ? r.top + 6 : r.top + (r.height - sz) / 2) + "px";
  };
  const showQA = (el) => { if (!qaEligible(el)) return; clearTimeout(qaHideT); qaTarget = el; positionQA(); qaIcon.classList.add("show"); };
  function hideQA() { if (qaBusy) return; qaIcon.classList.remove("show"); qaTarget = null; }
  const deferHide = () => {
    clearTimeout(qaHideT);
    qaHideT = setTimeout(() => {
      if (qaBusy) return;
      if (document.activeElement === qaTarget) return;
      if (qaIcon.matches(":hover")) return;
      if (qaTarget && qaTarget.matches(":hover")) return;
      hideQA();
    }, 240);
  };

  async function qaGenerate() {
    if (qaBusy || !qaTarget) return;
    const el = qaTarget;
    const o = opts();
    if (!o.apiKey) { qaFlash("err", "Add OpenRouter key in Settings"); return; }
    if (!o.model) { qaFlash("err", "Pick a model in Settings"); return; }
    qaBusy = true; qaIcon.classList.remove("ok", "err"); qaIcon.classList.add("busy");
    try {
      const r = await chrome.runtime.sendMessage({ action: "runRegenerate", opts: { ...o, field: qaMeta(el) } });
      if (!r || !r.ok) throw new Error(r?.error || "Failed");
      if (r.value == null || r.value === "") throw new Error("Empty value");
      fillInput(el, r.value); flashField(el);
      qaIcon.classList.remove("busy"); qaIcon.classList.add("ok");
      setTimeout(() => qaIcon.classList.remove("ok"), 900);
    } catch (e) {
      qaIcon.classList.remove("busy"); qaFlash("err", e.message);
    } finally { qaBusy = false; }
  }

  document.addEventListener("focusin", (e) => { if (qaEligible(e.target)) showQA(e.target); }, true);
  document.addEventListener("focusout", () => deferHide(), true);
  document.addEventListener("mouseover", (e) => { if (qaEligible(e.target)) showQA(e.target); }, true);
  document.addEventListener("mouseout", (e) => { if (qaTarget && e.target === qaTarget) deferHide(); }, true);
  qaIcon.addEventListener("mouseenter", () => clearTimeout(qaHideT));
  qaIcon.addEventListener("mouseleave", () => deferHide());
  qaIcon.addEventListener("mousedown", (e) => e.preventDefault()); // keep the field focused
  qaIcon.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); qaGenerate(); });
  addEventListener("scroll", () => { if (qaTarget) positionQA(); }, true);
  addEventListener("resize", () => { if (qaTarget) positionQA(); });
  $("#inlineToggle").addEventListener("change", (e) => { inlineOn = e.target.checked; if (!inlineOn) hideQA(); });
})();
