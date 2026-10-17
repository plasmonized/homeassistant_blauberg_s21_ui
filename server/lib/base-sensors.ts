export type Measurement = "indoor_temp" | "outdoor_temp" | "humidity" | "co2";
export const MEASUREMENTS: Measurement[] = ["indoor_temp", "outdoor_temp", "humidity", "co2"];

export function compatibleInternal(sensor: any, type: Measurement): boolean {
  const tags: string[] = sensor.tags || [];
  if (!tags.includes("sensor")) return false;
  if (type === "indoor_temp") return tags.includes("temperature") && (tags.includes("indoor") || tags.includes("extract"));
  if (type === "outdoor_temp") return tags.includes("temperature") && tags.includes("outdoor");
  if (type === "humidity") return tags.includes("humidity") && !tags.includes("outdoor");
  return tags.includes("co2");
}

export function compatibleExternal(sensor: any, type: Measurement): boolean {
  const types: Record<Measurement, string[]> = {
    indoor_temp: ["indoor_temp", "temperature"],
    outdoor_temp: ["outdoor_temp", "temperature"],
    humidity: ["humidity", "indoor_humidity"],
    co2: ["co2"],
  };
  return types[type].includes(sensor.sensorType);
}

export function resolveBaseSensor(
  type: Measurement, source: string | undefined, registers: any[], externals: any[],
  maxAgeMs: number, now = Date.now(),
): number | null {
  const [kind, rawId] = (source || "internal").split(":");
  const id = rawId ? Number(rawId) : undefined;
  const sensor = kind === "external"
    ? externals.find(s => s.id === id && compatibleExternal(s, type))
    : registers.find(s => (id === undefined || s.id === id) && compatibleInternal(s, type));
  if (!sensor || sensor.lastValue === null || String(sensor.lastValue).trim() === "" || !sensor.updatedAt) return null;
  const age = now - new Date(sensor.updatedAt).getTime();
  if (!Number.isFinite(age) || age < -60_000 || age > maxAgeMs) return null;
  const value = Number(sensor.lastValue);
  if (!Number.isFinite(value)) return null;
  if (type === "humidity" && (value < 0 || value > 100)) return null;
  if (type === "co2" && (value < 0 || value > 100_000)) return null;
  if (type.endsWith("_temp") && (value < -60 || value > 80)) return null;
  return value;
}
