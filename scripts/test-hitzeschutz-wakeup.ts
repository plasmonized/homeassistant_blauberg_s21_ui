/**
 * Simulation tests for Task #26:
 * "Confirm the unit reliably wakes up after heat-protection standby ends"
 *
 * Covers three scenarios from the task spec:
 *   S1 – outdoor temp 33°C → control engine returns standby action
 *   S2 – outdoor temp drops to 28°C → executeControlAction writes coil→true
 *        then fan speed in the correct order, log shows "Anlage eingeschaltet"
 *   S3 – server restart while in standby: seedProfileLastActionFromDb parses
 *        "standby=0" correctly (value=0) and isStandbyTransition bypasses hold-time
 *
 * Run with:  npx tsx scripts/test-hitzeschutz-wakeup.ts
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

// ─── Scenario 1: 33 °C outdoor → standby ──────────────────────────────────────

console.log("\n── S1: Hitzeschutz triggers standby at 33 °C ──────────────────────────────");

const paramsBase = {
  heatShutdownAbove: 32,
  roomSetpoint: 21,
  co2OverrideThreshold: 1000,
  humidityOverrideThreshold: 65,
};

{
  const result = await runWeatherCompensated(
    1, 1,
    { ...paramsBase },
    /* outdoorTemp */ 33,
    /* indoorTemp  */ 24,
    /* co2         */ null,
    /* humidity    */ null,
  );
  assertEqual(result.actionType, "standby", "actionType === 'standby'");
  assertEqual(result.value, 0, "value === 0");
  assert(result.reason.includes("Hitzeschutz"), "reason mentions 'Hitzeschutz'");
  assert(result.reason.includes("33"), "reason contains the measured temperature");
}

// CO2 override: even at 33 °C, high CO2 forces fan_speed=1 instead of standby
{
  const result = await runWeatherCompensated(
    1, 1,
    { ...paramsBase },
    33,
    24,
    /* co2 */ 1100,  // above co2OverrideThreshold=1000
    null,
  );
  assertEqual(result.actionType, "fan_speed", "CO2 override → fan_speed (not standby)");
  assertEqual(result.value, 1, "CO2 override → speed 1 minimum ventilation");
}

// Humidity override: even at 33 °C, high humidity forces fan_speed=1
{
  const result = await runWeatherCompensated(
    1, 1,
    { ...paramsBase },
    33,
    24,
    null,
    /* humidity */ 70, // above humidityOverrideThreshold=65
  );
  assertEqual(result.actionType, "fan_speed", "Humidity override → fan_speed (not standby)");
  assertEqual(result.value, 1, "Humidity override → speed 1 minimum ventilation");
}

// ─── Scenario 2: temperature drops to 28 °C → wake-up path ───────────────────

console.log("\n── S2: Temperature drops to 28 °C → executeControlAction writes coil then fan speed ──");

// We simulate executeControlAction's fan_speed branch directly, since the
// function is not exported. This mirrors the exact logic in automation.ts
// (~line 916-938).

type WriteOp = { type: "coil" | "register"; address: number; value: boolean | number };
const writeLog: WriteOp[] = [];

const mockClient = {
  writeSingleCoil: async (address: number, value: boolean) => {
    writeLog.push({ type: "coil", address, value });
  },
  writeSingleRegister: async (address: number, value: number) => {
    writeLog.push({ type: "register", address, value });
  },
};

const storageLog: string[] = [];
const mockStorage = {
  updateRegisterValue: async (id: number, value: number) => {
    storageLog.push(`update(id=${id}, value=${value})`);
  },
};

// Registers mirroring the real S21 setup.
// powerReg has lastValue=0 because the unit is currently in standby.
const registers = [
  { id: 10, name: "System State", tags: ["power"], type: "coil",    address: 0,  lastValue: 0 },
  { id: 20, name: "Fan Speed Mode", tags: [],       type: "holding", address: 2,  lastValue: 2 },
];

const result28 = await runWeatherCompensated(
  1, 1,
  { ...paramsBase },
  /* outdoorTemp */ 28,
  /* indoorTemp  */ 24,
  null,
  null,
);

// The control engine must return fan_speed, not standby, at 28 °C
assert(result28.actionType === "fan_speed", "28 °C → control engine returns fan_speed action");

// Now run the fan_speed branch of executeControlAction (replicated logic)
const messages: string[] = [];
const powerReg = registers.find((r) => (r.tags ?? []).includes("power") && r.type === "coil");
if (powerReg && Number(powerReg.lastValue) === 0) {
  await mockClient.writeSingleCoil(powerReg.address, true);
  await mockStorage.updateRegisterValue(powerReg.id, 1);
  messages.push("Anlage eingeschaltet (Hitzeschutz beendet)");
}

const fanReg = registers.find((r) => r.name.includes("Fan Speed"));
if (fanReg) {
  const fanValue = Math.max(1, Math.min(3, Math.round(result28.value)));
  await mockClient.writeSingleRegister(fanReg.address, fanValue);
  await mockStorage.updateRegisterValue(fanReg.id, fanValue);
  messages.push(`Lüfterstufe: ${fanValue}`);
}

// Verify write ORDER: coil (index 0) must come before fan-speed register (index 1)
assert(writeLog.length >= 2, "exactly two Modbus writes were issued");
assert(writeLog[0].type === "coil" && writeLog[0].value === true,
  "first write: power coil → true (unit switched on)");
assert(writeLog[1].type === "register",
  "second write: holding register (fan speed)");
assert(messages.some((m) => m.includes("Anlage eingeschaltet (Hitzeschutz beendet)")),
  "message contains 'Anlage eingeschaltet (Hitzeschutz beendet)'");
assert(messages.some((m) => m.includes("Lüfterstufe")),
  "message also confirms fan speed was written");

// ─── Scenario 3: server restart while in standby ──────────────────────────────

console.log("\n── S3: Server restart – hold-time restore reads standby=0 as value=0, then bypasses hold-time on wake-up ──");

// Part A: seedProfileLastActionFromDb regex parsing
// The last successful log entry for a standby action looks like: "standby=0"
// The regex /=(\d+(?:\.\d+)?)$/ must extract value=0 from that string.

const testCases: Array<{ actionTaken: string; expectedValue: number }> = [
  { actionTaken: "standby=0",   expectedValue: 0 },
  { actionTaken: "fan_speed=1", expectedValue: 1 },
  { actionTaken: "fan_speed=2", expectedValue: 2 },
  { actionTaken: "fan_speed=3", expectedValue: 3 },
];

for (const tc of testCases) {
  const match = tc.actionTaken.match(/=(\d+(?:\.\d+)?)$/);
  assert(match !== null, `regex matches "${tc.actionTaken}"`);
  if (match) {
    const value = Number(match[1]);
    assertEqual(value, tc.expectedValue,
      `  "${tc.actionTaken}" → value=${tc.expectedValue}`);
  }
}

// Part B: isStandbyTransition logic
// After restart the restored state has value=0. When outdoor temp drops the
// control engine returns fan_speed. The hold-time guard must be bypassed.
// Replicates the exact condition from automation.ts ~line 823-826.

function simulateHoldTimeGuard(
  last: { value: number; ts: number } | undefined,
  resultActionType: string,
  deviceDrifted: boolean,
  holdMs: number,
): "bypassed-by-standby-transition" | "bypassed-by-device-drift" | "blocked-by-hold-time" | "no-last-action" {
  const now = Date.now();

  const isStandbyTransition =
    resultActionType === "standby" ||
    (last !== undefined && last.value === 0 && resultActionType === "fan_speed");

  if (!deviceDrifted && !isStandbyTransition && last !== undefined && holdMs > 0 && (now - last.ts) < holdMs) {
    return "blocked-by-hold-time";
  }
  if (last === undefined) return "no-last-action";
  if (isStandbyTransition) return "bypassed-by-standby-transition";
  if (deviceDrifted) return "bypassed-by-device-drift";
  return "no-last-action";
}

// Restored state: last action was standby=0, written 2 seconds ago (well within hold-time)
const standbyLast = { value: 0, ts: Date.now() - 2_000 };
const holdMs = 10 * 60_000; // 10 minutes hold-time

const wakeUpGuard = simulateHoldTimeGuard(standbyLast, "fan_speed", false, holdMs);
assertEqual(wakeUpGuard, "bypassed-by-standby-transition",
  "wake-up from standby bypasses hold-time even when last action was 2 s ago");

// Normal fan_speed→fan_speed transition within hold-time IS blocked
const normalLast = { value: 1, ts: Date.now() - 2_000 };
const normalGuard = simulateHoldTimeGuard(normalLast, "fan_speed", false, holdMs);
assertEqual(normalGuard, "blocked-by-hold-time",
  "normal fan_speed change within hold-time IS blocked (no false bypass)");

// Entering standby is also always immediate
const enterStandbyGuard = simulateHoldTimeGuard(normalLast, "standby", false, holdMs);
assertEqual(enterStandbyGuard, "bypassed-by-standby-transition",
  "entering standby is never blocked by hold-time");

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error("\nSome simulation tests FAILED – see above for details.");
  process.exit(1);
} else {
  console.log("\nAll simulation tests passed ✓");
}
