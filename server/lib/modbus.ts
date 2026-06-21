import { ModbusTCPClient } from "jsmodbus";
import { Socket } from "net";

// Simple in-memory client cache
const clients: Record<number, { socket: Socket, client: ModbusTCPClient, proxy: ModbusTCPClient }> = {};

// Per-connection request queue. A single Modbus/TCP socket can only have one
// transaction in flight at a time – overlapping requests cause responses to be
// matched to the wrong request ("request fc and response fc does not match").
// The polling loop, the automation engine, the MQTT command handler and the API
// all share one connection per device, so every request is funnelled through a
// per-id promise chain to guarantee strict serialization.
const locks: Record<number, Promise<unknown>> = {};

// Coalesce concurrent connection attempts: two callers racing before the socket
// is cached must not each open (and leak) a socket to the same device.
const pending: Record<number, Promise<ModbusTCPClient>> = {};

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
        return (...args: any[]) => runExclusive(id, () => (value as Function).apply(target, args));
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export async function getModbusClient(id: number, ip: string, port: number, slaveId: number): Promise<ModbusTCPClient> {
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
  if (id in pending) return pending[id];

  const connectPromise = new Promise<ModbusTCPClient>((resolve, reject) => {
    const socket = new Socket();
    const client = new ModbusTCPClient(socket, slaveId);

    socket.connect({ host: ip, port: port });

    socket.on("connect", () => {
      const proxy = serializeClient(id, client);
      clients[id] = { socket, client, proxy };
      resolve(proxy);
    });

    socket.on("error", (err) => {
      reject(err);
    });

    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error("Connection timed out"));
    });
  });

  pending[id] = connectPromise;
  try {
    return await connectPromise;
  } finally {
    delete pending[id];
  }
}

export function closeConnection(id: number) {
  if (clients[id]) {
    try {
      clients[id].socket.destroy();
    } catch (e) {}
    delete clients[id];
    delete locks[id];
  }
}
