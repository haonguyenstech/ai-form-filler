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
    save:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M8 3v5h7"/><path d="M12 12v6M9 15h6"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>',
  };

  const host = document.createElement("div");
  host.id = "__aiff_host";
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
      svg { width: 1em; height: 1em; display: block; }

      /* ---------- bubble ---------- */
      .bubble {
        position: fixed; right: 24px; bottom: 24px; width: 58px; height: 58px; border: none; padding: 0;
        border-radius: 50%; cursor: pointer; z-index: 2147483646; color: #fff; font-size: 26px;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 55%, #d946ef 100%);
        display: grid; place-items: center; isolation: isolate;
        box-shadow: 0 10px 28px rgba(99,102,241,.5), inset 0 1px 0 rgba(255,255,255,.35);
        animation: float 4s ease-in-out infinite;
        transition: transform .2s cubic-bezier(.2,.9,.3,1.3), box-shadow .2s;
      }
      .bubble::before {
        content: ""; position: absolute; inset: -4px; border-radius: 50%; z-index: -1;
        background: linear-gradient(135deg, #6366f1, #d946ef); filter: blur(10px); opacity: .55;
        animation: glow 2.6s ease-in-out infinite;
      }
      .bubble:hover { transform: scale(1.1) rotate(-8deg); }
      .bubble:active { transform: scale(.94); }
      @keyframes float { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-5px) } }
      @keyframes glow { 0%,100%{ opacity:.4 } 50%{ opacity:.75 } }

      /* ---------- overlay + dialog ---------- */
      .overlay {
        position: fixed; inset: 0; z-index: 2147483647; display: none;
        align-items: center; justify-content: center; padding: 20px;
        background: rgba(10,12,20,.55); backdrop-filter: blur(5px);
      }
      .overlay.open { display: flex; animation: fade .22s ease; }
      @keyframes fade { from{opacity:0} to{opacity:1} }

      .dialog {
        position: relative; display: flex; flex-direction: column;
        width: 384px; max-width: 100%; max-height: calc(100vh - 40px); overflow: hidden;
        border-radius: 20px; background: #fff; color: #0f172a;
        box-shadow: 0 30px 80px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.06);
        animation: pop .3s cubic-bezier(.2,.9,.3,1.25);
      }
      @keyframes pop { 0%{ transform: scale(.88) translateY(14px); opacity:0 } 100%{ transform: scale(1) translateY(0); opacity:1 } }
      @media (prefers-color-scheme: dark) { .dialog { background:#14161d; color:#e8eaf0; } }

      .head {
        position: relative; flex: 0 0 auto; overflow: hidden; padding: 20px 20px 18px; color: #fff;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 55%, #d946ef 110%);
      }
      .head::after { content:""; position:absolute; top:-60%; right:-10%; width:220px; height:220px; border-radius:50%;
        background: radial-gradient(circle, rgba(255,255,255,.25), transparent 60%); pointer-events:none; }
      .head h1 { margin:0; font-size:16px; font-weight:750; display:flex; align-items:center; gap:10px; letter-spacing:-.01em; }
      .head p { margin:5px 0 0; font-size:11.5px; opacity:.85; }
      .logo { width:30px; height:30px; border-radius:9px; background:rgba(255,255,255,.2); display:grid; place-items:center;
        font-size:17px; box-shadow: inset 0 1px 0 rgba(255,255,255,.3); }
      .x { position:absolute; top:16px; right:16px; width:30px; height:30px; border:none; border-radius:9px; padding:0;
        background:rgba(255,255,255,.16); color:#fff; font-size:15px; cursor:pointer; display:grid; place-items:center;
        transition: background .15s, transform .15s; }
      .x:hover { background:rgba(255,255,255,.3); transform: rotate(90deg); }
      .x:disabled { opacity:.4; cursor:not-allowed; }

      .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 18px 20px 20px; }
      .body::-webkit-scrollbar { width: 7px; } .body::-webkit-scrollbar-thumb { background: #d8dce6; border-radius: 6px; }
      @media (prefers-color-scheme: dark){ .body::-webkit-scrollbar-thumb { background: #313643; } }
      /* fade each view in on show — masks the height change so no flash/white-bar on swap */
      #formView, #reviewView { animation: viewIn .26s cubic-bezier(.2,.8,.2,1) both; }
      @keyframes viewIn { from{ opacity:0; transform:translateY(6px) } to{ opacity:1; transform:none } }
      #formView[hidden], #reviewView[hidden] { display:none; }
      label { display:block; font-weight:650; margin-bottom:7px; font-size:12px; }
      .muted { color:#94a3b8; font-weight:400; }
      .field { width:100%; padding:10px 12px; border:1.5px solid #e6e9ef; border-radius:11px; font-size:13px;
        background:#f7f8fb; color:inherit; font-family:inherit; transition:border-color .15s, box-shadow .15s, background .15s; }
      .field:focus { outline:none; border-color:#8b5cf6; background:#fff; box-shadow:0 0 0 4px rgba(139,92,246,.16); }
      textarea.field { resize:vertical; min-height:50px; line-height:1.45; }
      @media (prefers-color-scheme: dark) { .field { background:#1b1e27; border-color:#2a2e3a; } .field:focus { background:#1f2330; } }
      .row { margin-top:12px; }

      /* tabs */
      .tabs { flex:0 0 auto; display:flex; gap:2px; padding:10px 14px 0; border-bottom:1px solid #eef1f6; }
      @media (prefers-color-scheme: dark){ .tabs{ border-color:#232733 } }
      .tab { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:5px; padding:10px 5px; border:none;
        background:transparent; color:#94a3b8; font-size:12px; font-weight:700; cursor:pointer; position:relative; white-space:nowrap;
        border-radius:9px 9px 0 0; transition:color .15s, background .15s; font-family:inherit; }
      .tab .tico { font-size:14px; display:grid; place-items:center; }
      .tab:hover { color:#64748b; background:#f7f8fb; }
      .tab.on { color:#8b5cf6; }
      .tab.on::after { content:""; position:absolute; left:12px; right:12px; bottom:-1px; height:2.5px; border-radius:2px;
        background:linear-gradient(90deg,#6366f1,#8b5cf6); }
      @media (prefers-color-scheme: dark){ .tab:hover{ background:#1b1e27 } }

      /* instructions tab */
      .instr-head { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:750; margin-bottom:11px; }
      .instr-head .tico { color:#8b5cf6; font-size:15px; display:grid; place-items:center; }
      .instr-head .muted2 { margin-left:auto; font-size:11px; font-weight:600; color:#94a3b8; }
      .btn.sm { margin-top:10px; padding:11px; font-size:13px; }
      #instrList { margin-top:14px; display:flex; flex-direction:column; gap:8px; }
      .irow { display:flex; align-items:center; gap:9px; padding:10px 11px; border:1.5px solid #eef1f6; border-radius:12px;
        background:#f7f8fb; transition:border-color .15s; animation:viewIn .22s ease both; }
      .irow:hover { border-color:#d8dce6; }
      @media (prefers-color-scheme: dark){ .irow{ background:#1b1e27; border-color:#262a36 } }
      .istar { flex:0 0 auto; width:26px; height:26px; border:none; border-radius:7px; background:transparent; color:#cbd0db;
        cursor:pointer; font-size:16px; line-height:1; display:grid; place-items:center; transition:color .15s, transform .15s; }
      .istar:hover { transform:scale(1.18); color:#f59e0b; } .istar.on { color:#f59e0b; }
      .itext { flex:1; min-width:0; font-size:12px; line-height:1.45; color:#334155; cursor:pointer;
        overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
      .itext:hover { color:#8b5cf6; }
      @media (prefers-color-scheme: dark){ .itext{ color:#cdd2de } }
      .idel { flex:0 0 auto; width:28px; height:28px; border:none; border-radius:7px; background:transparent; color:#cbd0db;
        cursor:pointer; display:grid; place-items:center; transition:color .15s, background .15s; }
      .idel svg { width:15px; height:15px; }
      .idel:hover { color:#ef4444; background:#fef2f2; }
      @media (prefers-color-scheme: dark){ .idel:hover{ background:#2a1b1f } }
      .iempty { font-size:12px; color:#94a3b8; text-align:center; padding:22px 10px; line-height:1.5; }

      .btn { position:relative; overflow:hidden; width:100%; margin-top:18px; padding:13px; border:none; border-radius:13px;
        cursor:pointer; color:#fff; font-size:14px; font-weight:750; letter-spacing:.01em;
        display:inline-flex; align-items:center; justify-content:center; gap:8px;
        background:linear-gradient(135deg, #6366f1, #8b5cf6 60%, #a855f7);
        box-shadow:0 6px 20px rgba(99,102,241,.4); transition:transform .1s, box-shadow .18s, filter .18s; }
      .btn:hover { transform:translateY(-1px); filter:brightness(1.06); box-shadow:0 10px 26px rgba(99,102,241,.5); }
      .btn:active { transform:translateY(0); }
      .btn:disabled { cursor:progress; }
      .btn .ico { font-size:17px; display:grid; place-items:center; }
      .btn.loading { background:linear-gradient(135deg,#818cf8,#a78bfa); }
      .btn.loading::before { content:""; position:absolute; inset:0;
        background:linear-gradient(100deg, transparent 20%, rgba(255,255,255,.35) 50%, transparent 80%);
        transform:translateX(-100%); animation:shimmer 1.2s infinite; }
      @keyframes shimmer { to{ transform:translateX(100%) } }
      .btn.done { background:linear-gradient(135deg,#16a34a,#22c55e); box-shadow:0 6px 20px rgba(34,197,94,.45); }
      .spin { width:16px; height:16px; border-radius:50%; border:2.2px solid rgba(255,255,255,.4); border-top-color:#fff;
        animation:spin .7s linear infinite; }
      @keyframes spin { to{ transform:rotate(360deg) } }
      .btn.loading .ico, .btn:not(.loading) .spin { display:none; }

      .ghost { margin-top:10px; width:100%; padding:9px; border:1.5px solid #e6e9ef; border-radius:11px; background:transparent;
        color:#64748b; font-size:12.5px; font-weight:650; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:7px;
        transition:background .15s, border-color .15s, color .15s; }
      .ghost:hover { border-color:#cbd0db; background:#f7f8fb; color:#0f172a; }
      .ghost[hidden] { display:none; }
      .ghost .ico { font-size:14px; display:grid; place-items:center; }
      @media (prefers-color-scheme: dark){ .ghost{ border-color:#2a2e3a } .ghost:hover{ background:#1b1e27; color:#e8eaf0 } }
      .check { display:flex; align-items:center; gap:9px; font-size:12px; font-weight:600; margin-top:14px; cursor:pointer; }
      .check input { width:16px; height:16px; accent-color:#8b5cf6; cursor:pointer; }
      .grip { position:absolute; inset:0; cursor:grab; } .grip:active { cursor:grabbing; }

      /* preview toggle (in form view, above the fill button) */
      .prev-row { display:flex; align-items:center; gap:12px; margin-top:18px; padding:12px 14px; border-radius:13px;
        background:linear-gradient(135deg, rgba(139,92,246,.07), rgba(99,102,241,.05));
        border:1.5px solid rgba(139,92,246,.16); }
      @media (prefers-color-scheme: dark){ .prev-row{ background:rgba(139,92,246,.1); border-color:rgba(139,92,246,.24) } }
      .prev-txt { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
      .prev-title { font-size:12.5px; font-weight:700; letter-spacing:-.01em; }
      .prev-sub { font-size:10.5px; color:#94a3b8; line-height:1.35; }
      .switch { position:relative; flex:0 0 auto; width:42px; height:24px; cursor:pointer; }
      .switch input { position:absolute; opacity:0; width:0; height:0; }
      .switch .track { position:absolute; inset:0; border-radius:99px; background:#cbd0db; transition:background .22s ease; }
      @media (prefers-color-scheme: dark){ .switch .track{ background:#3a3f4d } }
      .switch .track::after { content:""; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%;
        background:#fff; box-shadow:0 2px 5px rgba(0,0,0,.25); transition:transform .22s cubic-bezier(.3,1.4,.5,1); }
      .switch input:checked + .track { background:linear-gradient(135deg,#6366f1,#8b5cf6); }
      .switch input:checked + .track::after { transform:translateX(18px); }
      .switch input:focus-visible + .track { box-shadow:0 0 0 4px rgba(139,92,246,.25); }

      /* inline per-field generate icon (floats over the focused/hovered input) */
      .qa { position:fixed; z-index:2147483645; width:24px; height:24px; padding:0; border:none; border-radius:7px;
        cursor:pointer; display:none; place-items:center; color:#fff;
        background:linear-gradient(135deg,#6366f1,#8b5cf6); opacity:0;
        box-shadow:0 3px 10px rgba(99,102,241,.45), inset 0 1px 0 rgba(255,255,255,.3);
        transition:transform .15s cubic-bezier(.2,.9,.3,1.3), box-shadow .15s, opacity .15s, background .2s; }
      .qa.show { display:grid; opacity:1; animation:qaIn .2s cubic-bezier(.2,.9,.3,1.3); }
      @keyframes qaIn { from{ transform:scale(.4); opacity:0 } to{ transform:scale(1); opacity:1 } }
      .qa:hover { transform:scale(1.15); box-shadow:0 5px 14px rgba(99,102,241,.6); }
      .qa:active { transform:scale(.92); }
      .qa svg { width:14px; height:14px; }
      .qa .qspin { display:none; width:13px; height:13px; border-radius:50%; border:2px solid rgba(255,255,255,.45); border-top-color:#fff; animation:spin .7s linear infinite; }
      .qa.busy { cursor:progress; background:linear-gradient(135deg,#818cf8,#a78bfa); }
      .qa.busy svg { display:none; } .qa.busy .qspin { display:block; }
      .qa.ok { background:linear-gradient(135deg,#16a34a,#22c55e); }
      .qa.err { background:linear-gradient(135deg,#dc2626,#ef4444); animation:qaShake .4s; }
      @keyframes qaShake { 0%,100%{ transform:translateX(0) } 25%{ transform:translateX(-3px) } 75%{ transform:translateX(3px) } }

      /* review view */
      .rv-head { font-size:13px; font-weight:700; margin-bottom:10px; display:flex; align-items:center; gap:7px; }
      .rv-head .cnt { font-size:11px; font-weight:700; color:#8b5cf6; background:rgba(139,92,246,.12); padding:2px 8px; border-radius:99px; }
      #reviewList { margin:0 -4px; padding:0 4px; }
      .rrow { padding:11px 0; border-bottom:1px solid #f1f3f8; }
      .rrow:last-child { border-bottom:none; }
      @media (prefers-color-scheme: dark){ .rrow{ border-color:#232733 } }
      .rrow .rl { font-size:11.5px; margin-bottom:6px; display:flex; gap:6px; align-items:center; }
      .rrow .rname { font-weight:700; color:#334155; letter-spacing:-.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      @media (prefers-color-scheme: dark){ .rrow .rname{ color:#cdd2de } }
      .rrow .req { color:#ef4444; font-weight:800; flex:0 0 auto; }
      .rrow .tag { margin-left:auto; flex:0 0 auto; font-size:8.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#94a3b8; background:#f1f5f9; padding:2px 7px; border-radius:6px; }
      @media (prefers-color-scheme: dark){ .rrow .tag{ background:#222633 } }
      .rin { display:flex; gap:7px; align-items:center; }
      .rin .rval { flex:1; min-width:0; }
      .rin .rval[type=checkbox] { flex:0 0 auto; width:18px; height:18px; accent-color:#8b5cf6; }
      .regen { flex:0 0 auto; width:34px; height:34px; border:1.5px solid #e6e9ef; border-radius:10px; background:#f7f8fb;
        color:#8b5cf6; cursor:pointer; display:grid; place-items:center; font-size:15px; transition:background .15s, transform .3s; }
      .regen:hover { background:#efeefe; }
      .regen.spin-on svg { animation:spin .7s linear infinite; }
      @media (prefers-color-scheme: dark){ .regen{ background:#1b1e27; border-color:#2a2e3a } }
      .rv-actions { position:sticky; bottom:-20px; z-index:3; display:flex; gap:9px; margin-top:14px; padding:12px 0 0; background:#fff; }
      .rv-actions::before { content:""; position:absolute; left:0; right:0; top:-22px; height:22px; pointer-events:none;
        background:linear-gradient(to top, #fff 30%, transparent); }
      @media (prefers-color-scheme: dark){ .rv-actions{ background:#14161d } .rv-actions::before{ background:linear-gradient(to top,#14161d 30%,transparent) } }
      .rv-actions .btn { margin-top:0; flex:1; }
      .rv-actions .ghost { margin-top:0; width:auto; flex:0 0 auto; padding:0 16px; }

      #status { margin-top:13px; font-size:12px; min-height:16px; display:flex; align-items:center; justify-content:center; gap:6px; text-align:center; }
      #status:empty { display:none; margin:0; min-height:0; }
      #status .si { font-size:14px; display:grid; place-items:center; }
      .ok { color:#16a34a; } .err { color:#dc2626; }
      #status.pop { animation:spop .45s cubic-bezier(.2,.9,.3,1.3); }
      @keyframes spop { 0%{ transform:scale(.7); opacity:0 } 60%{ transform:scale(1.12) } 100%{ transform:scale(1); opacity:1 } }

      details { margin-top:16px; border-top:1px solid #eef1f6; padding-top:13px; }
      @media (prefers-color-scheme: dark){ details{ border-color:#262a36 } }
      summary { cursor:pointer; font-size:12px; color:#64748b; font-weight:650; list-style:none; display:flex; align-items:center; gap:7px; }
      summary::-webkit-details-marker { display:none; }
      summary .gico { font-size:14px; display:grid; place-items:center; transition:transform .3s; }
      details[open] summary .gico { transform:rotate(90deg); }
      .hint { font-size:11px; color:#64748b; margin-top:7px; line-height:1.55; }
      .hint a { color:#8b5cf6; }
      code { background:#f1f5f9; border-radius:5px; padding:1px 5px; font-size:10.5px; }
      @media (prefers-color-scheme: dark){ code{ background:#222633 } }
      .badge { display:inline-flex; align-items:center; gap:5px; font-size:10px; font-weight:750; margin-left:auto;
        background:rgba(22,163,74,.14); color:#16a34a; padding:3px 9px; border-radius:99px; }
      .dot { width:6px; height:6px; border-radius:50%; background:#16a34a; box-shadow:0 0 0 3px rgba(22,163,74,.18); }
    </style>

    <button class="bubble" title="AI Form Filler" aria-label="AI Form Filler">${I.sparkles}</button>
    <button class="qa" title="Generate this field with AI" aria-label="Generate this field with AI">${I.sparkles}<span class="qspin"></span></button>

    <div class="overlay">
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="head">
          <button class="x" title="Close">${I.x}</button>
          <h1><span class="logo">${I.bot}</span> AI Form Filler</h1>
          <p>Analyze &amp; auto-fill every field on this page.</p>
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
           <div class="instr-head"><span class="tico">${I.gear}</span> Settings <span id="provBadge" class="badge"><span class="dot"></span>DeepSeek · free</span></div>
           <div class="row">
             <label for="provider">AI Provider</label>
             <select id="provider" class="field">
               <option value="deepseek">DeepSeek (free · no proxy)</option>
               <option value="openrouter">OpenRouter (needs key)</option>
             </select>
           </div>
           <div id="deepseekBox">
             <div class="hint">Uses the free <b>DeepSeek</b> model directly over the internet — no API key, no local proxy, nothing to start. ✨ recommended.</div>
           </div>
           <div id="orBox" style="display:none;">
             <div class="row">
               <label for="apiKey">OpenRouter API Key</label>
               <input type="password" id="apiKey" class="field" placeholder="sk-or-v1-..." />
               <div class="hint">Free key at <a href="https://openrouter.ai/keys" target="_blank">openrouter.ai/keys</a></div>
             </div>
             <div class="row">
               <label for="model">Model (free)</label>
               <select id="model" class="field">
                 <option value="deepseek/deepseek-chat-v3.1:free">DeepSeek V3.1 (free)</option>
                 <option value="deepseek/deepseek-r1:free">DeepSeek R1 (free)</option>
                 <option value="google/gemini-2.0-flash-exp:free">Gemini 2.0 Flash (free)</option>
                 <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B (free)</option>
                 <option value="__custom__">Custom…</option>
               </select>
               <input type="text" id="customModel" class="field" placeholder="provider/model:free" style="display:none;margin-top:6px;" />
             </div>
           </div>
           <button id="testConn" class="ghost" type="button"><span class="ico">${I.bot}</span> Test connection</button>
           <div id="testResult" class="hint"></div>
           <label class="check"><input type="checkbox" id="inlineToggle" checked /> Show <b>✨ generate</b> icon on each field</label>
           <label class="check"><input type="checkbox" id="siteToggle" checked /> Show bubble on <b id="siteHost"></b></label>
           <div class="hint">Tip: drag the bubble to reposition it · shortcut <code>⌘/Ctrl+Shift+F</code></div>
         </div>
        </div>
      </div>
    </div>
  `;
  document.documentElement.appendChild(host);

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

  // ---- settings ----
  function chosenModel() {
    const p = $("#provider").value;
    if (p === "deepseek") return "deepseek-v4-flash-free";
    return $("#model").value === "__custom__" ? $("#customModel").value.trim() : $("#model").value;
  }
  function toggleCustom() { $("#customModel").style.display = $("#model").value === "__custom__" ? "block" : "none"; }
  function toggleProvider() {
    const p = $("#provider").value;
    $("#deepseekBox").style.display = p === "deepseek" ? "block" : "none";
    $("#orBox").style.display = p === "openrouter" ? "block" : "none";
    const badges = {
      deepseek: '<span class="dot"></span>DeepSeek · free',
      openrouter: '<span class="dot" style="background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.18)"></span>OpenRouter',
    };
    $("#provBadge").innerHTML = badges[p] || badges.deepseek;
  }
  function saveSettings() {
    chrome.storage.sync.set({
      provider: $("#provider").value, apiKey: $("#apiKey").value.trim(),
      model: $("#model").value, customModel: $("#customModel").value.trim(), scope: $("#scope").value,
      review: $("#reviewToggle").checked, inlineIcons: $("#inlineToggle").checked,
    });
  }
  const s = await chrome.storage.sync.get(["provider", "apiKey", "model", "customModel", "scope", "review", "inlineIcons"]);
  $("#provider").value = s.provider || "deepseek";
  if (!$("#provider").value) $("#provider").value = "deepseek"; // dropped/unknown provider -> default
  if (s.apiKey) $("#apiKey").value = s.apiKey;
  if (s.model && [...$("#model").options].some((o) => o.value === s.model)) $("#model").value = s.model;
  else if (s.model) $("#model").value = "__custom__";
  if (s.customModel) $("#customModel").value = s.customModel;
  if (s.scope) $("#scope").value = s.scope;
  if (s.review === false) $("#reviewToggle").checked = false;
  if (s.inlineIcons === false) $("#inlineToggle").checked = false;
  inlineOn = $("#inlineToggle").checked;
  toggleCustom(); toggleProvider();
  ["provider", "apiKey", "model", "customModel", "scope", "reviewToggle", "inlineToggle"].forEach((id) => $("#" + id).addEventListener("change", saveSettings));
  $("#provider").addEventListener("change", toggleProvider);
  $("#model").addEventListener("change", toggleCustom);

  // ---- test connection (OpenRouter) ----
  const testBtn = $("#testConn"), testResult = $("#testResult");
  testBtn.addEventListener("click", async () => {
    saveSettings();
    const o = { provider: $("#provider").value, apiKey: $("#apiKey").value.trim(), model: chosenModel() };
    if (o.provider === "openrouter" && !o.apiKey) { testResult.className = "hint err"; testResult.textContent = "✕ Add your API key first."; return; }
    if (!o.model) { testResult.className = "hint err"; testResult.textContent = "✕ Pick or enter a model first."; return; }
    testBtn.disabled = true;
    testResult.className = "hint"; testResult.textContent = "Testing connection…";
    try {
      const r = await chrome.runtime.sendMessage({ action: "testConnection", opts: o });
      if (!r || !r.ok) throw new Error(r?.error || "Failed");
      testResult.className = "hint ok"; testResult.textContent = "✓ Connected" + (r.model ? " · " + r.model : "");
    } catch (e) {
      testResult.className = "hint err"; testResult.textContent = "✕ " + e.message;
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
  const open = () => { overlay.classList.add("open"); };
  const close = () => { if (busy) return; overlay.classList.remove("open"); };
  const toggle = () => (overlay.classList.contains("open") ? close() : open());
  xBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.classList.contains("open")) close(); });
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
  const opts = () => ({ provider: $("#provider").value, apiKey: $("#apiKey").value.trim(), model: chosenModel(), scope: $("#scope").value, instruction: $("#instruction").value.trim() });

  function rowInput(f, val) {
    const id = esc(f.id);
    if (f.kind === "input" && f.type === "checkbox")
      return `<input type="checkbox" class="rval" data-id="${id}" ${val === true || val === "true" ? "checked" : ""}>`;
    if (f.kind === "datepicker" || f.type === "date")
      return `<input type="date" class="rval field" data-id="${id}" value="${esc(val)}">`;
    if ((f.kind === "combobox" || f.kind === "select") && Array.isArray(f.options) && f.options.length) {
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
    if (f.label && f.label.trim()) return f.label.trim();
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
        if (input) { if (input.type === "checkbox") input.checked = !!r.value; else input.value = r.value; }
      }
    } catch (e) {} finally { btn.classList.remove("spin-on"); btn.disabled = false; }
  }

  function fillDone(r) {
    setStatus(`Filled ${r.filled} of ${r.total} fields`, "ok", I.check);
    fillBtn.classList.remove("loading"); fillBtn.classList.add("done");
    fillBtn.querySelector(".label").textContent = `Filled ${r.filled} field${r.filled === 1 ? "" : "s"}`;
    $("#undoBtn").hidden = !r.canUndo;
    setTimeout(() => { fillBtn.classList.remove("done"); fillBtn.querySelector(".label").textContent = "Analyze & Fill Form"; }, 2600);
  }

  // ---- main button: preview (review on) or one-shot fill (review off) ----
  fillBtn.addEventListener("click", async () => {
    if (busy) return;
    const o = opts();
    if (o.provider === "openrouter" && !o.apiKey) { setStatus("Add your OpenRouter API key in Settings.", "err", I.alert); switchTab("settings"); return; }
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
        setStatus(`AI proposed ${r.fields.length} values — edit then Apply`, "");
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
      const r = await chrome.runtime.sendMessage({ action: "runApply", values: collectValues(), fields: reviewFields });
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
    el.style.outline = "2px solid #8b5cf6"; el.style.outlineOffset = "1px";
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
    if (o.provider === "openrouter" && !o.apiKey) { qaFlash("err", "Add OpenRouter key in Settings"); return; }
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
