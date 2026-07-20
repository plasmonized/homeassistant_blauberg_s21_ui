import { storage } from "../storage";
import type { InsertSensorReading } from "@shared/schema";
import { getModbusClient, closeConnection } from "./modbus";
import { pollDeviceRegisters } from "./poll";
import { getHomeAssistantState } from "./ha-client";
import { connectMqtt, isMqttConnected } from "./mqtt-client";
import { discoverDevice, publishRegisterStates, setupCommandHandlers } from "./mqtt-discovery";
import {
  runTemperatureControl,
  runHumidityControl,
  runCo2Control,
  runSummerWinterControl,
  runNightSetback,
  runWeatherCompensated,
  type ControlResult,
  resetPidState,
} from "./control-engine";

let automationInterval: NodeJS.Timeout | null = null;

// Watchdog: track consecutive poll cycles where at least one register read failed.
// After PARTIAL_FAIL_THRESHOLD such cycles the connection is force-closed so the
// next cycle opens a fresh TCP socket instead of continuing with a zombie client.
const consecutivePartialFailures: Record<number, number> = {};
const PARTIAL_FAIL_THRESHOLD = 3;

// In-memory record of the last executed action per control profile.
// Used to enforce hold-time (Mindesthaltedauer) and skip redundant writes.
// Keyed by profile ID.
const profileLastAction = new Map<number, { value: number; ts: number }>();

// Timestamp of the last sensor history recording (ms). We record every 5 minutes.
let lastSensorRecordedAt = 0;
const SENSOR_RECORD_INTERVAL_MS = 5 * 60 * 1000;

// Honor the addon's configured `poll_interval` (seconds, forwarded via the
// POLL_INTERVAL env var from run.sh). Falls back to 10s if unset/invalid.
function resolvePollIntervalMs(): number {
  const configured = Number(process.env.POLL_INTERVAL);
  if (Number.isFinite(configured) && configured > 0) {
    return configured * 1000;
  }
  return 10_000;
}

const POLL_INTERVAL_MS = resolvePollIntervalMs();
let mqttInitialized = false;

// Track last execution time per rule to prevent immediate re-trigger
const lastExecution = new Map<number, { value: number; timestamp: number }>();

// Weather API integration (free OpenWeatherMap via API key, or simple fallback)
// For now, we'll use a configurable mock. In production, user would configure an API key.
let cachedForecast: { temp: number; timestamp: number } | null = null;

async function fetchForecastTemp(): Promise<number | null> {
  // If user has a weather API key, we could fetch real data here
  // For now, return cached or null
  if (cachedForecast && Date.now() - cachedForecast.timestamp < 3_600_000) {
    return cachedForecast.temp;
  }
  return null;
}

export function setForecastTemp(temp: number) {
  cachedForecast = { temp, timestamp: Date.now() };
}

async function getSensorValue(
  registers: any[],
  sensorType: string,
  externalSensors?: any[],
  externalSensorId?: number | null
): Promise<number | null> {
  const findReg = (name: string) => registers.find((r) => r.name.includes(name));
  const findExt = (type: string) => externalSensors?.find((s) => s.sensorType === type && s.lastValue !== null);

  // If a specific external sensor is linked, use it directly
  if (externalSensorId) {
    const sensor = externalSensors?.find((s) => s.id === externalSensorId);
    if (sensor && sensor.lastValue !== null) {
      // Binary sensors (HA binary_sensor domain) report "on"/"off" - map to
      // 1/0 so the existing numeric operator/threshold comparisons work.
      if (sensor.sensorType === "binary") {
        return sensor.lastValue === "on" ? 1 : 0;
      }
      return parseFloat(sensor.lastValue);
    }
  }

  switch (sensorType) {
    case "outdoor_temp": {
      // Prefer a dedicated outdoor sensor, fall back to a generic temperature sensor
      const ext = findExt("outdoor_temp") || findExt("temperature");
      if (ext) return parseFloat(ext.lastValue);
      const reg = findReg("Outdoor");
      return reg?.lastValue != null ? parseFloat(reg.lastValue) : null;
    }
    case "indoor_temp": {
      const ext = findExt("indoor_temp");
      if (ext) return parseFloat(ext.lastValue);
      // Otherwise use average of supply and extract as indoor temperature
      const supply = findReg("Supply");
      const extract = findReg("Extract");
      const sVal = supply?.lastValue != null ? parseFloat(supply.lastValue) : null;
      const eVal = extract?.lastValue != null ? parseFloat(extract.lastValue) : null;
      if (sVal !== null && eVal !== null) return (sVal + eVal) / 2;
      return sVal ?? eVal ?? null;
    }
    case "humidity": {
      const ext = findExt("humidity") ?? findExt("indoor_humidity");
      if (ext) return parseFloat(ext.lastValue);
      // Prefer indoor humidity register for control; fall back to any humidity register
      const reg =
        registers.find((r) => (r.tags ?? []).includes("humidity") && (r.tags ?? []).includes("indoor")) ??
        findReg("Humidity");
      return reg?.lastValue !== null ? parseFloat(reg.lastValue) : null;
    }
    case "indoor_humidity": {
      const ext = findExt("indoor_humidity") ?? findExt("humidity");
      if (ext) return parseFloat(ext.lastValue);
      const reg = registers.find((r) => (r.tags ?? []).includes("humidity") && (r.tags ?? []).includes("indoor"))
        ?? findReg("Humidity");
      return reg?.lastValue !== null ? parseFloat(reg.lastValue) : null;
    }
    case "outdoor_humidity": {
      const ext = findExt("outdoor_humidity");
      if (ext) return parseFloat(ext.lastValue);
      const reg = registers.find((r) => (r.tags ?? []).includes("humidity") && (r.tags ?? []).includes("outdoor"));
      return reg?.lastValue !== null ? parseFloat(reg.lastValue) : null;
    }
    case "co2": {
      const ext = findExt("co2");
      if (ext) return parseFloat(ext.lastValue);
      const reg = findReg("CO2");
      return reg?.lastValue !== null ? parseFloat(reg.lastValue) : null;
    }
    case "forecast_temp": {
      const ext = findExt("forecast_temp");
      if (ext) return parseFloat(ext.lastValue);
      return fetchForecastTemp();
    }
    default:
      return null;
  }
}

function evaluateCondition(sensorValue: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case "gt": return sensorValue > threshold;
    case "lt": return sensorValue < threshold;
    case "gte": return sensorValue >= threshold;
    case "lte": return sensorValue <= threshold;
    case "eq": return sensorValue === threshold;
    default: return false;
  }
}

function isInTimeRange(timeFrom: string | null, timeTo: string | null): boolean {
  if (!timeFrom && !timeTo) return true;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (timeFrom && !timeTo) {
    const [h, m] = timeFrom.split(":").map(Number);
    return currentMinutes >= h * 60 + m;
  }
  if (!timeFrom && timeTo) {
    const [h, m] = timeTo.split(":").map(Number);
    return currentMinutes <= h * 60 + m;
  }
  if (timeFrom && timeTo) {
    const [fh, fm] = timeFrom.split(":").map(Number);
    const [th, tm] = timeTo.split(":").map(Number);
    const fromMin = fh * 60 + fm;
    const toMin = th * 60 + tm;
    if (fromMin <= toMin) {
      return currentMinutes >= fromMin && currentMinutes <= toMin;
    } else {
      // Overnight range (e.g. 22:00 - 06:00)
      return currentMinutes >= fromMin || currentMinutes <= toMin;
    }
  }
  return true;
}

function isSeasonMatch(season: string): boolean {
  if (season === "all") return true;
  const month = new Date().getMonth() + 1; // 1-12
  const isSummer = month >= 5 && month <= 9; // May-September
  return season === "summer" ? isSummer : !isSummer;
}

async function executeRuleAction(
  deviceId: number,
  rule: any,
  registers: any[]
): Promise<{ success: boolean; message: string }> {
  try {
    const device = await storage.getDevice(deviceId);
    if (!device || !device.isConnected) {
      return { success: false, message: "Device not connected" };
    }

    const client = await getModbusClient(device.id, device.ip, device.port, device.slaveId);

    // Find the target register
    let targetReg: any;
    switch (rule.actionType) {
      case "fan_speed":
        targetReg = registers.find((r) => r.name.includes("Fan Speed"));
        break;
      case "bypass":
        targetReg = registers.find((r) => r.name.includes("Bypass"));
        break;
      case "mode":
        targetReg = registers.find((r) => r.name.includes("Operation Mode"));
        break;
      case "boost":
        targetReg = registers.find((r) => r.name.includes("Boost Switch"));
        break;
    }

    if (!targetReg) {
      return { success: false, message: `Target register not found for action ${rule.actionType}` };
    }

    let valueToWrite = rule.actionValue;

    // Safety clamp: fan speed must stay within the valid 1-3 hardware range,
    // regardless of what a (possibly stale) automation rule's actionValue requests.
    if (rule.actionType === "fan_speed") {
      valueToWrite = Math.max(1, Math.min(3, Math.round(Number(valueToWrite))));
    }

    const storedValue = valueToWrite;

    if (targetReg.scale && targetReg.scale !== 1) {
      valueToWrite = valueToWrite * targetReg.scale;
    }

    if (targetReg.type === "holding") {
      await client.writeSingleRegister(targetReg.address, valueToWrite);
    } else if (targetReg.type === "coil") {
      await client.writeSingleCoil(targetReg.address, Boolean(valueToWrite));
    } else {
      return { success: false, message: "Register type not writable" };
    }

    await storage.updateRegisterValue(targetReg.id, storedValue);

    return {
      success: true,
      message: `Set ${rule.actionType} to ${storedValue}`,
    };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

async function runAutomationCycle() {
  try {
    const devices = await storage.getDevices();
    for (const device of devices) {
      // Always attempt a poll, even if the device is currently marked
      // disconnected. pollDeviceRegisters() opens a fresh Modbus connection
      // (via getModbusClient's lazy reconnect) when needed and flips
      // isConnected back to true on success - so a device that dropped its
      // connection (server restart, brief network blip, S21 reboot, etc.)
      // reconnects automatically on the next poll cycle instead of staying
      // disconnected until the user manually clicks "Connect".
      const pollResult = await pollDeviceRegisters(device.id);
      if (!pollResult.success) {
        // Full failure (TCP connect failed or all registers offline).
        // poll.ts already called closeConnection; reset watchdog counter.
        consecutivePartialFailures[device.id] = 0;
        continue;
      }

      // Partial failures: individual register reads failed even though the
      // TCP connection appeared alive.  This is the "zombie client" scenario:
      // the Modbus client reported Offline/Timeout while socket.writable was
      // still true.  Count consecutive bad cycles and force a reconnect after
      // PARTIAL_FAIL_THRESHOLD to shake out the stale socket.
      if ((pollResult.failedCount ?? 0) > 0) {
        consecutivePartialFailures[device.id] = (consecutivePartialFailures[device.id] ?? 0) + 1;
        if (consecutivePartialFailures[device.id] >= PARTIAL_FAIL_THRESHOLD) {
          console.warn(
            `[Watchdog] Device ${device.id}: ${consecutivePartialFailures[device.id]} consecutive` +
            ` cycles with partial failures – forcing reconnect`
          );
          closeConnection(device.id);
          consecutivePartialFailures[device.id] = 0;
        }
      } else {
        // All registers read successfully – reset watchdog.
        consecutivePartialFailures[device.id] = 0;
      }

      // Ensure MQTT discovery is set up for this device
      if (isMqttConnected()) {
        await discoverDevice(device.id);
      }

      const rules = await storage.getAutomationRules(device.id);
      const registers = await storage.getRegisters(device.id);
      const externalSensors = await storage.getExternalSensors(device.id);

      // Publish register states to MQTT
      if (isMqttConnected()) {
        await publishRegisterStates(device.id);
      }

      // Sync Home Assistant sensors before evaluating rules
      for (const sensor of externalSensors) {
        if (sensor.sourceType === 'homeassistant' && sensor.entityId) {
          try {
            const haState = await getHomeAssistantState(sensor.entityId);
            if (haState && haState.state && haState.state !== 'unavailable') {
              await storage.updateExternalSensorValue(sensor.id, haState.state);
            }
          } catch (err) {
            // Silently fail - HA might be temporarily unavailable
          }
        }
      }

      // Compute virtual average sensors (after HA sync so source sensors have fresh values)
      const freshSensors = await storage.getExternalSensors(device.id);
      for (const sensor of freshSensors) {
        if (sensor.sourceType === 'virtual_avg') {
          const cfg = sensor.config as { sourceIds?: number[] } | null;
          if (cfg?.sourceIds?.length) {
            const vals = freshSensors
              .filter((s) => cfg.sourceIds!.includes(s.id) && s.lastValue !== null)
              .map((s) => parseFloat(String(s.lastValue)))
              .filter((v) => !isNaN(v));
            if (vals.length > 0) {
              const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
              const rounded = Math.round(avg * 10) / 10;
              await storage.updateExternalSensorValue(sensor.id, String(rounded));
              sensor.lastValue = String(rounded); // update in-memory for profiles below
            }
          }
        }
      }

      // Run control profiles (regulation schemas) — fresh sensors include HA + virtual avg values
      const profiles = await storage.getControlProfiles(device.id);
      for (const profile of profiles) {
        if (!profile.enabled) continue;
        await evaluateControlProfile(device.id, profile, registers, freshSensors);
      }

      // Record sensor readings every 5 minutes for history charts
      const nowMs = Date.now();
      if (nowMs - lastSensorRecordedAt >= SENSOR_RECORD_INTERVAL_MS) {
        lastSensorRecordedAt = nowMs;
        const readings: InsertSensorReading[] = [];
        for (const reg of registers) {
          if (reg.lastValue !== null && reg.lastValue !== undefined) {
            const num = parseFloat(String(reg.lastValue));
            if (!Number.isNaN(num)) {
              readings.push({ deviceId: device.id, registerId: reg.id, value: num });
            }
          }
        }
        if (readings.length > 0) {
          await storage.addSensorReadings(readings);
        }
        await storage.pruneOldSensorReadings(50);
      }

      if (rules.length === 0) continue;

      // Multiple rules can independently want "boost" on (e.g. two different
      // timed HA-binary-sensor triggers, or a timed trigger alongside a
      // classic threshold rule). Track that across the loop so a single
      // rule's timer expiring doesn't switch boost off while another rule
      // still needs it on.
      let boostWantedThisCycle = false;
      let boostExpiredThisCycle = false;
      let expiredRuleId: number | null = null;

      for (const rule of rules) {
        if (!rule.enabled) continue;
        if (!isSeasonMatch(rule.season)) continue;
        if (!isInTimeRange(rule.timeFrom, rule.timeTo)) continue;

        const sensorValue = await getSensorValue(registers, rule.sensorType, externalSensors, rule.externalSensorId);
        const conditionMet = sensorValue !== null && evaluateCondition(sensorValue, rule.operator, rule.threshold);

        // Timed boost rules (e.g. "boost for 20min when HA binary sensor
        // turns on") own a persisted expiry window instead of just mirroring
        // the live condition every cycle like regular rules do.
        if (rule.actionType === "boost" && rule.actionDurationMinutes) {
          const now = Date.now();
          const wasActive = rule.activeUntil ? new Date(rule.activeUntil).getTime() > now : false;

          if (conditionMet) {
            boostWantedThisCycle = true;
            const newActiveUntil = new Date(now + rule.actionDurationMinutes * 60_000);
            await storage.updateAutomationRule(rule.id, { activeUntil: newActiveUntil });

            if (!wasActive) {
              // Rising edge: switch boost on and log the start of the timer.
              const result = await executeRuleAction(device.id, rule, registers);
              await storage.createAutomationLog({
                ruleId: rule.id,
                deviceId: device.id,
                sensorValue: Math.round((sensorValue ?? 0) * 10),
                actionTaken: `boost=1 (${rule.actionDurationMinutes}min Timer gestartet)`,
                success: result.success,
                message: result.message,
              });
            }
            // else: still within an active window, timer just refreshed - no
            // need to re-write the register or log every cycle.
          } else if (wasActive) {
            // Trigger sensor is no longer "on", but the timer is still
            // counting down - keep boost on until it elapses.
            boostWantedThisCycle = true;
          } else if (rule.activeUntil) {
            // Timer just elapsed this cycle.
            await storage.updateAutomationRule(rule.id, { activeUntil: null });
            boostExpiredThisCycle = true;
            expiredRuleId = rule.id;
            await storage.createAutomationLog({
              ruleId: rule.id,
              deviceId: device.id,
              sensorValue: sensorValue !== null ? Math.round(sensorValue * 10) : null,
              actionTaken: "Timer abgelaufen",
              success: true,
              message: `Boost-Timer für Regel "${rule.name}" abgelaufen`,
            });
          }
          continue;
        }

        if (sensorValue === null) continue;
        if (!conditionMet) continue;

        // A currently-true classic (non-timed) boost rule should also count
        // towards "something wants boost on", for the same reason as above.
        if (rule.actionType === "boost" && rule.actionValue) {
          boostWantedThisCycle = true;
        }

        // Hysteresis check: if we already triggered this rule recently with similar value
        const lastExec = lastExecution.get(rule.id);
        if (lastExec) {
          const timeSince = Date.now() - lastExec.timestamp;
          const valueDiff = Math.abs(sensorValue - lastExec.value);
          if (timeSince < 120_000 && valueDiff < (rule.hysteresis || 1)) {
            continue; // Skip to prevent flapping
          }
        }

        // Execute action
        const result = await executeRuleAction(device.id, rule, registers);

        // Log execution
        await storage.createAutomationLog({
          ruleId: rule.id,
          deviceId: device.id,
          sensorValue: Math.round(sensorValue * 10),
          actionTaken: `${rule.actionType}=${rule.actionValue}`,
          success: result.success,
          message: result.message,
        });

        if (result.success) {
          lastExecution.set(rule.id, { value: sensorValue, timestamp: Date.now() });
        }
      }

      // A timed boost rule's window just closed - only actually switch boost
      // off if nothing else (another still-active timed rule, or a live
      // classic boost rule) wants it on this cycle.
      if (boostExpiredThisCycle && !boostWantedThisCycle && expiredRuleId !== null) {
        const result = await executeRuleAction(device.id, { actionType: "boost", actionValue: 0 }, registers);
        await storage.createAutomationLog({
          ruleId: expiredRuleId,
          deviceId: device.id,
          sensorValue: null,
          actionTaken: "boost=0 (automatisch, Timer abgelaufen)",
          success: result.success,
          message: result.message,
        });
      }
    }
  } catch (error) {
    console.error("[Automation] Cycle error:", error);
  }
}

export async function startAutomationEngine() {
  if (automationInterval) return;
  console.log(`[Automation] Engine started, checking every ${POLL_INTERVAL_MS / 1000}s`);

  // Initialize MQTT connection and discovery
  try {
    await connectMqtt();
    if (isMqttConnected()) {
      await setupCommandHandlers();
      const devices = await storage.getDevices();
      for (const device of devices) {
        if (device.isConnected) {
          await discoverDevice(device.id);
        }
      }
      mqttInitialized = true;
    }
  } catch (err) {
    console.log("[Automation] MQTT not available, continuing without MQTT Discovery");
  }

  automationInterval = setInterval(runAutomationCycle, POLL_INTERVAL_MS);
  // Run once immediately
  await runAutomationCycle();
}

async function evaluateControlProfile(
  deviceId: number,
  profile: any,
  registers: any[],
  externalSensors: any[]
): Promise<void> {
  try {
    const params = profile.parameters;
    let result: ControlResult | null = null;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    // Resolve sensor values via the central helper, which uses substring matching
    // against the device registers (e.g. "Temperature - Outdoor"). External sensors
    // only override when the profile explicitly opted in; otherwise device registers
    // are used. If no real value is available we keep null and the profile does NOT
    // act – never fabricate temperatures, which would defeat the smart safeguards.
    const useExt = params?.useExternalSensors === true;
    const extSensors = useExt ? externalSensors : undefined;
    const controlType = profile.schemaType || profile.controlType;

    // Per-type sensor overrides are stored in params.sensorMappings as { [measurementKey]: sensorId }
    // The user can pin a specific external sensor per measurement type in the UI.
    // Falling back to undefined lets getSensorValue auto-detect the best match.
    const mappings: Record<string, number> = (useExt && params?.sensorMappings) ? params.sensorMappings : {};
    const pinned = (type: string): number | undefined => mappings[type] || undefined;

    const indoorTemp = await getSensorValue(registers, "indoor_temp", extSensors, pinned("indoor_temp"));
    const outdoorTemp = await getSensorValue(registers, "outdoor_temp", extSensors, pinned("outdoor_temp"));
    const humidity = await getSensorValue(registers, "humidity", extSensors, pinned("humidity"));
    const co2 = await getSensorValue(registers, "co2", extSensors, pinned("co2"));

    // Evaluate based on control type
    switch (controlType) {
      case "temperature_control": {
        if (indoorTemp !== null) {
          result = await runTemperatureControl(profile.id, deviceId, params, indoorTemp);
        }
        break;
      }
      case "humidity_control": {
        if (humidity !== null) {
          result = await runHumidityControl(profile.id, deviceId, params, humidity);
        }
        break;
      }
      case "co2_control": {
        if (co2 !== null) {
          result = await runCo2Control(profile.id, deviceId, params, co2);
        }
        break;
      }
      case "summer_winter": {
        if (outdoorTemp !== null && indoorTemp !== null) {
          result = await runSummerWinterControl(profile.id, deviceId, params, outdoorTemp, indoorTemp);
        }
        break;
      }
      case "night_setback": {
        if (indoorTemp !== null) {
          result = await runNightSetback(profile.id, deviceId, params, indoorTemp, currentTime);
        }
        break;
      }
      case "weather_compensated": {
        if (outdoorTemp !== null && indoorTemp !== null) {
          result = await runWeatherCompensated(profile.id, deviceId, params, outdoorTemp, indoorTemp);
        }
        break;
      }
      default:
        break;
    }

    if (result) {
      const holdMs = Math.max(0, (Number(params?.holdMinutes ?? 5)) * 60_000);
      const last = profileLastAction.get(profile.id);
      const now = Date.now();

      // Hysteresis deadband: if the measured value is within ±hysteresis of
      // the setpoint, treat the computed output as unchanged (keep last fan
      // speed) to avoid chasing small temperature/humidity fluctuations.
      const hysteresis = Number(params?.hysteresis ?? 0);
      let hysteresisSkip = false;
      let hysteresisMeasured: number | null = null;
      let hysteresisSetpoint: number | null = null;
      if (hysteresis > 0 && last !== undefined) {
        switch (controlType) {
          case "temperature_control":
            hysteresisMeasured = indoorTemp; hysteresisSetpoint = Number(params?.setpoint ?? 0); break;
          case "humidity_control":
            hysteresisMeasured = humidity; hysteresisSetpoint = Number(params?.setpoint ?? 0); break;
          case "co2_control":
            hysteresisMeasured = co2; hysteresisSetpoint = Number(params?.setpoint ?? 0); break;
        }
        if (hysteresisMeasured !== null && hysteresisSetpoint !== null &&
            Math.abs(hysteresisMeasured - hysteresisSetpoint) < hysteresis) {
          // Force result back to the last known value to prevent a write.
          result = { ...result, value: last.value };
          hysteresisSkip = true;
        }
      }

      // Skip redundant writes: if the computed value hasn't changed, don't
      // write to the device. Log hysteresis-based skips so the user can see
      // the deadband is active; silent skip for normal steady-state operation.
      if (last !== undefined && result.value === last.value) {
        if (hysteresisSkip && hysteresisMeasured !== null && hysteresisSetpoint !== null) {
          await storage.createControlLog({
            profileId: profile.id,
            deviceId: deviceId,
            controlType: controlType,
            measuredValue: result.actionType === "fan_speed" ? (indoorTemp ?? 0) : (outdoorTemp ?? 0),
            setpointValue: params?.setpoint || 0,
            actionTaken: `${result.actionType}=〜`,
            success: true,
            message: `Hysterese aktiv – Messwert ${hysteresisMeasured.toFixed(1)} liegt innerhalb ±${hysteresis} des Sollwerts ${hysteresisSetpoint} (Stufe ${last.value} beibehalten)`,
          });
        }
        return;
      }

      // Hold-time (Mindesthaltedauer): after any fan-speed change, discard
      // subsequent changes until holdMinutes have elapsed. This prevents rapid
      // 1→2→1→2 oscillation when temperatures hover near a threshold.
      if (last !== undefined && holdMs > 0 && (now - last.ts) < holdMs) {
        const remainingMin = Math.ceil((holdMs - (now - last.ts)) / 60_000);
        await storage.createControlLog({
          profileId: profile.id,
          deviceId: deviceId,
          controlType: controlType,
          measuredValue: result.actionType === "fan_speed" ? (indoorTemp ?? 0) : (outdoorTemp ?? 0),
          setpointValue: params?.setpoint || 0,
          actionTaken: `${result.actionType}=⏸`,
          success: true,
          message: `Haltezeit aktiv – noch ${remainingMin} Min. bis nächste Änderung (Stufe ${last.value} → ${result.value} angefordert)`,
        });
        return;
      }

      // Execute the control action
      const actionResult = await executeControlAction(deviceId, result);
      // Only record the last action when the write actually succeeded.
      // A failed write must NOT advance the hold-time clock — the engine
      // should retry the same change on the very next cycle instead of
      // being locked out for holdMinutes after a transient Modbus error.
      if (actionResult.success) {
        profileLastAction.set(profile.id, { value: result.value, ts: now });
      }

      // Log control action
      await storage.createControlLog({
        profileId: profile.id,
        deviceId: deviceId,
        controlType: controlType,
        measuredValue: result.actionType === "fan_speed" ? (indoorTemp ?? 0) : (outdoorTemp ?? 0),
        setpointValue: params?.setpoint || 0,
        actionTaken: `${result.actionType}=${result.value}`,
        success: actionResult.success,
        message: `${result.reason} → ${actionResult.message}`,
      });

      // Publish control state to MQTT
      if (isMqttConnected()) {
        const topic = `blauberg/${deviceId}/control/${controlType}`;
        const payload = JSON.stringify({
          value: result.value,
          reason: result.reason,
          timestamp: new Date().toISOString(),
        });
        try {
          const mqttClient = await import("./mqtt-client");
          const mqttClientInstance = await mqttClient.connectMqtt();
          if (mqttClientInstance) {
            mqttClientInstance.publish(topic, payload, { qos: 1, retain: false });
          }
        } catch (e) {
          // MQTT publish failed silently
        }
      }
    }
  } catch (error) {
    console.error(`[Control] Profile ${profile.id} error:`, error);
  }
}

async function executeControlAction(
  deviceId: number,
  result: ControlResult
): Promise<{ success: boolean; message: string }> {
  try {
    const device = await storage.getDevice(deviceId);
    if (!device) {
      return { success: false, message: "Device not found" };
    }

    const client = await getModbusClient(deviceId, device.ip, device.port, device.slaveId);
    if (!client) {
      return { success: false, message: "No Modbus client" };
    }

    const registers = await storage.getRegisters(deviceId);

    if (result.actionType === "fan_speed") {
      const messages: string[] = [];

      const fanReg = registers.find((r) => r.name.includes("Fan Speed"));
      if (fanReg) {
        // Safety clamp: fan speed must stay within the valid 1–3 hardware range.
        // "Off" is NOT a fan stage on the S21 — the unit is powered down via the
        // System State coil, which the automation engine must never toggle.
        const fanValue = Math.max(1, Math.min(3, Math.round(result.value)));
        await client.writeSingleRegister(fanReg.address, fanValue);
        await storage.updateRegisterValue(fanReg.id, fanValue);
        messages.push(`Lüfterstufe: ${fanValue}`);
      }

      // Optionaler Raum-Sollwert für das Heizregister (HR_SetTEMP, 15–30 °C).
      // WICHTIG: vor dem Betriebsmodus schreiben, damit das Heizregister niemals mit
      // einem veralteten Sollwert anläuft.
      if (typeof result.setpointTemp === "number") {
        const setReg = registers.find((r) => r.name.includes("Temperature Setpoint"));
        if (setReg) {
          const setValue = Math.max(15, Math.min(30, Math.round(result.setpointTemp)));
          await client.writeSingleRegister(setReg.address, setValue);
          await storage.updateRegisterValue(setReg.id, setValue);
          messages.push(`Sollwert: ${setValue}°C`);
        }
      }

      // Optionaler Betriebsmodus (z. B. Heizung) – nur wenn die Regelung ihn vorgibt.
      if (typeof result.mode === "number") {
        const modeReg = registers.find((r) => r.name.includes("Operation Mode"));
        if (modeReg) {
          const modeValue = Math.max(0, Math.min(3, Math.round(result.mode)));
          await client.writeSingleRegister(modeReg.address, modeValue);
          await storage.updateRegisterValue(modeReg.id, modeValue);
          const modeLabels = ["Lüftung", "Heizung", "Kühlung", "Auto"];
          messages.push(`Modus: ${modeLabels[modeValue] ?? modeValue}`);
        }
      }

      if (messages.length > 0) {
        return { success: true, message: messages.join(", ") };
      }
    } else if (result.actionType === "mode") {
      const modeReg = registers.find((r) => r.name.includes("Operation Mode"));
      if (modeReg) {
        await client.writeSingleRegister(modeReg.address, result.value);
        await storage.updateRegisterValue(modeReg.id, result.value);
        return { success: true, message: `Betriebsmodus: ${result.value}` };
      }
    }

    return { success: false, message: `Aktion nicht unterstützt: ${result.actionType}` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export function stopAutomationEngine() {
  if (automationInterval) {
    clearInterval(automationInterval);
    automationInterval = null;
    console.log("[Automation] Engine stopped");
  }
}
