/**
 * scripts/test.ts — unified test runner
 *
 * Discovers every script in package.json whose name starts with "test:"
 * and runs them in alphabetical order using the current Node executable.
 * Fails fast: the first non-zero exit code stops the run and exits with
 * the same code so CI / pre-push hooks see the failure.
 *
 * Run with:  npm test
 *            npx tsx scripts/test.ts
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Load package.json and collect all "test:*" script names, sorted.
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const testScripts: string[] = Object.keys(pkg.scripts ?? {})
  .filter((k) => k.startsWith("test:") && k !== "test:all") // skip any alias
  .sort();

if (testScripts.length === 0) {
  console.log("No test:* scripts found in package.json — nothing to run.");
  process.exit(0);
}

console.log(`Running ${testScripts.length} test suite(s):\n`);

let anyFailed = false;

for (const script of testScripts) {
  console.log(`${"─".repeat(50)}`);
  console.log(`▶  npm run ${script}\n`);

  const result = spawnSync("npm", ["run", script], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    console.error(`\n✗  ${script} failed (exit ${result.status ?? "signal"}).`);
    anyFailed = true;
    break; // fail fast
  }

  console.log(`\n✓  ${script} passed.`);
}

console.log(`\n${"─".repeat(50)}`);
if (anyFailed) {
  console.error("Test run FAILED — see output above.");
  process.exit(1);
} else {
  console.log(`All ${testScripts.length} suite(s) passed ✓`);
}
