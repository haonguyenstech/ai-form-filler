// helpers for tutorial shots: highlight a target with an outline + numbered badge
window.__mark = (el, n, label) => {
  const r = el.getBoundingClientRect();
  const box = document.createElement("div");
  box.className = "__tut";
  Object.assign(box.style, { position: "fixed", left: r.left - 6 + "px", top: r.top - 6 + "px", width: r.width + 12 + "px", height: r.height + 12 + "px",
    border: "3px solid #ff3b30", borderRadius: "12px", zIndex: 2147483647, pointerEvents: "none", boxShadow: "0 0 0 4px rgba(255,59,48,.25)" });
  const b = document.createElement("div");
  b.className = "__tut";
  b.textContent = n + (label ? "  " + label : "");
  Object.assign(b.style, { position: "fixed", zIndex: 2147483647, pointerEvents: "none", background: "#ff3b30", color: "#fff",
    font: "600 14px/1 -apple-system, system-ui, sans-serif", padding: "7px 11px", borderRadius: "999px", whiteSpace: "nowrap",
    left: Math.max(8, r.left - 6) + "px", top: (r.top > 50 ? r.top - 42 : r.bottom + 12) + "px" });
  document.body.append(box, b);
  const bw = b.getBoundingClientRect().width;
  if (parseFloat(b.style.left) + bw > innerWidth - 8) b.style.left = innerWidth - bw - 8 + "px";
};
window.__clear = () => document.querySelectorAll(".__tut").forEach((n) => n.remove());
