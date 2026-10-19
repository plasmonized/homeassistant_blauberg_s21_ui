import { compatibleExternal, compatibleInternal, resolveBaseSensor, type Measurement } from "./base-sensors";
import type { BaseProfileReading, InsertBaseProfileReading } from "@shared/schema";

const KEYS = { indoorTemp: "indoor_temp", outdoorTemp: "outdoor_temp", co2: "co2", humidity: "humidity" } as const;

export function describeBaseSources(parameters: any, registers: any[], externals: any[]) {
  return Object.fromEntries(Object.entries(KEYS).map(([key, type]) => {
    const configured = parameters?.sensorSources?.[type] || "internal";
    const [kind, rawId] = configured.split(":");
    const id = rawId ? Number(rawId) : undefined;
    const sensor = kind === "external"
      ? externals.find(s => s.id === id && compatibleExternal(s, type))
      : registers.find(s => (id === undefined || s.id === id) && compatibleInternal(s, type));
    return [key, {
      label: sensor?.name || (kind === "external" ? "Externer Sensor nicht verfügbar" : "Interner Sensor nicht verfügbar"),
      source: sensor ? `${kind}:${sensor.id}` : configured,
    }];
  }));
}

export function createBaseHistoryReading(
  deviceId: number, profile: { id: number; parameters?: any },
  registers: any[], externals: any[], actualRegisters: any[],
  maxAgeMs: number, standby: boolean, now = Date.now(),
): InsertBaseProfileReading {
  const parameters = profile.parameters || {};
  const measurement = (type: Measurement) =>
    resolveBaseSensor(type, parameters.sensorSources?.[type], registers, externals, maxAgeMs, now);
  const fan = actualRegisters.find(r => r.isWritable && r.tags?.includes("fan"));
  const power = actualRegisters.find(r => r.isWritable && r.tags?.includes("power"));
  const fresh = (r: any) => r?.updatedAt && Number.isFinite(new Date(r.updatedAt).getTime()) &&
    now - new Date(r.updatedAt).getTime() >= -60_000 && now - new Date(r.updatedAt).getTime() <= maxAgeMs;
  const fanValue = fan?.lastValue == null || String(fan.lastValue).trim() === "" ? NaN : Number(fan.lastValue);
  const powerOff = fresh(power) && ["0", "false"].includes(String(power.lastValue).toLowerCase());
  return {
    deviceId, profileId: profile.id, recordedAt: new Date(now),
    indoorTemp: measurement("indoor_temp"), outdoorTemp: measurement("outdoor_temp"),
    co2: measurement("co2"), humidity: measurement("humidity"),
    fanSpeed: standby || powerOff ? 0
      : fresh(fan) && Number.isInteger(fanValue) && fanValue >= 1 && fanValue <= 3 ? fanValue : null,
    sensorSources: describeBaseSources(parameters, registers, externals),
  };
}

// Keep the last actual sample per bucket; never average fan stages into 1.5.
export function bucketBaseHistory(rows: BaseProfileReading[]) {
  const buckets = new Map<number, BaseProfileReading>();
  for (const row of rows) {
    const bucket = Math.floor(new Date(row.recordedAt).getTime() / 300_000) * 300_000;
    const previous = buckets.get(bucket);
    if (!previous || new Date(row.recordedAt).getTime() >= new Date(previous.recordedAt).getTime()) buckets.set(bucket, row);
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b).map(([t, row]) => ({
    t: new Date(t).toISOString(), indoorTemp: row.indoorTemp, outdoorTemp: row.outdoorTemp,
    co2: row.co2, humidity: row.humidity, fanSpeed: row.fanSpeed,
  }));
}
