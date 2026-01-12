import { ModbusTCPClient } from "jsmodbus";
import { Socket } from "net";

// Simple in-memory client cache
const clients: Record<number, { socket: Socket, client: ModbusTCPClient }> = {};

export async function getModbusClient(id: number, ip: string, port: number, slaveId: number): Promise<ModbusTCPClient> {
  // Reuse existing connection if active
  if (clients[id]) {
    if (clients[id].socket.writable && !clients[id].socket.destroyed) {
        return clients[id].client;
    }
    // Cleanup dead connection
    try { clients[id].socket.destroy(); } catch (e) {}
    delete clients[id];
  }

  const socket = new Socket();
  const client = new ModbusTCPClient(socket, slaveId);

  return new Promise((resolve, reject) => {
    socket.connect({ host: ip, port: port });

    socket.on("connect", () => {
      clients[id] = { socket, client };
      resolve(client);
    });

    socket.on("error", (err) => {
      reject(err);
    });

    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error("Connection timed out"));
    });
  });
}

export function closeConnection(id: number) {
  if (clients[id]) {
    try {
      clients[id].socket.destroy();
    } catch (e) {}
    delete clients[id];
  }
}
