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

// === HEATING CURVE (weather compensated) ===
function heatingCurve(
  outdoorTemp: number,
  setpoint: number,
  slope: number,
  offset: number,
  minSupply: number,
  maxSupply: number
): number {
  // Calculate supply temperature based on outdoor temperature
  const supplyTemp = setpoint + slope * (setpoint - outdoorTemp) / 20 + offset;
  return Math.max(minSupply, Math.min(maxSupply, supplyTemp));
}

// === CONTROL SCHEMA IMPLEMENTATIONS ===

export interface ControlResult {
  actionType: string;
  value: number;
  reason: string;
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
    outputMin = 0,
    outputMax = 3,
  } = params;

  // PID control outputs fan speed (0-3)
  const output = pidControl(profileId, measuredValue, setpoint, kp, ki, kd, outputMin, outputMax, 30_000);
  const fanSpeed = Math.round(output);

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
    outputMin = 0,
    outputMax = 3,
  } = params;

  const output = pidControl(profileId, measuredValue, setpoint, kp, ki, kd, outputMin, outputMax, 30_000);
  const fanSpeed = Math.round(output);

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
    outputMin = 0,
    outputMax = 3,
    emergencyThreshold = 1200,
  } = params;

  // Emergency boost if CO2 too high
  if (measuredValue > emergencyThreshold) {
    return {
      actionType: "fan_speed",
      value: 3,
      reason: `CO2 NOTFALL: ${measuredValue}ppm > ${emergencyThreshold}ppm, max Lüftung!`,
    };
  }

  const output = pidControl(profileId, measuredValue, setpoint, kp, ki, kd, outputMin, outputMax, 30_000);
  const fanSpeed = Math.round(output);

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
    fanSpeedNight = 0,
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
  const adjustedFanSpeed = deviation > 2 ? Math.min(3, fanSpeed + 1) : fanSpeed;

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
  indoorTemp: number
): Promise<ControlResult> {
  const {
    roomSetpoint = 21,
    heatingCurveSlope = 1.5,
    heatingCurveOffset = 20,
    minSupply = 16,
    maxSupply = 50,
  } = params;

  // Calculate supply temperature from heating curve
  const supplyTemp = heatingCurve(outdoorTemp, roomSetpoint, heatingCurveSlope, heatingCurveOffset, minSupply, maxSupply);

  // Adjust fan speed based on difference between indoor temp and setpoint
  const deviation = indoorTemp - roomSetpoint;
  let fanSpeed = 2;
  if (deviation > 3.0) fanSpeed = 0;      // Viel zu warm – Lüftung aus
  else if (deviation > 1.5) fanSpeed = 1; // Zu warm – reduzieren
  else if (deviation < -1.5) fanSpeed = 3; // Zu kalt – boost

  return {
    actionType: "fan_speed",
    value: fanSpeed,
    reason: `Außen: ${outdoorTemp}°C, Heizkurve: ${supplyTemp.toFixed(1)}°C, Innen: ${indoorTemp}°C`,
  };
}

// Reset PID state for a profile
export function resetPidState(profileId: number): void {
  pidStates.delete(profileId);
}
