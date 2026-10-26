import { ModbusTCPClient } from "jsmodbus";
import { Socket } from "net";

// Simple in-memory client cache
const clients: Record<number, { socket: Socket, client: ModbusTCPClient, proxy: ModbusTCPClient, endpoint: string }> = {};

// Per-connection request queue. A single Modbus/TCP socket can only have one
// transaction in flight at a time – overlapping requests cause responses to be
// matched to the wrong request ("request fc and response fc does not match").
// The polling loop, the automation engine, the MQTT command handler and the API
// all share one connection per device, so every request is funnelled through a
// per-id promise chain to guarantee strict serialization.
const locks: Record<number, Promise<unknown>> = {};

// Coalesce concurrent connection attempts: two callers racing before the socket
// is cached must not each open (and leak) a socket to the same device.
const pending: Record<number, { promise: Promise<ModbusTCPClient>; socket: Socket; endpoint: string }> = {};
const configuredTargets = new Map<number, string>();
const endpointKey = (ip: string, port: number, slaveId: number) => JSON.stringify([ip, port, slaveId]);
export const isModbusTargetCurrent = (id: number, ip: string, port: number, slaveId: number) =>
  !configuredTargets.has(id) || configuredTargets.get(id) === endpointKey(ip, port, slaveId);

// Pin the newly saved target. Old polling/MQTT/API callers still holding the
// previous Device object must not reopen its old address after a handover.
export function setModbusTarget(id: number, ip: string, port: number, slaveId: number) {
  configuredTargets.set(id, endpointKey(ip, port, slaveId));
  closeConnection(id);
}

function runExclusive<T>(id: number, fn: () => Promise<T>): Promise<T> {
  const prev = locks[id] ?? Promise.resolve();
  const run = prev.then(fn, fn);
  // Keep the chain alive regardless of success/failure of the current request.
  locks[id] = run.then(() => undefined, () => undefined);
  return run;
}

const SERIALIZED_METHODS = new Set([
  "readCoils",
  "readDiscreteInputs",
  "readHoldingRegisters",
  "readInputRegisters",
  "writeSingleCoil",
  "writeSingleRegister",
  "writeMultipleCoils",
  "writeMultipleRegisters",
]);

function serializeClient(id: number, client: ModbusTCPClient): ModbusTCPClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === "string" && SERIALIZED_METHODS.has(prop) && typeof value === "function") {
        return (...args: any[]) => runExclusive(id, () => {
          if (clients[id]?.client !== client || clients[id].socket.destroyed) {
            throw new Error("Verbindung wurde gewechselt – Vorgang bitte erneut versuchen");
          }
          return (value as Function).apply(target, args);
        });
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function evictClient(id: number, socket: Socket) {
  // Only evict if the cached entry still refers to this specific socket.
  // A concurrent reconnect may have already replaced it.
  if (clients[id]?.socket === socket) {
    delete clients[id];
    delete locks[id];
  }
}

export async function getModbusClient(id: number, ip: string, port: number, slaveId: number): Promise<ModbusTCPClient> {
  const endpoint = endpointKey(ip, port, slaveId);
  if (!isModbusTargetCurrent(id, ip, port, slaveId)) {
    throw new Error("Verbindungsdaten wurden geändert – veraltete Adresse wird nicht erneut geöffnet");
  }
  if ((clients[id] && clients[id].endpoint !== endpoint) || (pending[id] && pending[id].endpoint !== endpoint)) {
    closeConnection(id);
  }
  // Reuse existing connection if active
  if (clients[id]) {
    if (clients[id].socket.writable && !clients[id].socket.destroyed) {
        return clients[id].proxy;
    }
    // Cleanup dead connection
    try { clients[id].socket.destroy(); } catch (e) {}
    delete clients[id];
    delete locks[id];
  }

  // If a connection attempt is already in flight, await it instead of opening a second socket.
  if (id in pending) return pending[id].promise;

  const socket = new Socket();
  const connectPromise = new Promise<ModbusTCPClient>((resolve, reject) => {
    const client = new ModbusTCPClient(socket, slaveId);

    socket.connect({ host: ip, port: port });

    socket.on("connect", () => {
      if (socket.destroyed || (configuredTargets.has(id) && configuredTargets.get(id) !== endpoint)) {
        socket.destroy();
        reject(new Error("Verbindungsaufbau wegen Adresswechsel abgebrochen"));
        return;
      }
      // The connection-phase timeout (set below) must be cleared once the
      // socket is alive. Leaving it active means any 5-second idle gap —
      // e.g. between two Modbus requests inside a long poll cycle — would
      // fire the handler, destroy the socket, and make all remaining
      // register reads fail with "Offline / no connection to modbus server".
      socket.setTimeout(0);

      const proxy = serializeClient(id, client);
      clients[id] = { socket, client, proxy, endpoint };

      // When the S21 closes the TCP connection from its side (or a network
      // error occurs after a successful connect), evict the cached client so
      // the next getModbusClient call opens a fresh socket rather than
      // returning a zombie client that will fail on every Modbus request.
      socket.once("close", () => {
        console.log(`[Modbus] Socket closed for device ${id}, evicting cached client`);
        evictClient(id, socket);
      });
      socket.once("error", (err) => {
        console.log(`[Modbus] Socket error for device ${id}: ${err.message}, evicting cached client`);
        evictClient(id, socket);
      });

      resolve(proxy);
    });

    socket.on("error", (err) => {
      socket.destroy();
      reject(err);
    });
    socket.once("close", () => reject(new Error("Verbindungsaufbau abgebrochen")));

    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error("Connection timed out"));
    });
  });

  pending[id] = { promise: connectPromise, socket, endpoint };
  try {
    return await connectPromise;
  } finally {
    if (pending[id]?.promise === connectPromise) delete pending[id];
  }
}

export function closeConnection(id: number) {
  if (pending[id]) {
    pending[id].socket.destroy();
    delete pending[id];
  }
  if (clients[id]) {
    try {
      clients[id].socket.destroy();
    } catch (e) {}
    delete clients[id];
    delete locks[id];
  }
}
