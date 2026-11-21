import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ModbusTCPServer } from "jsmodbus";

// Isolated fake hardware/storage. Never touches an installed S21 or live rows.
const dir = await mkdtemp(path.join(tmpdir(), "s21-override-"));
process.env.DATA_DIR = dir;
const holding = Buffer.alloc(220);
const input = Buffer.alloc(220);
const coils = Buffer.alloc(100);
holding.writeUInt16BE(2, 4);
coils[0] = 1;
coils[1] = 1 << 5; // coil 13 enabled, NOT active boost
input.writeUInt16BE(100, 2);
input.writeUInt16BE(210, 6);
input.writeUInt16BE(45, 20);
input.writeUInt16BE(420, 24);
const hardware = createServer();
new ModbusTCPServer(hardware, { holding, input, coils, discrete: Buffer.alloc(100) });
await new Promise<void>(resolve => hardware.listen(0, "127.0.0.1", resolve));
const { storage } = await import("../server/storage");
const { pool } = await import("../server/db");
const { S21_REGISTERS } = await import("../server/lib/s21-register-map");
const { BASE_DEFAULTS } = await import("../server/lib/base-profile");
const { manualOverrides } = await import("../server/lib/manual-override");
const { latestControlDecision } = await import("../server/lib/control-decision");
const { getModbusClient, closeConnection, withModbusWriteContext } = await import("../server/lib/modbus");
const { runAutomationCycle, startManualBoost } = await import("../server/lib/automation");
const device = { id: 987654, ip: "127.0.0.1", port: (hardware.address() as any).port,
  slaveId: 1, isConnected: true };
const registers = S21_REGISTERS.map((reg, index) => ({
  ...reg, id: index + 1, deviceId: device.id, lastValue: null as string | null, updatedAt: new Date(),
}));
const profile = { id: 987654, deviceId: device.id, enabled: true, name: "Isolated base",
  schemaType: "base_profile", controlType: "base_profile", parameters: {
    ...BASE_DEFAULTS, roomSetpoint: 21, heaterEnabled: false,
  } };
let rules: any[] = [];
const sensors = [{ id: 1, name: "Binary test trigger", sensorType: "co2",
  lastValue: "0", updatedAt: new Date(), sourceType: "manual" }];
const logs: any[] = [];
Object.assign(storage, {
  getDevices: async () => [device],
  getDevice: async () => device,
  updateDevice: async (_id: number, updates: any) => Object.assign(device, updates),
  getRegisters: async () => structuredClone(registers),
  updateRegisterValue: async (id: number, value: unknown) => {
    const register = registers.find(r => r.id === id)!;
    register.lastValue = String(value);
    register.updatedAt = new Date();
  },
  getExternalSensors: async () => structuredClone(sensors),
  getControlProfiles: async () => [profile],
  getAutomationRules: async () => rules,
  updateAutomationRule: async (id: number, updates: any) => Object.assign(rules.find(r => r.id === id), updates),
  createControlLog: async (log: any) => logs.push(log),
  createAutomationLog: async (log: any) => logs.push(log),
  addSensorReadings: async () => {},
  addBaseProfileReading: async () => {},
  pruneOldSensorReadings: async () => {},
  pruneOldBaseProfileReadings: async () => {},
});
const stage = () => holding.readUInt16BE(4);
const cycle = () => runAutomationCycle();
try {
  await cycle();
  assert.equal(stage(), 1, "base regulates even without separate automation rules");
  assert.equal(manualOverrides.status(device.id).active, false, "own baseline/coil13 doesn't trigger priority");
  holding.writeUInt16BE(2, 4); // console change, no API ownership marker
  await cycle();
  assert.equal(stage(), 2, "console stage remains instead of being corrected");
  assert.equal(manualOverrides.status(device.id).source, "console");
  const until = manualOverrides.status(device.id).manualUntil;
  await cycle();
  assert.equal(manualOverrides.status(device.id).manualUntil, until, "cycles don't prolong manual window");
  assert.equal(logs.filter(l => l.controlType === "manual_override").length, 1, "unchanged cycles don't duplicate manual start");
  assert.equal(latestControlDecision(device.id, [profile.id]), null, "old profile reasons are cleared during manual priority");
  coils[0] &= ~1;
  await cycle();
  assert.equal(coils[0] & 1, 1, "manual ventilation wakes an off unit even if stage already matches");
  await manualOverrides.resume(device.id);
  await cycle();
  assert.equal(stage(), 1, "resume restores base regulation");
  assert.equal(logs.filter(l => l.controlType === "automation_return").length, 1);
  assert.ok(latestControlDecision(device.id, [profile.id]), "return event preserves the fresh automatic reason");
  await cycle();
  assert.equal(logs.filter(l => l.controlType === "automation_return").length, 1, "no return event per poll");
  await startManualBoost(device.id);
  assert.equal(stage(), 3, "app boost actually writes stage3 instead of coil13");
  await cycle();
  assert.equal(stage(), 3, "base respects app boost");
  await manualOverrides.manual(device.id, 2, "app");
  await manualOverrides.stopBoost(device.id);
  await cycle();
  assert.equal(stage(), 2, "lower-priority manual window is restored when boost ends");
  await manualOverrides.resume(device.id);
  await cycle();
  assert.equal(stage(), 1);
  coils[0] |= 1 << 3;
  holding.writeUInt16BE(3, 4);
  await cycle();
  assert.equal(stage(), 3, "hardware boost wins");
  assert.equal(manualOverrides.status(device.id).boostSource, "hardware");
  coils[0] &= ~(1 << 3);
  holding.writeUInt16BE(1, 4);
  await cycle();
  assert.equal(manualOverrides.status(device.id).active, false, "hardware return doesn't trigger a manual window");
  rules = [{ id: 5, name: "Binary boost", enabled: true, sensorType: "co2",
    externalSensorId: 1, operator: "gte", threshold: 1, actionType: "boost",
    actionValue: 1, actionDurationMinutes: 1, activeUntil: null, season: "all",
    timeFrom: null, timeTo: null }];
  sensors[0].lastValue = "1";
  await cycle();
  assert.equal(stage(), 3, "binary sensor boost reaches hardware while base is enabled");
  assert.equal(manualOverrides.status(device.id).boostSource, "rule");
  sensors[0].lastValue = "0";
  await cycle();
  assert.equal(stage(), 3, "boost timer continues after trigger releases");
  rules[0].activeUntil = new Date(Date.now() - 1);
  await cycle();
  assert.equal(stage(), 1, "timer expiry returns directly to base");
  assert.equal(coils[1] & (1 << 5), 1 << 5, "physical boost input enable is NEVER switched off by software timer expiry");
  assert.equal(manualOverrides.status(device.id).active, false);
  assert.match(logs.findLast(l => l.actionTaken === "Regel-Boost beendet")?.message ?? "", /Boost-Timer abgelaufen/);
  const client = await getModbusClient(device.id, device.ip, device.port, device.slaveId);
  // A failed first automatic write must not claim a successful return.
  await manualOverrides.manual(device.id, 2, "app");
  holding.writeUInt16BE(2, 4);
  await manualOverrides.resume(device.id);
  const returnsBeforeFailure = logs.filter(l => l.controlType === "automation_return").length;
  const writeDescriptor = Object.getOwnPropertyDescriptor(client, "writeSingleRegister");
  client.writeSingleRegister = async () => { throw new Error("Isolated write failure"); };
  await cycle();
  assert.equal(logs.filter(l => l.controlType === "automation_return").length, returnsBeforeFailure);
  assert.equal(latestControlDecision(device.id, [profile.id])?.outcome, "failed");
  // Restore the underlying method, not the queue proxy's wrapped getter.
  if (writeDescriptor) Object.defineProperty(client, "writeSingleRegister", writeDescriptor);
  else Reflect.deleteProperty(client, "writeSingleRegister");
  await cycle();
  assert.equal(logs.filter(l => l.controlType === "automation_return").length, returnsBeforeFailure + 1);
  assert.equal(stage(), 1, "successful retry confirms automation return");
  let allow = true;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = withModbusWriteContext({ afterWrite: async () => { await gate; } },
    () => client.writeSingleRegister(2, 2));
  const later = withModbusWriteContext({ allowed: () => allow },
    () => client.writeSingleRegister(2, 3));
  allow = false;
  release();
  await first;
  await assert.rejects(later, /Automatik pausiert/);
  assert.equal(stage(), 2, "a queued automatic write is cancelled after ownership changes");
  console.log("Automatik-Integration: Grundprofil ohne Regeln, Konsole, App-Boost, Geräte-Boost, binärer Timer, Rückkehr und wartende Befehle bestanden.");
} finally {
  closeConnection(device.id);
  hardware.close();
  await pool.end();
  await rm(dir, { recursive: true, force: true });
}
