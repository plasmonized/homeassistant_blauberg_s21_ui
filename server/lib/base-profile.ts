import { z } from "zod";
import { runWeatherCompensated, type ControlResult } from "./control-engine";

export const BASE_DEFAULTS = {
  roomSetpoint: 21, comfortBand: 0.5, minOutdoorDelta: 1,
  boostThreshold: 2, baseFanSpeed: 1, activeFanSpeed: 2, maxFanSpeed: 3,
  holdMinutes: 10, useHeater: false, heaterFanSpeed: 2,
  heatProtectionEnabled: true, heatShutdownAbove: 32,
  co2ControlEnabled: true, co2Setpoint: 1000, co2BoostThreshold: 1500,
  co2Hysteresis: 50, humidityControlEnabled: true, humiditySetpoint: 60,
  humidityBoostThreshold: 70, humidityHysteresis: 3,
  sensorSources: {},
};

const finite = (min: number, max: number) => z.number().finite().min(min).max(max);
export const baseParametersSchema = z.object({
  roomSetpoint: finite(5, 35).default(21),
  comfortBand: finite(0, 5).default(0.5),
  minOutdoorDelta: finite(0.1, 10).default(1),
  boostThreshold: finite(0.1, 15).default(2),
  baseFanSpeed: finite(1, 3).int().default(1),
  activeFanSpeed: finite(1, 3).int().default(2),
  maxFanSpeed: finite(1, 3).int().default(3),
  holdMinutes: finite(0, 120).default(10),
  useHeater: z.boolean().default(false),
  heaterFanSpeed: finite(1, 3).int().default(2),
  heatProtectionEnabled: z.boolean().default(true),
  heatShutdownAbove: finite(0, 60).default(32),
  co2ControlEnabled: z.boolean().default(true),
  co2Setpoint: finite(300, 5000).default(1000),
  co2BoostThreshold: finite(301, 10000).default(1500),
  co2Hysteresis: finite(0, 500).default(50),
  humidityControlEnabled: z.boolean().default(true),
  humiditySetpoint: finite(10, 95).default(60),
  humidityBoostThreshold: finite(11, 100).default(70),
  humidityHysteresis: finite(0, 20).default(3),
  sensorSources: z.object({
    indoor_temp: z.string().regex(/^(internal|internal:\d+|external:\d+)$/).optional(),
    outdoor_temp: z.string().regex(/^(internal|internal:\d+|external:\d+)$/).optional(),
    co2: z.string().regex(/^(internal|internal:\d+|external:\d+)$/).optional(),
    humidity: z.string().regex(/^(internal|internal:\d+|external:\d+)$/).optional(),
  }).default({}),
}).superRefine((p, ctx) => {
  for (const [low, high, h] of [
    ["co2Setpoint", "co2BoostThreshold", "co2Hysteresis"],
    ["humiditySetpoint", "humidityBoostThreshold", "humidityHysteresis"],
  ] as const) {
    if (p[high] <= p[low] || p[h] >= p[high] - p[low]) {
      ctx.addIssue({ code: "custom", path: [high], message: "Boost-Grenzwert muss über dem Sollwert liegen; Hysterese muss kleiner als der Abstand sein." });
    }
  }
});

export type AirDemand = { co2: number; humidity: number };

// Separate hysteresis per requirement; never let a previous temperature demand
// masquerade as a CO₂/feuchte demand.
export function demandLevel(value: number, threshold: number, boost: number, hysteresis: number, last: number): number {
  if (value >= boost || (last === 3 && value > boost - hysteresis)) return 3;
  if (value >= threshold || (last >= 2 && value > threshold - hysteresis)) return 2;
  return 0;
}

export async function runBaseProfile(
  profileId: number, deviceId: number, raw: unknown,
  indoor: number | null, outdoor: number | null,
  co2: number | null, humidity: number | null,
  last: AirDemand = { co2: 0, humidity: 0 },
): Promise<{ result: ControlResult; demand: AirDemand }> {
  const p = baseParametersSchema.parse(raw);
  const missing: string[] = [];
  const demand = { co2: 0, humidity: 0 };
  const reasons: string[] = [];
  if (p.co2ControlEnabled) {
    if (co2 === null) missing.push("CO₂-Sensor");
    else {
      demand.co2 = demandLevel(co2, p.co2Setpoint, p.co2BoostThreshold, p.co2Hysteresis, last.co2);
      reasons.push(`CO₂ ${co2.toFixed(0)} ppm → ${demand.co2 || "kein Mehrbedarf"}`);
    }
  }
  if (p.humidityControlEnabled) {
    if (humidity === null) missing.push("Feuchtesensor");
    else {
      demand.humidity = demandLevel(humidity, p.humiditySetpoint, p.humidityBoostThreshold, p.humidityHysteresis, last.humidity);
      reasons.push(`Feuchte ${humidity.toFixed(1)} % → ${demand.humidity || "kein Mehrbedarf"}`);
    }
  }
  let base: ControlResult;
  if (indoor === null || outdoor === null) {
    missing.push("Temperatursensor");
    base = { actionType: "fan_speed", value: p.baseFanSpeed, reason: "Temperaturregelung nicht verfügbar, Grundlüftung",
      ...(p.useHeater ? { mode: 0, setpointTemp: p.roomSetpoint } : {}) };
  } else {
    // The base profile owns air-quality arbitration, including standby overrides.
    base = await runWeatherCompensated(profileId, deviceId, p, outdoor, indoor, null, null);
    if (base.actionType === "standby") {
      base = { ...base, reason: `Hitzeschutz: außen ${outdoor.toFixed(1)}°C ≥ ${p.heatShutdownAbove}°C → Standby angefordert` };
    }
  }
  const airSpeed = Math.max(demand.co2, demand.humidity);
  let result = base;
  if (airSpeed > base.value || (base.actionType === "standby" && missing.length > 0)) {
    result = { ...base, actionType: "fan_speed", value: Math.max(airSpeed, 1) };
    if (base.actionType === "standby" && p.useHeater) result = { ...result, mode: 0, setpointTemp: p.roomSetpoint };
    if (base.actionType === "standby") reasons.push(`Hitzeschutz – Override wegen ${airSpeed > 0 ? "Luftqualität" : "fehlender Sensorwerte"} → Stufe ${result.value}`);
  }
  result = {
    ...result,
    reason: `Grundprofil: ${base.reason}; ${reasons.join("; ")}${missing.length ? `; WARNUNG: ${missing.join(", ")} fehlt/veraltet – kein Standby` : ""} → ${result.actionType === "standby" ? "Standby" : `Stufe ${result.value}`}`,
  };
  return { result, demand };
}

export function effectiveProfiles<T extends { enabled: boolean | null; schemaType: string }>(profiles: T[]): T[] {
  const active = profiles.filter(p => p.enabled);
  const base = active.find(p => p.schemaType === "base_profile");
  return base ? [base] : active;
}
