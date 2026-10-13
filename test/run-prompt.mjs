// buildPrompt must carry a select's options to the model. page-funcs reports them
// as plain strings; reading .value/.text off a string once sent [null, null, …].
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", "background.js"), "utf8");

const ctx = { importScripts: (...files) => files.filter((f) => f !== "page-funcs.js").forEach((f) => vm.runInContext(readFileSync(join(__dirname, "..", f), "utf8"), ctx)), chrome: { runtime: { onMessage: { addListener: () => {} } }, action: { onClicked: { addListener: () => {} } }, commands: { onCommand: { addListener: () => {} } } }, console };
vm.createContext(ctx);
vm.runInContext(src, ctx);

const prompt = ctx.buildPrompt([
  { id: "0", type: "select", label: "Size", options: ["One", "Two"] },
  { id: "1", type: "select", label: "Dept", options: [{ value: "cardio", text: "Cardiology" }] },
]);
const sent = JSON.parse(prompt.split("Fields (JSON):\n")[1].split("\n\nRespond")[0]);
console.log("options sent:", JSON.stringify(sent.map((f) => f.options)));
// OpenRouter errors read as something to act on; the per-day free cap is not
// "try again in a moment"
const res = (status, body, reset) => new Response(body, { status, headers: reset ? { "x-ratelimit-reset": String(reset) } : {} });
const daily = ctx.apiError(res(429, JSON.stringify({ error: { message: "Rate limit exceeded: free-models-per-day. Add 10 credits" } }), 1791936000000), JSON.stringify({ error: { message: "Rate limit exceeded: free-models-per-day. Add 10 credits" } })).message;
const busy = ctx.apiError(res(429, "{}"), JSON.stringify({ error: { message: "x is temporarily rate-limited upstream" } })).message;
const harness = ctx.apiError(res(403, "{}"), JSON.stringify({ error: { message: "inkling:free is only available on agentic harnesses" } })).message;
const policy = ctx.apiError(res(404, "{}"), JSON.stringify({ error: { message: "No endpoints found matching your data policy (Free model publication). Configure: https://openrouter.ai/settings/privacy" } })).message;
console.log("data policy:", policy);
console.log("daily:", daily, "\nbusy:", busy, "\n403:", harness);
const errOk = /settings\/privacy/.test(policy) && /Daily free-model limit/.test(daily) && /Resets at/.test(daily) && /busy upstream/.test(busy) && /agentic harnesses/.test(harness);

// constraints, locale and persona reach the model; a correction round carries
// the rejected value and the page's message
const persona = ctx.makePersona("vi-VN", 11);
const p2 = ctx.buildPrompt([{ id: "0", type: "text", label: "Mã", pattern: "[A-Z]{3}-\\d{4}", minLength: 8 },
  { id: "1", type: "number", label: "Tuổi", min: "18", max: "30", rejected: { value: "99", message: "Value must be less than or equal to 30." } }],
  "", { persona, locale: "vi-VN", retry: true });
const sent2 = JSON.parse(p2.split("Fields (JSON):\n")[1].split("\n\nRespond")[0]);
const promptOk = /Locale: vi-VN/.test(p2) && p2.includes(persona.fullName) && /REJECTED/.test(p2) && !p2.includes('"seed"') &&
  sent2[0].pattern === "[A-Z]{3}-\\d{4}" && sent2[0].minLength === 8 && sent2[1].max === "30" && sent2[1].error.includes("less than");
console.log("prompt carries locale/persona/constraints/rejection:", promptOk);

// offline values: Vietnamese persona, consistent email, constraints honoured
const off = ctx.offlineValues([
  { id: "0", type: "text", label: "Họ và tên" }, { id: "1", type: "email", label: "Email" },
  { id: "2", type: "text", label: "Mã", pattern: "[A-Z]{3}-\\d{4}" }, { id: "3", type: "number", label: "Tuổi", min: "18", max: "30" },
  { id: "4", type: "radio", label: "Giới tính", options: ["Nam", "Nữ"] }, { id: "5", type: "password", label: "Mật khẩu" },
], persona);
console.log("offline:", JSON.stringify(off));
const offOk = off["0"] === persona.fullName && off["1"] === persona.email && /^[A-Z]{3}-\d{4}$/.test(off["2"]) &&
  +off["3"] >= 18 && +off["3"] <= 30 && off["4"] === (persona.gender === "male" ? "Nam" : "Nữ") && !("5" in off);
const conformOk = ctx.conformValue({ type: "number", min: "18", max: "30" }, "99") === "30" &&
  ctx.conformValue({ type: "text", maxLength: 5 }, "abcdefgh") === "abcde" &&
  ctx.conformValue({ type: "tel", pattern: "\\d{10}" }, "090 123 4567") === "0901234567";
const locOk = ctx.resolveLocale("auto", "vi", "en-US") === "vi-VN" && ctx.resolveLocale("auto", "zh-CN", "ja") === "ja-JP" &&
  ctx.resolveLocale("de-DE", "vi", "") === "de-DE" && ctx.resolveLocale("auto", "", "") === "en-US";
console.log("offline ok:", offOk, "| conform ok:", conformOk, "| locale ok:", locOk);

const ok = promptOk && offOk && conformOk && locOk && errOk && JSON.stringify(sent[0].options) === '["One","Two"]' && JSON.stringify(sent[1].options) === '["cardio"]';
console.log("\nRESULT:", ok ? "✅ PASS" : "❌ FAIL");
process.exit(ok ? 0 : 1);
