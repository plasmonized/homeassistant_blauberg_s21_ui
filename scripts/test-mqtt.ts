import assert from "node:assert/strict";
import { createServer, type Socket } from "node:net";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parser, generate } from "mqtt-packet";
import { ModbusTCPServer } from "jsmodbus";

// Private local test broker; never connects to the user's broker or reads its credentials.
const dir = await mkdtemp(path.join(tmpdir(), "s21-mqtt-test-"));
process.env.DATA_DIR = dir;
const packets: any[] = [];
const sockets = new Set<Socket>();
let brokerSocket: Socket;
const broker = createServer(socket => {
  sockets.add(socket);
  brokerSocket = socket;
  socket.on("close", () => sockets.delete(socket));
  const decoder = parser();
  socket.on("data", data => decoder.parse(data));
  decoder.on("packet", packet => {
    packets.push(packet);
    if (packet.cmd === "connect") socket.write(generate({ cmd: "connack", returnCode: 0, sessionPresent: false }));
    if (packet.cmd === "subscribe") socket.write(generate({ cmd: "suback", messageId: packet.messageId, granted: packet.subscriptions.map(() => 1) }));
    if (packet.cmd === "publish" && packet.qos === 1) socket.write(generate({ cmd: "puback", messageId: packet.messageId! }));
    if (packet.cmd === "pingreq") socket.write(generate({ cmd: "pingresp" }));
  });
});
await new Promise<void>(resolve => broker.listen(0, "127.0.0.1", resolve));
const port = (broker.address() as any).port;
const modbus = createServer();
const holding = Buffer.alloc(200);
const coils = Buffer.alloc(100);
new ModbusTCPServer(modbus, { holding, coils, input: Buffer.alloc(200), discrete: Buffer.alloc(100) });
await new Promise<void>(resolve => modbus.listen(0, "127.0.0.1", resolve));
const { storage } = await import("../server/storage");
const { pool } = await import("../server/db");
const settings = await import("../server/lib/mqtt-settings");
const mqtt = await import("../server/lib/mqtt-client");
const { closeConnection } = await import("../server/lib/modbus");
const device = { id: -98765, ip: "127.0.0.1", port: (modbus.address() as any).port, slaveId: 1, isConnected: true };
const registers: any[] = [
  { id: 1, type: "holding", address: 2, dataType: "uint16", isWritable: true, name: "Fan Speed", tags: ["control", "fan"], lastValue: "1" },
  { id: 2, type: "holding", address: 74, dataType: "enum", isWritable: true, name: "Bypass Control", tags: ["control", "bypass"], options: { "0": "Geschlossen", "1": "Offen", "2": "Auto" }, lastValue: "0" },
  { id: 3, type: "coil", address: 0, dataType: "bool", isWritable: true, name: "System State", tags: ["control", "power"], lastValue: "0" },
];
const original = { getDevices: storage.getDevices, getDevice: storage.getDevice, getRegisters: storage.getRegisters, updateRegisterValue: storage.updateRegisterValue };
Object.assign(storage, {
  getDevices: async () => [device], getDevice: async () => device, getRegisters: async () => registers,
  updateRegisterValue: async (id: number, value: string) => { registers.find(r => r.id === id).lastValue = value; },
});
await import("../server/lib/mqtt-discovery");
const waitFor = async (condition: () => boolean) => {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("MQTT test condition timed out");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};
const command = (id: string, payload: string, retain = false) => brokerSocket.write(generate({
  cmd: "publish", topic: `blauberg/blauberg_s21_ventilation/${id}/set`, payload, qos: 0, retain, dup: false,
}));
const config = { enabled: true, host: "127.0.0.1", port, username: "test-user", password: "test-only-value", tls: false };
try {
  await settings.loadMqttSettings();
  await settings.saveMqttSettings(config);
  assert.equal(settings.getPublicMqttSettings().hasPassword, true);
  assert.equal("password" in settings.getPublicMqttSettings(), false);
  assert.equal((await stat(path.join(dir, "s21-settings/mqtt.json"))).mode & 0o777, 0o600);
  assert.equal(await mqtt.connectMqtt(), true);
  await waitFor(() => packets.some(p => p.cmd === "subscribe" && p.subscriptions.some((s: any) => s.topic.endsWith("/+/set"))));
  await waitFor(() => packets.some(p => p.cmd === "publish" && p.topic.startsWith("homeassistant/number/")));
  assert.equal(packets.find(p => p.cmd === "connect").will.payload.toString(), "offline");
  command("holding_2", "3");
  await waitFor(() => registers[0].lastValue === "3");
  assert.equal(holding.readUInt16BE(4), 3, "HA command reaches Modbus");
  command("holding_74", "Auto");
  await waitFor(() => registers[1].lastValue === "2");
  assert.equal(holding.readUInt16BE(148), 2, "enum stored numerically and reaches Modbus");
  command("coil_0", "ON");
  await waitFor(() => registers[2].lastValue === "1");
  command("holding_2", "not-a-number");
  command("holding_2", "1", true);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(registers[0].lastValue, "3", "invalid/retained commands ignored");
  const discoveries = () => packets.filter(p => p.cmd === "publish" && p.topic.startsWith("homeassistant/")).length;
  let count = discoveries();
  brokerSocket.write(generate({ cmd: "publish", topic: "homeassistant/status", payload: "online", qos: 0, retain: false, dup: false }));
  await waitFor(() => discoveries() > count);
  count = discoveries();
  assert.equal(await mqtt.reconnectMqtt(), true);
  await waitFor(() => discoveries() > count);
  const { password: _unused, ...withoutPassword } = config;
  await settings.saveMqttSettings(withoutPassword);
  assert.equal(settings.getPublicMqttSettings().hasPassword, true, "empty input preserves password");
  await settings.saveMqttSettings({ ...withoutPassword, clearPassword: true });
  assert.equal(settings.getPublicMqttSettings().hasPassword, false);
  await settings.resetMqttSettings();
  assert.equal(settings.getPublicMqttSettings().source, "addon");
  assert.equal(mqtt.topicMatches("blauberg/+/+/set", "blauberg/device/holding_2/set"), true);
  assert.equal(mqtt.topicMatches("blauberg/+/set", "blauberg/device/holding_2/set"), false);
  console.log("MQTT: Einstellungen, Passwortschutz, Discovery, Reconnect und HA→Modbus-Steuerung bestanden.");
} finally {
  await mqtt.disconnectMqtt();
  closeConnection(device.id);
  Object.assign(storage, original);
  for (const socket of sockets) socket.destroy();
  broker.close();
  modbus.close();
  await pool.end();
  await rm(dir, { recursive: true, force: true });
}
