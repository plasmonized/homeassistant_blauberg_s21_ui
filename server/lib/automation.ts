import { storage } from "../storage";
import { getModbusClient } from "./modbus";

let automationInterval: NodeJS.Timeout | null = null;
const POLL_INTERVAL_MS = 30_000; // Check every 30 seconds

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

function getSensorValue(registers: any[], sensorType: string): number | null {
  const findReg = (name: string) => registers.find((r) => r.name.includes(name));

  switch (sensorType) {
    case "outdoor_temp": {
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
      const reg = findReg("Humidity");
      return reg?.lastValue !== null ? parseFloat(reg.lastValue) : null;
    }
    case "co2": {
      const reg = findReg("CO2");
      return reg?.lastValue !== null ? parseFloat(reg.lastValue) : null;
    }
    case "forecast_temp": {
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

      const rules = await storage.getAutomationRules(device.id);
      if (rules.length === 0) continue;

      const registers = await storage.getRegisters(device.id);

      for (const rule of rules) {
        if (!rule.enabled) continue;
        if (!isSeasonMatch(rule.season)) continue;
        if (!isInTimeRange(rule.timeFrom, rule.timeTo)) continue;

        const sensorValue = getSensorValue(registers, rule.sensorType);
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

export function startAutomationEngine() {
  if (automationInterval) return;
  console.log("[Automation] Engine started, checking every 30s");
  automationInterval = setInterval(runAutomationCycle, POLL_INTERVAL_MS);
  // Run once immediately
  runAutomationCycle();
}

export function stopAutomationEngine() {
  if (automationInterval) {
    clearInterval(automationInterval);
    automationInterval = null;
    console.log("[Automation] Engine stopped");
  }
}
