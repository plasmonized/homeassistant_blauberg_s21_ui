/**
 * Professional Control Engine for Blauberg S21
 * Implements regulation schemas with proper control theory
 * - PID control for temperature, humidity, CO2
 * - Two-point control for summer/winter switching
 * - Night setback with temperature reduction
 * - Weather-compensated heating curve
 */

import { storage } from "../storage";
import { getModbusClient } from "./modbus";

// === PID CONTROLLER ===
interface PidState {
  integral: number;
  lastError: number;
  lastTime: number;
}

const pidStates = new Map<number, PidState>();

function pidControl(
  profileId: number,
  measuredValue: number,
  setpoint: number,
  kp: number,
  ki: number,
  kd: number,
  outputMin: number,
  outputMax: number,
  cycleTimeMs: number
): number {
  const state = pidStates.get(profileId) || { integral: 0, lastError: 0, lastTime: Date.now() };
  const now = Date.now();
  const dt = Math.min((now - state.lastTime) / 1000, 60); // Cap at 60s to prevent windup after long pause

  const error = setpoint - measuredValue;

  // Proportional
  const p = kp * error;

  // Integral with anti-windup
  state.integral += error * dt;
  state.integral = Math.max(outputMin / Math.max(ki, 0.001), Math.min(outputMax / Math.max(ki, 0.001), state.integral));
  const i = ki * state.integral;

  // Derivative (on measurement, not error, to avoid derivative kick)
  const d = kd * (measuredValue - state.lastError) / Math.max(dt, 0.1);

  const output = Math.max(outputMin, Math.min(outputMax, p + i + d));

  pidStates.set(profileId, {
    integral: state.integral,
    lastError: measuredValue,
    lastTime: now,
  });

  return output;
}

// === TWO-POINT CONTROL WITH HYSTERESIS ===
function twoPointControl(
  measuredValue: number,
  setpoint: number,
  hysteresis: number,
  state: boolean | undefined
): boolean {
  if (state === undefined) {
    return measuredValue > setpoint;
  }
  if (state && measuredValue < setpoint - hysteresis) {
    return false;
  }
  if (!state && measuredValue > setpoint + hysteresis) {
    return true;
  }
  return state;
}

// Hardware supports fan speeds 1-3 only. All schemas must clamp to this range
// regardless of what a (possibly stale) profile's parameters request.
const FAN_SPEED_MIN = 1;
const FAN_SPEED_MAX = 3;
function clampFanSpeed(value: number): number {
  return Math.max(FAN_SPEED_MIN, Math.min(FAN_SPEED_MAX, Math.round(value)));
}

// === CONTROL SCHEMA IMPLEMENTATIONS ===

export interface ControlResult {
  actionType: string;
  value: number;
  reason: string;
  mode?: number;          // optionaler Betriebsmodus (0=Lüftung, 1=Heizung, 2=Kühlung, 3=Auto)
  setpointTemp?: number;  // optionaler Raum-Sollwert (°C) für das Heizregister
}

export async function runTemperatureControl(
  profileId: number,
  deviceId: number,
  params: any,
  measuredValue: number
): Promise<ControlResult> {
  const {
    setpoint = 22,
    kp = 2.0,
    ki = 0.1,
    kd = 0.5,
    outputMin = 1,
    outputMax = 3,
  } = params;

  // PID control outputs fan speed (1-3)
  const output = pidControl(profileId, measuredValue, setpoint, kp, ki, kd, outputMin, outputMax, 30_000);
  const fanSpeed = clampFanSpeed(output);

  return {
    actionType: "fan_speed",
    value: fanSpeed,
    reason: `Temp: ${measuredValue.toFixed(1)}°C, Soll: ${setpoint}°C, PID: ${output.toFixed(2)}`,
  };
}

export async function runHumidityControl(
  profileId: number,
  deviceId: number,
  params: any,
  measuredValue: number
): Promise<ControlResult> {
  const {
    setpoint = 50,
    kp = 1.0,
    ki = 0.05,
    kd = 0.2,
    outputMin = 1,
    outputMax = 3,
  } = params;

  const output = pidControl(profileId, measuredValue, setpoint, kp, ki, kd, outputMin, outputMax, 30_000);
  const fanSpeed = clampFanSpeed(output);

  return {
    actionType: "fan_speed",
    value: fanSpeed,
    reason: `Humidity: ${measuredValue.toFixed(1)}%, Soll: ${setpoint}%, PID: ${output.toFixed(2)}`,
  };
}

export async function runCo2Control(
  profileId: number,
  deviceId: number,
  params: any,
  measuredValue: number
): Promise<ControlResult> {
  const {
    setpoint = 800,
    kp = 0.005,
    ki = 0.0001,
    kd = 0.001,
    outputMin = 1,
    outputMax = 3,
    emergencyThreshold = 1200,
  } = params;

  // Emergency boost if CO2 too high
  if (measuredValue > emergencyThreshold) {
    return {
      actionType: "fan_speed",
      value: FAN_SPEED_MAX,
      reason: `CO2 NOTFALL: ${measuredValue}ppm > ${emergencyThreshold}ppm, max Lüftung!`,
    };
  }

  const output = pidControl(profileId, measuredValue, setpoint, kp, ki, kd, outputMin, outputMax, 30_000);
  const fanSpeed = clampFanSpeed(output);

  return {
    actionType: "fan_speed",
    value: fanSpeed,
    reason: `CO2: ${measuredValue}ppm, Soll: ${setpoint}ppm, PID: ${output.toFixed(2)}`,
  };
}

// Two-point control for summer/winter mode switching
export async function runSummerWinterControl(
  profileId: number,
  deviceId: number,
  params: any,
  outdoorTemp: number,
  indoorTemp: number
): Promise<ControlResult> {
  const {
    summerSetpoint = 24,
    winterSetpoint = 20,
    switchTemp = 18,
    summerHysteresis = 1,
  } = params;

  // Determine season based on outdoor temperature
  const isSummer = outdoorTemp > switchTemp + (params._summerState ? 0 : summerHysteresis);
  const setpoint = isSummer ? summerSetpoint : winterSetpoint;
  const measured = indoorTemp;

  // Two-point control for mode switching
  const mode = isSummer ? 2 : 1; // 2=Cooling, 1=Heating

  return {
    actionType: "mode",
    value: mode,
    reason: `Außen: ${outdoorTemp}°C, ${isSummer ? "Sommer" : "Winter"}-Modus, Innen: ${measured}°C, Soll: ${setpoint}°C`,
  };
}

// Night setback control
export async function runNightSetback(
  profileId: number,
  deviceId: number,
  params: any,
  indoorTemp: number,
  currentTime: string
): Promise<ControlResult> {
  const {
    daySetpoint = 22,
    nightSetpoint = 18,
    nightStart = "22:00",
    nightEnd = "06:00",
    fanSpeedDay = 1,
    fanSpeedNight = 1,
  } = params;

  const [nightStartH, nightStartM] = nightStart.split(":").map(Number);
  const [nightEndH, nightEndM] = nightEnd.split(":").map(Number);
  const [nowH, nowM] = currentTime.split(":").map(Number);

  const nowMinutes = nowH * 60 + nowM;
  const nightStartMinutes = nightStartH * 60 + nightStartM;
  const nightEndMinutes = nightEndH * 60 + nightEndM;

  let isNight = false;
  if (nightStartMinutes <= nightEndMinutes) {
    isNight = nowMinutes >= nightStartMinutes && nowMinutes <= nightEndMinutes;
  } else {
    // Overnight (e.g. 22:00 - 06:00)
    isNight = nowMinutes >= nightStartMinutes || nowMinutes <= nightEndMinutes;
  }

  const setpoint = isNight ? nightSetpoint : daySetpoint;
  const fanSpeed = isNight ? fanSpeedNight : fanSpeedDay;

  // If temperature is far from setpoint, increase fan speed
  const deviation = Math.abs(indoorTemp - setpoint);
  const adjustedFanSpeed = clampFanSpeed(deviation > 2 ? fanSpeed + 1 : fanSpeed);

  return {
    actionType: "fan_speed",
    value: adjustedFanSpeed,
    reason: `${isNight ? "Nacht" : "Tag"}-Betrieb: ${indoorTemp}°C, Soll: ${setpoint}°C`,
  };
}

// Weather-compensated control
export async function runWeatherCompensated(
  profileId: number,
  deviceId: number,
  params: any,
  outdoorTemp: number,
  indoorTemp: number,
  co2?: number | null,
  humidity?: number | null,
): Promise<ControlResult> {
  const {
    roomSetpoint = 21,            // Raum-Sollwert (°C)
    comfortBand = 0.5,            // Toleranzband um den Sollwert (±°C) → nur Grundlüftung
    minOutdoorDelta = 1.0,        // Mindestdifferenz Außen/Innen, damit Lüften überhaupt hilft (°C)
    boostThreshold = 2.0,         // Abweichung vom Sollwert, ab der auf Maximum gelüftet wird (°C)
    baseFanSpeed = 1,             // Grundlüftung im Sollbereich (Stufe)
    activeFanSpeed = 2,           // Lüftung beim aktiven Regeln (Stufe)
    maxFanSpeed = 3,              // Maximale Lüftung beim Boost (Stufe)
    useHeater = false,            // Integriertes Elektro-Heizregister mitregeln
    heaterFanSpeed = 2,           // Lüfterstufe beim aktiven Heizen (Stufe)
    heatShutdownAbove = 32,       // Außentemperatur ab der die Anlage auf Standby geht (°C); 0 = deaktiviert
    co2OverrideThreshold = 1000,  // CO2-Grenzwert, der Standby verhindert und Stufe 1 erzwingt (ppm)
    humidityOverrideThreshold = 65, // Feuchte-Grenzwert, der Standby verhindert und Stufe 1 erzwingt (%)
  } = params;

  // ── HITZESCHUTZ ─────────────────────────────────────────────────────────────
  // Wenn die Außentemperatur den Abschaltschwellenwert überschreitet, schaltet
  // die Anlage auf Standby um den Wärmeeintrag zu stoppen. Ausnahme: wenn CO2
  // oder Luftfeuchte kritische Werte erreichen, wird Stufe 1 als Mindestlüftung
  // erzwungen – Frischluft hat dann Vorrang vor Hitzeschutz.
  if (typeof heatShutdownAbove === "number" && heatShutdownAbove > 0 && outdoorTemp >= heatShutdownAbove) {
    const co2High = co2 != null && co2 > co2OverrideThreshold;
    const humidityHigh = humidity != null && humidity > humidityOverrideThreshold;

    if (co2High || humidityHigh) {
      const overrides: string[] = [];
      if (co2High) overrides.push(`CO₂ ${co2}ppm > ${co2OverrideThreshold}ppm`);
      if (humidityHigh) overrides.push(`Feuchte ${(humidity as number).toFixed(1)}% > ${humidityOverrideThreshold}%`);
      return {
        actionType: "fan_speed",
        value: 1,
        reason: `Hitzeschutz (außen ${outdoorTemp.toFixed(1)}°C ≥ ${heatShutdownAbove}°C) – Override wegen ${overrides.join(", ")} → Stufe 1 Mindestlüftung`,
      };
    }

    return {
      actionType: "standby",
      value: 0,
      reason: `Hitzeschutz: außen ${outdoorTemp.toFixed(1)}°C ≥ ${heatShutdownAbove}°C, CO₂ und Feuchte im Normbereich → Anlage auf Standby`,
    };
  }
  // ────────────────────────────────────────────────────────────────────────────

  const dev = indoorTemp - roomSetpoint; // > 0 = Raum zu warm, < 0 = Raum zu kalt
  const indoorStr = indoorTemp.toFixed(1);
  const outdoorStr = outdoorTemp.toFixed(1);

  // Wenn das Heizregister mitgeregelt wird, hängen wir an jede Aktion den passenden
  // Betriebsmodus (0=Lüftung / 1=Heizung) und den Raum-Sollwert an. So schaltet die
  // Anlage das Heizregister automatisch wieder ab, sobald nicht mehr geheizt werden muss.
  const withMode = (r: ControlResult, heating: boolean): ControlResult =>
    useHeater
      ? { ...r, mode: heating ? 1 : 0, setpointTemp: roomSetpoint }
      : r;

  // Im Komfortband → nur Grundlüftung, kein aktives Heizen/Kühlen nötig
  if (Math.abs(dev) <= comfortBand) {
    const clampedBase = clampFanSpeed(baseFanSpeed);
    return withMode({
      actionType: "fan_speed",
      value: clampedBase,
      reason: `Im Sollbereich (innen ${indoorStr}°C ≈ Soll ${roomSetpoint}°C) → Grundlüftung Stufe ${clampedBase}`,
    }, false);
  }

  if (dev > 0) {
    // Raum ist ZU WARM → Kühlung gewünscht. Lüften hilft nur, wenn die Außenluft kühler ist.
    if (outdoorTemp <= indoorTemp - minOutdoorDelta) {
      const fanSpeed = clampFanSpeed(dev >= boostThreshold ? maxFanSpeed : activeFanSpeed);
      return withMode({
        actionType: "fan_speed",
        value: fanSpeed,
        reason: `Kühlen: innen ${indoorStr}°C > Soll ${roomSetpoint}°C, außen ${outdoorStr}°C kühler → Stufe ${fanSpeed}`,
      }, false);
    }
    // Außen gleich warm oder wärmer → Lüften würde den Raum weiter aufheizen.
    // Das Gerät kann automatisch nicht abgeschaltet werden (Power = manuell),
    // daher nur Grundlüftung Stufe 1.
    return withMode({
      actionType: "fan_speed",
      value: 1,
      reason: `Minimale Lüftung (Stufe 1): Raum ${indoorStr}°C bereits zu warm und außen ${outdoorStr}°C nicht kühler – stärkeres Lüften würde aufheizen`,
    }, false);
  }

  // Raum ist ZU KALT → Erwärmung gewünscht. Lüften hilft nur, wenn die Außenluft wärmer ist.
  if (outdoorTemp >= indoorTemp + minOutdoorDelta) {
    const fanSpeed = clampFanSpeed(Math.abs(dev) >= boostThreshold ? maxFanSpeed : activeFanSpeed);
    return withMode({
      actionType: "fan_speed",
      value: fanSpeed,
      reason: `Erwärmen: innen ${indoorStr}°C < Soll ${roomSetpoint}°C, außen ${outdoorStr}°C wärmer → kostenlose Wärme von außen, Stufe ${fanSpeed}`,
    }, false);
  }

  // Außen gleich kalt oder kälter → Lüften allein würde den Raum weiter abkühlen.
  if (useHeater) {
    // Integriertes Heizregister übernimmt: Anlage auf Heizung stellen und mit Luftstrom
    // betreiben, damit die Zuluft erwärmt wird. Die Firmware moduliert das Heizregister
    // selbstständig auf den Raum-Sollwert (HR_SetTEMP).
    const fanSpeed = clampFanSpeed(Math.abs(dev) >= boostThreshold ? maxFanSpeed : heaterFanSpeed);
    return withMode({
      actionType: "fan_speed",
      value: fanSpeed,
      reason: `Heizen: innen ${indoorStr}°C < Soll ${roomSetpoint}°C, außen ${outdoorStr}°C kälter → Heizregister an, Stufe ${fanSpeed}`,
    }, true);
  }
  // Kein Heizregister aktiviert → nur Grundlüftung, damit der Raum nicht weiter
  // auskühlt. Power = manuell, daher kein automatisches Abschalten.
  return {
    actionType: "fan_speed",
    value: 1,
    reason: `Minimale Lüftung (Stufe 1): Raum ${indoorStr}°C bereits zu kalt und außen ${outdoorStr}°C nicht wärmer – stärkeres Lüften würde abkühlen (Heizregister nicht aktiviert)`,
  };
}

// Reset PID state for a profile
export function resetPidState(profileId: number): void {
  pidStates.delete(profileId);
}
