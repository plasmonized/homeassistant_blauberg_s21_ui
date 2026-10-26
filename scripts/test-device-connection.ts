import assert from "node:assert/strict";
import { createServer, type Socket } from "node:net";
import { ModbusTCPServer } from "jsmodbus";
import { deviceConnectionSchema } from "../shared/device-connection";
import { probeDeviceConnection } from "../server/lib/connection-probe";
import { getModbusClient, closeConnection, setModbusTarget } from "../server/lib/modbus";
import { saveDeviceConnection } from "../server/lib/device-connection";
import { storage } from "../server/storage";
import { db, pool } from "../server/db";
import { devices, controlProfiles, externalSensors, registers, sensorReadings, baseProfileReadings } from "../shared/schema";
import { eq } from "drizzle-orm";

const sockets = new Set<Socket>();
const servers: ReturnType<typeof createServer>[] = [];
async function fixture(stage: number) {
  const server = createServer(socket => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  const holding = Buffer.alloc(200);
  holding.writeUInt16BE(stage, 4);
  new ModbusTCPServer(server, { holding, coils: Buffer.alloc(100), input: Buffer.alloc(200), discrete: Buffer.alloc(100) });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { ip: "127.0.0.1", port: (server.address() as { port: number }).port, slaveId: 1 };
}
const first = await fixture(1);
const second = await fixture(3);
const unavailable = { ...first, port: 1 };
const id = -Math.floor(1_000_000 + Math.random() * 1_000_000_000);
try {
  for (const ip of ["192.168.1.21", "s21.local", "localhost", "::1"]) {
    assert.equal(deviceConnectionSchema.safeParse({ ...first, ip }).success, true);
  }
  for (const invalid of [
    { ip: "" }, { ip: "999.999.999.999" }, { ip: "http://s21.local" },
    { ip: "s21.local:502" }, { port: 0 }, { port: 65536 }, { port: 1.5 },
    { slaveId: -1 }, { slaveId: 248 }, { id: 123 }, { isConnected: true },
  ]) assert.equal(deviceConnectionSchema.safeParse({ ...first, ...invalid }).success, false);
  assert.equal((await probeDeviceConnection(first)).success, true, "read-only Modbus probe succeeds");
  assert.equal((await probeDeviceConnection(unavailable, 500)).success, false);
  const silent = createServer(socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  await new Promise<void>(resolve => silent.listen(0, "127.0.0.1", resolve));
  servers.push(silent);
  const started = Date.now();
  assert.equal((await probeDeviceConnection({ ...first, port: (silent.address() as { port: number }).port }, 100)).success, false);
  assert.ok(Date.now() - started < 1000, "silent TCP peer cannot hang connection testing");

  const client = await getModbusClient(id, first.ip, first.port, first.slaveId);
  assert.equal((await client.readHoldingRegisters(2, 1)).response.body.values[0], 1);
  assert.equal(await getModbusClient(id, first.ip, first.port, first.slaveId), client, "same endpoint reuses socket");
  setModbusTarget(id, second.ip, second.port, second.slaveId);
  await assert.rejects(() => client.writeSingleRegister(2, 2), /gewechselt/);
  await assert.rejects(() => getModbusClient(id, first.ip, first.port, first.slaveId), /veraltete Adresse/);
  const next = await getModbusClient(id, second.ip, second.port, second.slaveId);
  assert.equal((await next.readHoldingRegisters(2, 1)).response.body.values[0], 3, "new endpoint actually used");
  closeConnection(id);

  // Isolated negative ID: no user device or settings can be touched.
  await db.insert(devices).values({ id, name: "Connection unit test", ...first });
  await db.insert(controlProfiles).values({ deviceId: id, name: "Keep profile", enabled: false,
    schemaType: "base_profile", parameters: { roomSetpoint: 23, sensorSources: { co2: "external:123" } } });
  const [reg] = await db.insert(registers).values({ deviceId: id, name: "Keep register", address: 2, type: "holding" }).returning();
  await db.insert(sensorReadings).values({ deviceId: id, registerId: reg.id, value: 1 });
  const before = await storage.getControlProfiles(id);
  const switched = await saveDeviceConnection(id, second, true);
  assert.equal(switched?.device.id, id);
  assert.equal(switched?.device.port, second.port);
  assert.equal(switched?.connection.success, true);
  assert.equal(switched?.device.isConnected, true);
  assert.deepEqual(await storage.getControlProfiles(id), before, "profile IDs, parameters and sensor bindings retained");
  assert.equal((await storage.getRegisters(id))[0].id, reg.id);
  assert.equal((await storage.getSensorHistory(id)).length, 1, "history retained");
  const failed = await saveDeviceConnection(id, unavailable, true);
  assert.equal(failed?.connection.success, false);
  assert.equal(failed?.device.port, unavailable.port, "unreachable target still saved");
  assert.equal(failed?.device.isConnected, false);
  assert.deepEqual(await storage.getControlProfiles(id), before, "failed reconnect does not erase configuration");
  const restored = await saveDeviceConnection(id, first, true);
  assert.equal(restored?.connection.success, true);
  assert.equal(restored?.device.id, id);
  console.log("Netzwerkwechsel: Validierung, Probe, Timeout, Socket-Wechsel, veraltete Aufrufe, Offline-Speicherung, Wiederherstellung und Datenerhalt bestanden.");
} finally {
  closeConnection(id);
  for (const table of [sensorReadings, baseProfileReadings, externalSensors, controlProfiles, registers]) {
    await db.delete(table).where(eq(table.deviceId, id));
  }
  await db.delete(devices).where(eq(devices.id, id));
  for (const socket of sockets) socket.destroy();
  await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await pool.end();
}
