import assert from "node:assert/strict";
import test from "node:test";
import type { Register } from "@shared/schema";
import { deriveDeviceOverviewStatus } from "./device-overview-status";

function register(
  tags: string[],
  lastValue: string | null,
  options?: unknown,
  unit: string | null = null,
): Register {
  return {
    id: 1,
    deviceId: 1,
    name: tags.join(" "),
    address: 0,
    type: "holding",
    dataType: "uint16",
    unit,
    scale: 1,
    isWritable: false,
    lastValue,
    updatedAt: null,
    options: options as Register["options"],
    tags,
  };
}

test("derives active ventilation values and filter alert from tagged registers", () => {
  const result = deriveDeviceOverviewStatus([
    register(["fan"], "3", undefined, "Stufe"),
    register(["mode"], "1", { "1": "Automatik" }),
    register(["power"], "true"),
    register(["filter"], "2"),
  ], true);

  assert.deepEqual(result, {
    fanLevel: "3 Stufe",
    mode: "Automatik",
    power: "on",
    filter: { condition: "blocked", label: "Abluftfilter verstopft" },
    dataIsLastKnown: false,
  });
});

test("marks disconnected register readings as last known without inventing missing states", () => {
  const result = deriveDeviceOverviewStatus([
    register(["power"], "0"),
    register(["filter"], null),
  ], false);

  assert.equal(result.power, "off");
  assert.equal(result.fanLevel, null);
  assert.equal(result.mode, null);
  assert.deepEqual(result.filter, { condition: "unknown", label: "Keine Filtermeldung verfügbar" });
  assert.equal(result.dataIsLastKnown, true);
});

test("treats only filter code zero as no filter message and preserves unknown codes", () => {
  assert.equal(deriveDeviceOverviewStatus([register(["filter"], "0")], true).filter.condition, "ok");
  for (const code of ["1", "2", "3"]) {
    assert.equal(deriveDeviceOverviewStatus([register(["filter"], code)], true).filter.condition, "blocked");
  }
  for (const value of [null, "", "unknown"]) {
    assert.equal(deriveDeviceOverviewStatus([register(["filter"], value)], true).filter.condition, "unknown");
  }
  assert.deepEqual(deriveDeviceOverviewStatus([register(["filter"], "9")], true).filter, {
    condition: "unknown",
    label: "Keine Filtermeldung verfügbar",
  });
});
