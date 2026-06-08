import { storage } from "../storage";
import { getModbusClient } from "./modbus";
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
const POLL_INTERVAL_MS = 30_000; // Check every 30 seconds
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
      return parseFloat(sensor.lastValue);
    }
  }

  switch (sensorType) {
    case "outdoor_temp": {
      const ext = findExt("temperature");
      if (ext) return parseFloat(ext.lastValue);
      const reg = findReg("Outdoor");
      return reg?.lastValue !== null ? parseFloat(reg.lastValue) : null;
    }
    case "indoor_temp": {
      // Use average of supply and extract as indoor temperature
      const supply = findReg("Supply");
      const extract = findReg("Extract");
      const sVal = supply?.lastValue !== null ? parseFloat(supply.lastValue) : null;
      const eVal = extract?.lastValue !== null ? parseFloat(extract.lastValue) : null;
      if (sVal !== null && eVal !== null) return (sVal + eVal) / 2;
      return sVal ?? eVal ?? null;
    }
    case "humidity": {
      const ext = findExt("humidity");
      if (ext) return parseFloat(ext.lastValue);
      const reg = findReg("Humidity");
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
        targetReg = registers.find((r) => r.name.includes("Boost Timer"));
        break;
      case "standby":
        targetReg = registers.find((r) => r.name.includes("Standby"));
        break;
    }

    if (!targetReg) {
      return { success: false, message: `Target register not found for action ${rule.actionType}` };
    }

    let valueToWrite = rule.actionValue;
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

    await storage.updateRegisterValue(targetReg.id, rule.actionValue);

    return {
      success: true,
      message: `Set ${rule.actionType} to ${rule.actionValue}`,
    };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

async function runAutomationCycle() {
  try {
    const devices = await storage.getDevices();
    for (const device of devices) {
      if (!device.isConnected) continue;

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

      // Run control profiles (regulation schemas)
      const profiles = await storage.getControlProfiles(device.id);
      for (const profile of profiles) {
        if (!profile.enabled) continue;
        await evaluateControlProfile(device.id, profile, registers, externalSensors);
      }

      if (rules.length === 0) continue;

      for (const rule of rules) {
        if (!rule.enabled) continue;
        if (!isSeasonMatch(rule.season)) continue;
        if (!isInTimeRange(rule.timeFrom, rule.timeTo)) continue;

        const sensorValue = await getSensorValue(registers, rule.sensorType, externalSensors, rule.externalSensorId);
        if (sensorValue === null) continue;

        const conditionMet = evaluateCondition(sensorValue, rule.operator, rule.threshold);
        if (!conditionMet) continue;

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
    }
  } catch (error) {
    console.error("[Automation] Cycle error:", error);
  }
}

export async function startAutomationEngine() {
  if (automationInterval) return;
  console.log("[Automation] Engine started, checking every 30s");

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

    // Get sensor values
    const getSensor = (name: string) => {
      const reg = registers.find((r) => r.name === name);
      if (reg && reg.lastValue !== null && reg.lastValue !== undefined) {
        return parseFloat(reg.lastValue);
      }
      return null;
    };

    const getExternalSensor = (entityId: string) => {
      const sensor = externalSensors.find((s) => s.entityId === entityId);
      if (sensor && sensor.lastValue !== null && sensor.lastValue !== undefined) {
        return parseFloat(sensor.lastValue);
      }
      return null;
    };

    // Get indoor temperature (use external HA sensor if configured, else supply temp)
    let indoorTemp: number | null = null;
    if (params?.externalTempEntity) {
      indoorTemp = getExternalSensor(params.externalTempEntity);
    }
    if (indoorTemp === null) {
      indoorTemp = getSensor("Supply Temperature") || getSensor("Temperature") || getSensor("Indoor Temperature") || 20;
    }

    // Get outdoor temperature
    let outdoorTemp: number | null = null;
    if (params?.externalOutdoorTempEntity) {
      outdoorTemp = getExternalSensor(params.externalOutdoorTempEntity);
    }
    if (outdoorTemp === null) {
      outdoorTemp = getSensor("Outdoor Temperature") || getSensor("Außentemperatur") || 10;
    }

    // Get humidity
    let humidity: number | null = null;
    if (params?.externalHumidityEntity) {
      humidity = getExternalSensor(params.externalHumidityEntity);
    }
    if (humidity === null) {
      humidity = getSensor("Humidity") || getSensor("Humidity") || getSensor("Feuchtigkeit") || 50;
    }

    // Get CO2
    let co2: number | null = null;
    if (params?.externalCo2Entity) {
      co2 = getExternalSensor(params.externalCo2Entity);
    }
    if (co2 === null) {
      co2 = getSensor("CO2") || getSensor("CO2") || getSensor("Kohlendioxid") || 400;
    }

    // Evaluate based on control type
    const controlType = profile.schemaType || profile.controlType;
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
      // Execute the control action
      const actionResult = await executeControlAction(deviceId, result);

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
      const fanReg = registers.find((r) => r.name.includes("Fan Speed"));
      if (fanReg) {
        await client.writeSingleRegister(fanReg.address, result.value);
        await storage.updateRegisterValue(fanReg.id, result.value);
        return { success: true, message: `Lüfterstufe: ${result.value}` };
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
