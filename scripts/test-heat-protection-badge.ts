/**
 * Unit tests for getHeatProtectionStatus (client/src/lib/heat-protection.ts)
 *
 * These tests pin the exact log-field formats produced by the automation
 * engine (automation.ts) and control engine (control-engine.ts).  If either
 * of those formats changes the tests fail immediately, catching regressions
 * before they reach users.
 *
 * Run with:  npx tsx scripts/test-heat-protection-badge.ts
 */

// Node path aliases aren't resolved by tsx, so we import by relative path.
import { getHeatProtectionStatus } from "../client/src/lib/heat-protection";

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
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    console.error(`       got:  ${JSON.stringify(actual)}`);
    console.error(`       want: ${JSON.stringify(expected)}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n── ${title}`);
}

// ─── Helpers to build fake log entries ────────────────────────────────────────

function makeLog(
  profileId: number,
  actionTaken: string,
  message: string,
  minutesAgo = 0,
) {
  return {
    profileId,
    actionTaken,
    message,
    timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  };
}

// Exact actionTaken / message formats produced by automation.ts + control-engine.ts:
//
//   Standby:  actionTaken = "standby=0"
//             message     = "<reason> → Anlage auf Standby (Hitzeschutz aktiv)"
//
//   Override: actionTaken = "fan_speed=1"
//             message     = "Hitzeschutz (außen 33.0°C ≥ 32°C) – Override wegen CO₂ 1100ppm > 1000ppm → Stufe 1 Mindestlüftung → Lüfterstufe: 1"
//
//   Normal:   actionTaken = "fan_speed=3"
//             message     = "Kühlen: innen 25.0°C > Soll 21°C … → Lüfterstufe: 3"

const STANDBY_ACTION = "standby=0";
const STANDBY_MESSAGE =
  "Hitzeschutz: außen 33.0°C ≥ 32°C, CO₂ und Feuchte im Normbereich → Anlage auf Standby → Anlage auf Standby (Hitzeschutz aktiv)";

const OVERRIDE_ACTION = "fan_speed=1";
const OVERRIDE_MESSAGE =
  "Hitzeschutz (außen 33.0°C ≥ 32°C) – Override wegen CO₂ 1100ppm > 1000ppm → Stufe 1 Mindestlüftung → Lüfterstufe: 1";
const OVERRIDE_MESSAGE_HUMIDITY =
  "Hitzeschutz (außen 34.5°C ≥ 32°C) – Override wegen Feuchte 70.0% > 65% → Stufe 1 Mindestlüftung → Lüfterstufe: 1";
const OVERRIDE_MESSAGE_BOTH =
  "Hitzeschutz (außen 35.0°C ≥ 32°C) – Override wegen CO₂ 1200ppm > 1000ppm, Feuchte 70.0% > 65% → Stufe 1 Mindestlüftung → Lüfterstufe: 1";

const NORMAL_ACTION = "fan_speed=3";
const NORMAL_MESSAGE =
  "Kühlen: innen 25.0°C > Soll 21°C, außen 18.0°C kühler → Stufe 3 → Lüfterstufe: 3";

const PROFILE_ID = 42;
const OTHER_PROFILE_ID = 99;

// ─── Test suite ───────────────────────────────────────────────────────────────

section("Empty / missing logs");
assertEqual(
  getHeatProtectionStatus([], PROFILE_ID),
  { standby: false, override: false, overrideReason: null },
  "empty array → no badge",
);
assertEqual(
  getHeatProtectionStatus(null as any, PROFILE_ID),
  { standby: false, override: false, overrideReason: null },
  "null logs → no badge",
);

section("No entries for this profile");
const logsOtherProfile = [
  makeLog(OTHER_PROFILE_ID, STANDBY_ACTION, STANDBY_MESSAGE),
];
assertEqual(
  getHeatProtectionStatus(logsOtherProfile, PROFILE_ID),
  { standby: false, override: false, overrideReason: null },
  "only other-profile logs present → no badge for this profile",
);

section("Standby badge — actionTaken = 'standby=0'");
const logsStandby = [makeLog(PROFILE_ID, STANDBY_ACTION, STANDBY_MESSAGE)];
assertEqual(
  getHeatProtectionStatus(logsStandby, PROFILE_ID),
  { standby: true, override: false, overrideReason: null },
  "latest log is standby=0 → standby badge",
);

section("No badge when latest log is a normal fan_speed entry");
const logsNormal = [makeLog(PROFILE_ID, NORMAL_ACTION, NORMAL_MESSAGE)];
assertEqual(
  getHeatProtectionStatus(logsNormal, PROFILE_ID),
  { standby: false, override: false, overrideReason: null },
  "latest log is fan_speed=3 → no badge",
);

section("Override badge — CO₂ trigger");
const logsCo2 = [makeLog(PROFILE_ID, OVERRIDE_ACTION, OVERRIDE_MESSAGE)];
const resultCo2 = getHeatProtectionStatus(logsCo2, PROFILE_ID);
assertEqual(resultCo2.standby, false, "override/CO₂ → standby=false");
assertEqual(resultCo2.override, true, "override/CO₂ → override=true");
assert(
  typeof resultCo2.overrideReason === "string" &&
    resultCo2.overrideReason.length > 0,
  "override/CO₂ → overrideReason is non-empty string",
);
assert(
  resultCo2.overrideReason?.includes("CO₂") ?? false,
  "override/CO₂ → overrideReason mentions CO₂",
);

section("Override badge — humidity trigger");
const logsHumidity = [
  makeLog(PROFILE_ID, OVERRIDE_ACTION, OVERRIDE_MESSAGE_HUMIDITY),
];
const resultHumidity = getHeatProtectionStatus(logsHumidity, PROFILE_ID);
assertEqual(resultHumidity.override, true, "override/humidity → override=true");
assert(
  resultHumidity.overrideReason?.includes("Feuchte") ?? false,
  "override/humidity → overrideReason mentions Feuchte",
);

section("Override badge — both CO₂ and humidity");
const logsBoth = [makeLog(PROFILE_ID, OVERRIDE_ACTION, OVERRIDE_MESSAGE_BOTH)];
const resultBoth = getHeatProtectionStatus(logsBoth, PROFILE_ID);
assertEqual(resultBoth.override, true, "override/both → override=true");
assert(
  (resultBoth.overrideReason?.includes("CO₂") &&
    resultBoth.overrideReason?.includes("Feuchte")) ??
    false,
  "override/both → overrideReason mentions both CO₂ and Feuchte",
);

section("Most-recent entry wins (sorting)");
// standby was written 10 min ago; normal fan_speed was written 2 min ago
const logsMixed = [
  makeLog(PROFILE_ID, STANDBY_ACTION, STANDBY_MESSAGE, 10),
  makeLog(PROFILE_ID, NORMAL_ACTION, NORMAL_MESSAGE, 2),
];
assertEqual(
  getHeatProtectionStatus(logsMixed, PROFILE_ID),
  { standby: false, override: false, overrideReason: null },
  "normal log is newer than standby → no badge (standby ended)",
);

// normal fan_speed 10 min ago; standby written 2 min ago
const logsMixed2 = [
  makeLog(PROFILE_ID, NORMAL_ACTION, NORMAL_MESSAGE, 10),
  makeLog(PROFILE_ID, STANDBY_ACTION, STANDBY_MESSAGE, 2),
];
assertEqual(
  getHeatProtectionStatus(logsMixed2, PROFILE_ID),
  { standby: true, override: false, overrideReason: null },
  "standby log is newer than normal → standby badge active",
);

section("Multi-profile log — only target profile's latest entry counts");
const logsMultiProfile = [
  makeLog(OTHER_PROFILE_ID, STANDBY_ACTION, STANDBY_MESSAGE, 1),
  makeLog(PROFILE_ID, NORMAL_ACTION, NORMAL_MESSAGE, 5),
  makeLog(PROFILE_ID, STANDBY_ACTION, STANDBY_MESSAGE, 10),
];
assertEqual(
  getHeatProtectionStatus(logsMultiProfile, PROFILE_ID),
  { standby: false, override: false, overrideReason: null },
  "other-profile standby does not affect target profile; target's latest is normal",
);

section("Override badge: overrideReason regex extracts correct substring");
// Exact format: "Override wegen <reason> → Stufe 1"
const logExact = [
  makeLog(
    PROFILE_ID,
    OVERRIDE_ACTION,
    "Hitzeschutz (außen 33.0°C ≥ 32°C) – Override wegen CO₂ 1100ppm > 1000ppm → Stufe 1 Mindestlüftung → Lüfterstufe: 1",
  ),
];
const resultExact = getHeatProtectionStatus(logExact, PROFILE_ID);
assertEqual(
  resultExact.overrideReason,
  "CO₂ 1100ppm > 1000ppm",
  "regex extracts exact override reason from message",
);

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nSome tests FAILED — check the output above.");
  process.exit(1);
} else {
  console.log("\nAll tests passed ✓");
}
