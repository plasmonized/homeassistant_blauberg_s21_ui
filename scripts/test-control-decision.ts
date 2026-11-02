import assert from "node:assert/strict";
import { recordControlDecision, latestControlDecision } from "../server/lib/control-decision";
import type { ControlDecision } from "../shared/control-decision";

const now = Date.now();
const sample: Omit<ControlDecision, "evaluatedAt"> = {
  deviceId: 98701, profileId: 1, profileName: "Grundprofil",
  actionType: "fan_speed", requestedValue: 3, effectiveValue: 3,
  reason: "CO₂ über Soll → Stufe 3", outcome: "unchanged", detail: null,
};
assert.equal(latestControlDecision(sample.deviceId, [1]), null, "startup never reuses a historical log as a live decision");
recordControlDecision(sample, now);
assert.equal(latestControlDecision(sample.deviceId, [1])?.reason, sample.reason);
recordControlDecision({ ...sample, reason: "Aktuelle neue Messwerte", outcome: "unchanged" }, now + 10_000);
assert.equal(latestControlDecision(sample.deviceId, [1])?.evaluatedAt, new Date(now + 10_000).toISOString(),
  "unchanged fan speed still has a fresh reason on every evaluation");
recordControlDecision({ ...sample, requestedValue: 1, effectiveValue: 3, outcome: "held", detail: "Haltezeit aktiv" }, now + 20_000);
assert.equal(latestControlDecision(sample.deviceId, [1])?.requestedValue, 1);
assert.equal(latestControlDecision(sample.deviceId, [1])?.effectiveValue, 3, "held speed is not the newly requested speed");
recordControlDecision({ ...sample, requestedValue: 1, effectiveValue: null, outcome: "failed", detail: "Modbus nicht erreichbar" }, now + 30_000);
assert.equal(latestControlDecision(sample.deviceId, [1])?.effectiveValue, null, "failed writes never claim a confirmed speed");
recordControlDecision({ ...sample, profileId: 2, reason: "Andere aktive Regelung" }, now + 40_000);
assert.equal(latestControlDecision(sample.deviceId, [1, 2])?.profileId, 2);
assert.equal(latestControlDecision(sample.deviceId, [1])?.profileId, 1, "disabled profile is excluded");
assert.equal(latestControlDecision(sample.deviceId, [2]), null, "a disabled decision does not become current by re-enabling a profile");
assert.equal(latestControlDecision(98702, [1]), null, "decisions are device scoped");
recordControlDecision({ ...sample, actionType: "standby", requestedValue: 0, effectiveValue: 0, outcome: "applied" }, now + 50_000);
assert.equal(latestControlDecision(sample.deviceId, [1])?.actionType, "standby");
console.log("Regelungsgrund: frische unveränderte Entscheidungen, Haltezeit, Schreibfehler, Profilwechsel, Geräteabgrenzung und Standby bestanden.");
