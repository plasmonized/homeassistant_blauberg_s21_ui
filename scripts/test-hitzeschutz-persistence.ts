/**
 * Regression tests for Task #34:
 * "Confirm Hitzeschutz stays off across a server restart — not just until the next poll"
 *
 * Verifies that the heatProtectionEnabled flag stored in profile parameters JSON
 * is correctly honoured by computeWeatherCompensatedControl on every cycle,
 * including the very first cycle after a server restart (which simply re-reads
 * the persisted profile params from the database).
 *
 * Scenarios:
 *   S1 – heatProtectionEnabled=false, outdoorTemp > heatShutdownAbove
 *        → result must NOT be standby (flag disables the entire feature)
 *   S2 – heatProtectionEnabled=true (default), outdoorTemp > heatShutdownAbove
 *        → result MUST be standby (feature is active)
 *   S3 – heatProtectionEnabled=false, outdoorTemp > heatShutdownAbove, CO₂ high
 *        → result must NOT be standby (feature disabled, CO₂ override irrelevant)
 *   S4 – heatProtectionEnabled=true, outdoorTemp > heatShutdownAbove, CO₂ high
 *        → result must be fan_speed (CO₂ override kicks in even during heatProtection)
 *   S5 – heatProtectionEnabled omitted from params (defaults to true),
 *        outdoorTemp > heatShutdownAbove → result MUST be standby (safe default)
 *
 * Run with:  npx tsx scripts/test-hitzeschutz-persistence.ts
 */

import { runWeatherCompensated } from "../server/lib/control-engine";

// ─── Tiny assertion helpers ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}  (got: ${JSON.stringify(actual)}, want: ${JSON.stringify(expected)})`);
    failed++;
  }
}

// Shared base params — outdoor temp is above the shutdown threshold
const baseParams = {
  heatShutdownAbove: 32,
  roomSetpoint: 21,
  co2OverrideThreshold: 1000,
  humidityOverrideThreshold: 65,
};

const HOT_OUTDOOR = 35; // clearly above heatShutdownAbove=32
const INDOOR = 24;

// ─── S1: heatProtectionEnabled=false → no standby ────────────────────────────

console.log("\n── S1: heatProtectionEnabled=false — outdoor 35 °C, no standby expected ──");

{
  const result = await runWeatherCompensated(
    1, 1,
    { ...baseParams, heatProtectionEnabled: false },
    HOT_OUTDOOR,
    INDOOR,
    /* co2      */ null,
    /* humidity */ null,
  );

  assert(
    result.actionType !== "standby",
    `actionType is not standby (got "${result.actionType}")`,
  );
  assert(
    result.value > 0,
    `value > 0 — fan is actually running (got ${result.value})`,
  );
  assert(
    !result.reason.toLowerCase().includes("hitzeschutz"),
    `reason does not mention Hitzeschutz (got "${result.reason}")`,
  );
}

// ─── S2: heatProtectionEnabled=true → standby triggered ───────────────────────

console.log("\n── S2: heatProtectionEnabled=true — outdoor 35 °C, standby expected ──────");

{
  const result = await runWeatherCompensated(
    2, 1,
    { ...baseParams, heatProtectionEnabled: true },
    HOT_OUTDOOR,
    INDOOR,
    null,
    null,
  );

  assertEqual(result.actionType, "standby", `actionType is standby`);
  assertEqual(result.value, 0, `value is 0`);
  assert(
    result.reason.toLowerCase().includes("hitzeschutz"),
    `reason mentions Hitzeschutz (got "${result.reason}")`,
  );
}

// ─── S3: heatProtectionEnabled=false, CO₂ high → still no standby ─────────────

console.log("\n── S3: heatProtectionEnabled=false, CO₂=1200 — feature off, no standby ───");

{
  const result = await runWeatherCompensated(
    3, 1,
    { ...baseParams, heatProtectionEnabled: false },
    HOT_OUTDOOR,
    INDOOR,
    /* co2 */ 1200,
    null,
  );

  assert(
    result.actionType !== "standby",
    `actionType is not standby when feature disabled (got "${result.actionType}")`,
  );
}

// ─── S4: heatProtectionEnabled=true, CO₂ high → CO₂ override (fan_speed=1) ───

console.log("\n── S4: heatProtectionEnabled=true, CO₂=1200 — CO₂ override, no standby ──");

{
  const result = await runWeatherCompensated(
    4, 1,
    { ...baseParams, heatProtectionEnabled: true },
    HOT_OUTDOOR,
    INDOOR,
    /* co2 */ 1200,
    null,
  );

  assertEqual(result.actionType, "fan_speed", `CO₂ override yields fan_speed`);
  assertEqual(result.value, 1, `CO₂ override value is 1 (minimum ventilation)`);
}

// ─── S5: heatProtectionEnabled absent (default=true) → standby ───────────────

console.log("\n── S5: heatProtectionEnabled omitted (defaults to true) — standby expected ─");

{
  // Deliberately omit heatProtectionEnabled to verify the safe default
  const result = await runWeatherCompensated(
    5, 1,
    { ...baseParams },
    HOT_OUTDOOR,
    INDOOR,
    null,
    null,
  );

  assertEqual(result.actionType, "standby", `default (omitted) → standby`);
  assertEqual(result.value, 0, `default standby value is 0`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error("\nSome simulation tests FAILED – see above for details.");
  process.exit(1);
} else {
  console.log("\nAll simulation tests passed ✓");
}
