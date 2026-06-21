/**
 * Home Assistant MQTT Discovery Publisher
 * Publishes S21 registers as native HA entities via MQTT Discovery
 * Sensors: Temperatures, Humidity, CO2, Filter Timer
 * Switches: System On/Off, Standby
 * Numbers: Fan Speed, Boost Timer
 * Select: Operation Mode
 * Button: Bypass Control
 */

import { connectMqtt, publish, subscribe, isMqttConnected, getMqttClient } from "./mqtt-client";
import { storage } from "../storage";

const DEVICE_NAME = "Blauberg S21";
const DEVICE_ID = "blauberg_s21_ventilation";
const DEVICE_MODEL = "S21";
const DEVICE_MANUFACTURER = "Blauberg";

// Discovery topic prefix
const DISCOVERY_PREFIX = "homeassistant";

// Track which devices have been discovered
const discoveredDevices = new Set<number>();

function getDeviceInfo() {
  return {
    name: DEVICE_NAME,
    identifiers: [DEVICE_ID],
    model: DEVICE_MODEL,
    manufacturer: DEVICE_MANUFACTURER,
  };
}

function getDiscoveryTopic(component: string, uniqueId: string): string {
  return `${DISCOVERY_PREFIX}/${component}/${DEVICE_ID}/${uniqueId}/config`;
}

function getStateTopic(uniqueId: string): string {
  return `blauberg/${DEVICE_ID}/${uniqueId}/state`;
}

function getCommandTopic(uniqueId: string): string {
  return `blauberg/${DEVICE_ID}/${uniqueId}/set`;
}

function getAvailabilityTopic(): string {
  return `blauberg/${DEVICE_ID}/availability`;
}

function publishDiscovery(component: string, uniqueId: string, config: any): void {
  const topic = getDiscoveryTopic(component, uniqueId);
  publish(topic, { ...config, unique_id: `${DEVICE_ID}_${uniqueId}`, device: getDeviceInfo() }, true);
}

function publishState(uniqueId: string, value: any): void {
  const topic = getStateTopic(uniqueId);
  publish(topic, String(value), true);
}

function publishAvailability(available: boolean): void {
  publish(getAvailabilityTopic(), available ? "online" : "offline", true);
}

// ================= DISCOVERY HELPERS =================

function discoverSensor(uniqueId: string, name: string, unit: string | null, deviceClass: string | null = null, stateClass: string | null = null): void {
  publishDiscovery("sensor", uniqueId, {
    name,
    state_topic: getStateTopic(uniqueId),
    availability_topic: getAvailabilityTopic(),
    unit_of_measurement: unit,
    device_class: deviceClass,
    state_class: stateClass,
    value_template: "{{ value }}",
  });
}

function discoverSwitch(uniqueId: string, name: string): void {
  publishDiscovery("switch", uniqueId, {
    name,
    state_topic: getStateTopic(uniqueId),
    command_topic: getCommandTopic(uniqueId),
    availability_topic: getAvailabilityTopic(),
    payload_on: "ON",
    payload_off: "OFF",
    state_on: "ON",
    state_off: "OFF",
    value_template: "{{ value }}",
  });
}

function discoverNumber(uniqueId: string, name: string, unit: string | null, min: number, max: number, step: number = 1, deviceClass: string | null = null): void {
  publishDiscovery("number", uniqueId, {
    name,
    state_topic: getStateTopic(uniqueId),
    command_topic: getCommandTopic(uniqueId),
    availability_topic: getAvailabilityTopic(),
    unit_of_measurement: unit,
    device_class: deviceClass,
    min,
    max,
    step,
    mode: "box",
    value_template: "{{ value }}",
  });
}

function discoverSelect(uniqueId: string, name: string, options: string[]): void {
  publishDiscovery("select", uniqueId, {
    name,
    state_topic: getStateTopic(uniqueId),
    command_topic: getCommandTopic(uniqueId),
    availability_topic: getAvailabilityTopic(),
    options,
    value_template: "{{ value }}",
  });
}

function discoverButton(uniqueId: string, name: string, payload: string): void {
  publishDiscovery("button", uniqueId, {
    name,
    command_topic: getCommandTopic(uniqueId),
    availability_topic: getAvailabilityTopic(),
    payload_press: payload,
  });
}

// ================= MAIN DISCOVERY =================

export async function discoverDevice(deviceId: number): Promise<void> {
  if (!isMqttConnected()) {
    const connected = await connectMqtt();
    if (!connected) {
      console.log("[MQTT-Discovery] MQTT not connected, skipping discovery");
      return;
    }
  }

  if (discoveredDevices.has(deviceId)) {
    return; // Already discovered
  }

  const device = await storage.getDevice(deviceId);
  if (!device) return;

  const registers = await storage.getRegisters(deviceId);

  // Publish availability
  publishAvailability(true);

  for (const reg of registers) {
    const uniqueId = `reg_${reg.address}`;

    if (reg.name.includes("Temperature") && reg.name.includes("Setpoint") && reg.isWritable) {
      // Schreibbarer Raum-Sollwert (Heizregister) → HA-Number, nicht Nur-Lese-Sensor.
      discoverNumber(uniqueId, reg.name, reg.unit || "°C", 15, 30, 1, "temperature");
    } else if (reg.name.includes("Temperature") || reg.name.includes("Outdoor") || reg.name.includes("Supply") || reg.name.includes("Extract") || reg.name.includes("Exhaust")) {
      const deviceClass = "temperature";
      const stateClass = "measurement";
      const unit = reg.unit || "°C";
      discoverSensor(uniqueId, reg.name, unit, deviceClass, stateClass);
    } else if (reg.name.includes("Humidity")) {
      discoverSensor(uniqueId, reg.name, "%", "humidity", "measurement");
    } else if (reg.name.includes("CO2")) {
      discoverSensor(uniqueId, reg.name, "ppm", "carbon_dioxide", "measurement");
    } else if (reg.name.includes("Filter Timer")) {
      discoverSensor(uniqueId, reg.name, "h", "duration", "measurement");
    } else if (reg.name.includes("System State") && reg.isWritable) {
      discoverSwitch(uniqueId, reg.name.replace(" (0:Off, 1:On)", ""));
    } else if (reg.name.includes("Standby") && reg.isWritable) {
      discoverSwitch(uniqueId, reg.name);
    } else if (reg.name.includes("Fan Speed") && reg.isWritable) {
      discoverNumber(uniqueId, reg.name.replace(" (0:Low, 1:Med, 2:High)", ""), null, 0, 3, 1);
    } else if (reg.name.includes("Boost Timer") && reg.isWritable) {
      discoverNumber(uniqueId, reg.name, "min", 0, 60, 1);
    } else if (reg.name.includes("Operation Mode") && reg.isWritable) {
      const options = reg.options ? Object.values(reg.options) as string[] : ["Lüftung", "Heizung", "Kühlung", "Auto"];
      discoverSelect(uniqueId, reg.name, options);
    } else if (reg.name.includes("Bypass") && reg.isWritable) {
      const options = reg.options ? Object.values(reg.options) as string[] : ["Auto", "Offen", "Geschlossen"];
      discoverSelect(uniqueId, reg.name, options);
    } else {
      // Generic sensor
      discoverSensor(uniqueId, reg.name, reg.unit || null);
    }
  }

  discoveredDevices.add(deviceId);
  console.log(`[MQTT-Discovery] Published discovery for device ${deviceId} (${registers.length} entities)`);
}

export async function publishRegisterStates(deviceId: number): Promise<void> {
  if (!isMqttConnected()) return;

  const registers = await storage.getRegisters(deviceId);
  for (const reg of registers) {
    const uniqueId = `reg_${reg.address}`;
    let value = reg.lastValue ?? "unavailable";

    // Format switch values
    if (reg.name.includes("System State") || reg.name.includes("Standby")) {
      value = value === "1" || value === "true" ? "ON" : "OFF";
    }

    // Format select values using options mapping
    if (reg.options && reg.lastValue !== null) {
      const optionMap = reg.options as Record<string, string>;
      const mappedValue = optionMap[String(reg.lastValue)];
      if (mappedValue) {
        value = mappedValue;
      }
    }

    // NOTE: lastValue is already stored de-scaled (display units) by the poll
    // and write paths, so it must NOT be divided by scale again here.

    publishState(uniqueId, value);
  }

  publishAvailability(true);
}

// ================= COMMAND HANDLING =================

export async function setupCommandHandlers(): Promise<void> {
  if (!isMqttConnected()) {
    const connected = await connectMqtt();
    if (!connected) return;
  }

  // Subscribe to all command topics
  subscribe(`blauberg/${DEVICE_ID}/+/set`, async (topic, message) => {
    const payload = message.toString();
    const regex = new RegExp(`blauberg/${DEVICE_ID}/reg_(\\d+)/set`);
    const match = topic.match(regex);
    if (!match) return;

    const address = parseInt(match[1], 10);
    console.log(`[MQTT] Received command for register ${address}: ${payload}`);

    // Find device with this register
    const devices = await storage.getDevices();
    for (const device of devices) {
      const registers = await storage.getRegisters(device.id);
      const reg = registers.find((r) => r.address === address);
      if (!reg || !reg.isWritable) continue;

      // Parse payload based on register type
      let value: any;
      if (reg.dataType === "bool") {
        value = payload === "ON" ? 1 : 0;
      } else if (reg.options) {
        // Reverse lookup option value
        const optionMap = reg.options as Record<string, string>;
        const entry = Object.entries(optionMap).find(([_, label]) => label === payload);
        value = entry ? parseInt(entry[0], 10) : parseInt(payload, 10);
      } else {
        value = parseInt(payload, 10);
      }

      if (reg.scale && reg.scale !== 1) {
        value = value * reg.scale;
      }

      try {
        const { getModbusClient } = await import("./modbus");
        const client = await getModbusClient(device.id, device.ip, device.port, device.slaveId);
        await client.writeSingleRegister(address, value);
        await storage.updateRegisterValue(reg.id, payload);
        publishState(`reg_${address}`, payload);
        console.log(`[MQTT] Wrote ${value} to register ${address}`);
      } catch (err) {
        console.error(`[MQTT] Failed to write to register ${address}:`, err);
      }
    }
  });

  console.log("[MQTT-Discovery] Command handlers set up");
}

export async function cleanupDiscovery(deviceId: number): Promise<void> {
  discoveredDevices.delete(deviceId);
}

export async function rediscoverDevice(deviceId: number): Promise<void> {
  discoveredDevices.delete(deviceId);
  await discoverDevice(deviceId);
}
