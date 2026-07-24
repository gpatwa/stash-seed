// Executed rollback drill — the playbook requires rollback to be tested, not
// assumed. This runs the real sequence:
//   1. deploy the good build      -> smoke must PASS
//   2. deploy a regressed build   -> smoke must FAIL (the bad deploy is caught)
//   3. roll back to the good build -> smoke must PASS again
// Exit 0 only if all three expectations held: the bad deploy was caught by
// the smoke, and rollback restored a green service.
import { spawn } from "node:child_process";
import net from "node:net";
import { smoke } from "./smoke.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function waitReachable(base, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try { await fetch(base + "/health"); return true; } catch { await sleep(100); }
  }
  return false;
}

async function deployAndSmoke(entry, port) {
  const base = `http://localhost:${port}`;
  const cp = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  try {
    await waitReachable(base);
    return await smoke(base);
  } finally {
    cp.kill("SIGKILL");
    await sleep(120); // let the port release before the next phase
  }
}

async function phase(label, entry, expectPass) {
  const port = await freePort();
  const { ok, checks } = await deployAndSmoke(entry, port);
  const asExpected = ok === expectPass;
  console.log(`  ${asExpected ? "✓" : "✗"} ${label}: smoke ${ok ? "PASS" : "FAIL"} (expected ${expectPass ? "PASS" : "FAIL"})`);
  if (!ok) console.log(`      caught: ${checks.filter((c) => !c.ok).map((c) => c.name).join(", ")}`);
  return asExpected;
}

console.log("Rollback drill — deploy good, deploy bad, roll back:\n");
const good = "src/server.js";
const bad = "scripts/drill/regressed-server.mjs";

const r1 = await phase("deploy v-good", good, true);
const r2 = await phase("deploy v-bad (regressed — healthy but leaks)", bad, false);
const r3 = await phase("rollback to v-good", good, true);

const ok = r1 && r2 && r3;
console.log(
  ok
    ? "\nDRILL: PASS — bad deploy caught by smoke, rollback restored service."
    : "\nDRILL: FAIL — the drill did not behave as designed.",
);
process.exit(ok ? 0 : 1);
