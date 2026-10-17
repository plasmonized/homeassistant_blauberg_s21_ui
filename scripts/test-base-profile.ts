import assert from "node:assert/strict";
import { runBaseProfile, demandLevel, effectiveProfiles, baseParametersSchema, BASE_DEFAULTS } from "../server/lib/base-profile";
import { resolveBaseSensor } from "../server/lib/base-sensors";

const compute = (indoor: number | null, outdoor: number | null, co2: number | null, humidity: number | null, extra = {}) =>
  runBaseProfile(99999, 99999, { ...BASE_DEFAULTS, ...extra }, indoor, outdoor, co2, humidity);

assert.equal((await compute(27, 23, 500, 40)).result.value, 3, "cooling demand wins");
assert.equal((await compute(21, 25, 1200, 40)).result.value, 2, "CO₂ elevates base ventilation");
assert.equal((await compute(21, 25, 1600, 40)).result.value, 3, "CO₂ boost");
assert.equal((await compute(21, 25, 500, 65)).result.value, 2, "humidity raises base");
assert.equal((await compute(21, 25, 1200, 75)).result.value, 3, "maximum of demands");
assert.equal((await compute(27, 34, 500, 40)).result.actionType, "standby");
assert.equal((await compute(27, 34, 1200, 40)).result.value, 2, "CO₂ overrides heat standby");
assert.equal((await compute(27, 34, 500, 75)).result.value, 3, "humidity overrides heat standby");
assert.equal((await compute(27, 34, 500, 75, { useHeater: true })).result.mode, 0, "never retain heating during standby override");
assert.equal((await compute(27, 34, null, 40)).result.actionType, "fan_speed", "missing required CO₂ forbids standby");
assert.equal((await compute(27, 34, null, 40, { co2ControlEnabled: false })).result.actionType, "standby");
assert.equal((await compute(null, 23, 1600, 40)).result.value, 3, "IAQ works without temperatures");
assert.equal((await compute(null, null, null, null)).result.value, 1, "fail explicit to minimum ventilation");
assert.match((await compute(null, null, null, null)).result.reason, /WARNUNG/);
assert.equal((await compute(27, 34, 1700, 80, { co2ControlEnabled: false, humidityControlEnabled: false })).result.actionType, "standby", "disabled IAQ makes no demand");
assert.equal((await compute(27, 34, 500, 40, { heatProtectionEnabled: false })).result.actionType, "fan_speed");
assert.equal(demandLevel(1000, 1000, 1500, 50, 0), 2);
assert.equal(demandLevel(980, 1000, 1500, 50, 2), 2);
assert.equal(demandLevel(950, 1000, 1500, 50, 2), 0);
assert.equal(demandLevel(1480, 1000, 1500, 50, 3), 3);
assert.equal(demandLevel(1450, 1000, 1500, 50, 3), 2);
assert.equal(demandLevel(999, 1000, 1500, 50, 0), 0);
assert.equal(baseParametersSchema.safeParse({ ...BASE_DEFAULTS, co2BoostThreshold: 900 }).success, false);
assert.equal(baseParametersSchema.safeParse({ ...BASE_DEFAULTS, humiditySetpoint: NaN }).success, false);
assert.equal(baseParametersSchema.safeParse({ ...BASE_DEFAULTS, sensorSources: { co2: "bogus" } }).success, false);
const profiles = [
  { id: 1, enabled: true, schemaType: "weather_compensated" },
  { id: 2, enabled: true, schemaType: "co2_control" },
  { id: 3, enabled: true, schemaType: "base_profile" },
];
assert.deepEqual(effectiveProfiles(profiles).map(p => p.id), [3], "base is exclusive");
assert.deepEqual(effectiveProfiles(profiles.map(p => ({ ...p, enabled: p.id !== 3 }))).map(p => p.id), [1, 2], "legacy resumes only when base disabled");

const now = Date.now();
const regs = [
  { id: 1, tags: ["sensor", "co2"], lastValue: "750", updatedAt: new Date(now) },
  { id: 2, tags: ["sensor", "humidity", "outdoor"], lastValue: "90", updatedAt: new Date(now) },
  { id: 3, tags: ["sensor", "humidity", "indoor"], lastValue: "55", updatedAt: new Date(now) },
];
const exts = [
  { id: 9, sensorType: "co2", lastValue: "1250", updatedAt: new Date(now) },
  { id: 10, sensorType: "co2", lastValue: "1500", updatedAt: new Date(now - 2_000_000) },
  { id: 11, sensorType: "co2", lastValue: "unavailable", updatedAt: new Date(now) },
];
const resolve = (type: "co2" | "humidity", source?: string) => resolveBaseSensor(type, source, regs, exts, 1_800_000, now);
assert.equal(resolve("co2"), 750);
assert.equal(resolve("co2", "external:9"), 1250);
assert.equal(resolve("co2", "external:10"), null, "stale pin never silently changes to another sensor");
assert.equal(resolve("co2", "external:11"), null);
assert.equal(resolve("co2", "external:999"), null);
assert.equal(resolve("co2", "internal:3"), null, "reject incompatible type");
assert.equal(resolve("humidity"), 55, "never use outdoor humidity for indoor requirement");
assert.equal(resolve("humidity", "external:9"), null);
console.log("Grundprofil: Regelungs-, Hysterese- und Sensortests bestanden.");
