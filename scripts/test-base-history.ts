import assert from "node:assert/strict";
import { createBaseHistoryReading, describeBaseSources, bucketBaseHistory } from "../server/lib/base-profile-history";
import { withHistoryGaps } from "../client/src/lib/history-chart";
import { db, pool } from "../server/db";
import { baseProfileReadings, type BaseProfileReading } from "../shared/schema";
import { storage } from "../server/storage";
import { eq } from "drizzle-orm";

const now = Date.now();
const updatedAt = new Date(now);
const regs = [
  { id: 1, name: "Abluft", tags: ["sensor", "temperature", "extract"], lastValue: "21.6", updatedAt },
  { id: 2, name: "Außen", tags: ["sensor", "temperature", "outdoor"], lastValue: "12", updatedAt },
  { id: 3, name: "Interner CO₂", tags: ["sensor", "co2"], lastValue: "500", updatedAt },
  { id: 4, name: "Interne Feuchte", tags: ["sensor", "humidity"], lastValue: "40", updatedAt },
  { id: 5, name: "Lüfter", tags: ["control", "fan"], lastValue: "2", updatedAt, isWritable: true },
  { id: 6, name: "Power", tags: ["control", "power"], lastValue: "true", updatedAt, isWritable: true },
];
const external = [
  { id: 11, name: "Wohnzimmer CO₂", sensorType: "co2", lastValue: "1250", updatedAt },
  { id: 12, name: "Wohnzimmer Feuchte", sensorType: "humidity", lastValue: "65", updatedAt },
  { id: 13, name: "Raum", sensorType: "indoor_temp", lastValue: "23", updatedAt },
];
const profile = { id: 10, parameters: { sensorSources: {
  co2: "external:11", humidity: "external:12", indoor_temp: "external:13", outdoor_temp: "internal:2",
} } };
const sample = (registers = regs, exts = external, actual = regs, standby = false) =>
  createBaseHistoryReading(1, profile, registers, exts, actual, 1_800_000, standby, now);
const reading = sample();
assert.equal(reading.indoorTemp, 23);
assert.equal(reading.outdoorTemp, 12);
assert.equal(reading.co2, 1250, "use pinned external, not internal CO₂");
assert.equal(reading.humidity, 65);
assert.equal(reading.fanSpeed, 2, "measured stage, not demanded stage");
assert.equal(describeBaseSources(profile.parameters, regs, external).co2.label, "Wohnzimmer CO₂");
assert.equal(reading.sensorSources.co2.source, "external:11");
assert.equal(sample(regs, []).co2, null, "missing pinned sensor never falls back to internal");
assert.equal(sample(regs, external.map(s => ({ ...s, updatedAt: new Date(now - 1_800_001) }))).co2, null);
assert.equal(sample(regs, external.map(s => ({ ...s, lastValue: "unavailable" }))).humidity, null);
assert.equal(sample(regs, external, regs, true).fanSpeed, 0, "standby is stage zero");
assert.equal(sample(regs, external, regs.map(r => r.id === 6 ? { ...r, lastValue: "false" } : r)).fanSpeed, 0);
assert.equal(sample(regs, external, regs.map(r => r.id === 5 ? { ...r, lastValue: "1.5" } : r)).fanSpeed, null);
assert.equal(sample(regs, external, regs.map(r => ({ ...r, updatedAt: new Date(now - 1_800_001) }))).fanSpeed, null);
const bucketStart = Math.floor(now / 300_000) * 300_000;
const rows = [1, 3].map((fanSpeed, i) => ({
  ...reading, id: i, recordedAt: new Date(bucketStart + i * 1000), fanSpeed,
})) as BaseProfileReading[];
assert.equal(bucketBaseHistory(rows)[0].fanSpeed, 3, "last stage, never an average");
assert.equal(bucketBaseHistory([...rows].reverse())[0].fanSpeed, 3, "sorting independence");
assert.deepEqual(withHistoryGaps([{ t: 0, value: 1 }, { t: 900_000, value: 3 }],
  t => ({ t, value: null as number | null })), [
  { t: 0, value: 1 }, { t: 300_000, value: null }, { t: 900_000, value: 3 },
]);

// Isolated history rows only; never modify a user's device, profile or readings.
const deviceId = -Math.floor(1_000_000 + Math.random() * 1_000_000_000);
try {
  await storage.addBaseProfileReading({ ...reading, deviceId, profileId: deviceId });
  await storage.addBaseProfileReading({ ...reading, deviceId, profileId: deviceId - 1, fanSpeed: 3 });
  await storage.addBaseProfileReading({ ...reading, deviceId, profileId: deviceId,
    recordedAt: new Date(now - 49 * 3_600_000), fanSpeed: 1 });
  const saved = await storage.getBaseProfileHistory(deviceId, deviceId, 48);
  assert.equal(saved.length, 1, "48h range and profile isolation");
  assert.equal(saved[0].co2, 1250);
  assert.equal(saved[0].fanSpeed, 2);
  assert.equal(saved[0].sensorSources.co2.source, "external:11", "historical source retained");
  assert.equal((await storage.getBaseProfileHistory(deviceId - 1, deviceId)).length, 0, "device isolation");
  console.log("Grundprofil-Verlauf: Quellen, Frische, Lüfterstufen, Lücken, Speicherung und Zeitfenster bestanden.");
} finally {
  await db.delete(baseProfileReadings).where(eq(baseProfileReadings.deviceId, deviceId));
  await pool.end();
}
