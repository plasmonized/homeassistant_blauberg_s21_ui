import assert from "node:assert/strict";
import { currentBaseReferenceSettings } from "../server/lib/base-profile-history";
import { baseProfileReferenceLines } from "../client/src/lib/base-profile-reference-lines";

const defaults = currentBaseReferenceSettings({});
assert.equal(defaults.roomSetpoint, 21);
assert.equal(defaults.co2Setpoint, 1000);
assert.equal(defaults.humidityBoostThreshold, 70);
assert.equal(baseProfileReferenceLines(defaults).length, 5);
const configured = currentBaseReferenceSettings({
  roomSetpoint: 24.5, co2Setpoint: 850, co2BoostThreshold: 1200,
  humiditySetpoint: 55, humidityBoostThreshold: 75,
});
assert.deepEqual(baseProfileReferenceLines(configured).map(line => [line.axis, line.value, line.unit]), [
  ["temp", 24.5, "°C"], ["co2", 850, "ppm"], ["co2", 1200, "ppm"],
  ["humidity", 55, "%"], ["humidity", 75, "%"],
]);
for (const co2ControlEnabled of [true, false]) {
  for (const humidityControlEnabled of [true, false]) {
    const lines = baseProfileReferenceLines({ ...configured, co2ControlEnabled, humidityControlEnabled });
    assert.equal(lines.filter(line => line.axis === "temp").length, 1);
    assert.equal(lines.filter(line => line.axis === "co2").length, co2ControlEnabled ? 2 : 0);
    assert.equal(lines.filter(line => line.axis === "humidity").length, humidityControlEnabled ? 2 : 0);
  }
}
assert.deepEqual(baseProfileReferenceLines(null), []);
assert.deepEqual(baseProfileReferenceLines(undefined), []);
assert.equal(baseProfileReferenceLines({ ...configured, roomSetpoint: NaN }).length, 4);
assert.throws(() => currentBaseReferenceSettings({ roomSetpoint: "invalid" }));
assert.equal(baseProfileReferenceLines({ ...configured, roomSetpoint: 18 })[0].value, 18, "use current rather than historical values");
console.log("Grundprofil-Referenzen: aktuelle Werte, Standards, Skalen und deaktivierte Regelungen bestanden.");
