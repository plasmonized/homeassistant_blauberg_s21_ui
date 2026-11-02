import assert from "node:assert/strict";
import test from "node:test";
import type { ControlDecision } from "@shared/control-decision";
import { presentControlDecision } from "./control-decision-presentation";

const NOW = Date.parse("2026-07-16T12:00:00.000Z");

function decision(overrides: Partial<ControlDecision> = {}): ControlDecision {
  return {
    deviceId: 1,
    profileId: 9,
    profileName: "Raumluft",
    actionType: "fan_speed",
    requestedValue: 3,
    effectiveValue: 3,
    reason: "CO₂-Regelung fordert Stufe 3.",
    outcome: "applied",
    detail: null,
    evaluatedAt: new Date(NOW - 20_000).toISOString(),
    ...overrides,
  };
}

test("fresh decisions compare effective fan output with the actual fan register", () => {
  const actual = { fanLevel: "2 Stufe", power: "on" as const };
  assert.equal(presentControlDecision(decision(), 90_000, NOW, true, actual)?.actualMismatch, true);
  assert.equal(presentControlDecision(decision(), 90_000, NOW, true, { ...actual, fanLevel: "3 Stufe" })?.actualMismatch, false);
  assert.equal(presentControlDecision(decision(), 90_000, NOW, true, { fanLevel: "3", power: "off" })?.actualMismatch,
    true, "an off device is not running at the retained fan register level");
  assert.equal(presentControlDecision(decision(), 90_000, NOW, true, { fanLevel: "3", power: null })?.actualMismatch,
    null, "missing power readback is not confirmation of the fan output");
});

test("standby compares against power-off, never against a retained fan level of zero", () => {
  const standby = decision({ actionType: "standby", effectiveValue: 0 });
  assert.equal(presentControlDecision(standby, 90_000, NOW, true, { fanLevel: "2 Stufe", power: "off" })?.actualMismatch, false);
  assert.equal(presentControlDecision(standby, 90_000, NOW, true, { fanLevel: "0 Stufe", power: "on" })?.actualMismatch, true);
});

test("failed, stale, offline and invalid-date evaluations are historical and cannot explain current output", () => {
  const current = decision();
  const cases = [
    [decision({ outcome: "failed" }), "failed"],
    [decision({ evaluatedAt: new Date(NOW - 100_000).toISOString() }), "stale"],
    [current, "offline"],
    [decision({ evaluatedAt: "not-a-date" }), "invalid-date"],
  ] as const;

  for (const [value, reason] of cases) {
    const presented = presentControlDecision(value, 90_000, NOW, reason !== "offline", {
      fanLevel: "3 Stufe",
      power: "on",
    });
    assert.equal(presented?.historicalReason, reason);
    assert.equal(presented?.actualMismatch, null);
  }
});

test("missing decisions and missing actual readback remain unknown", () => {
  assert.equal(presentControlDecision(null, 90_000, NOW, true, { fanLevel: null, power: null }), null);
  assert.equal(
    presentControlDecision(decision({ effectiveValue: null }), 90_000, NOW, true, { fanLevel: null, power: null })?.actualMismatch,
    null,
  );
});

test("held decisions compare the retained output, not the new requested output", () => {
  const held = decision({ outcome: "held", requestedValue: 1, effectiveValue: 3, detail: "Haltezeit aktiv" });
  assert.equal(presentControlDecision(held, 90_000, NOW, true, { fanLevel: "3", power: "on" })?.actualMismatch, false);
  assert.equal(presentControlDecision(held, 90_000, NOW, true, { fanLevel: "1", power: "on" })?.actualMismatch, true);
});

test("cached evaluations expire without receiving new data", () => {
  const cached = decision();
  assert.equal(presentControlDecision(cached, 90_000, NOW, true, { fanLevel: "3", power: "on" })?.historicalReason, null);
  assert.equal(presentControlDecision(cached, 90_000, NOW + 90_000, true, { fanLevel: "3", power: "on" })?.historicalReason, "stale");
});
