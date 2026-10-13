// Regression runner: starts a static server, runs every test, stops the server.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || "5199";
const TESTS = ["run-mainworld.mjs", "run-bubble.mjs", "run-async.mjs", "run-undo.mjs", "run-review.mjs", "run-names.mjs", "run-inline.mjs", "run-instructions.mjs", "run-testconn.mjs", "run-prompt.mjs", "run-tabs.mjs", "run-validate.mjs", "survey.mjs local"];

const server = spawn("python3", ["-m", "http.server", PORT], { cwd: __dirname, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

const run = (file) =>
  new Promise((resolve) => {
    const [script, ...args] = file.split(" ");
    const p = spawn("node", [join(__dirname, script), ...args], { cwd: __dirname, env: { ...process.env, PORT }, stdio: "inherit" });
    p.on("exit", (code) => resolve(code === 0));
  });

let allPass = true;
for (const t of TESTS) {
  console.log(`\n========== ${t} ==========`);
  if (!(await run(t))) allPass = false;
}

server.kill("SIGKILL");
console.log(`\n${allPass ? "✅ ALL TESTS PASS" : "❌ SOME TESTS FAILED"}`);
process.exit(allPass ? 0 : 1);
