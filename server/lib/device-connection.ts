import { storage } from "../storage";
import { setModbusTarget } from "./modbus";
import { probeDeviceConnection } from "./connection-probe";
import type { DeviceConnection } from "@shared/device-connection";

const changesInProgress = new Set<number>();
export class ConnectionChangeBusy extends Error {}

export async function saveDeviceConnection(
  id: number, updates: Partial<DeviceConnection> & { name?: string }, reconnect: boolean,
) {
  if (changesInProgress.has(id)) throw new ConnectionChangeBusy("Verbindungswechsel läuft bereits");
  changesInProgress.add(id);
  try {
    const existing = await storage.getDevice(id);
    if (!existing) return undefined;
    const target = {
      ip: updates.ip ?? existing.ip,
      port: updates.port ?? existing.port,
      slaveId: updates.slaveId ?? existing.slaveId,
    };
    const changed = target.ip !== existing.ip || target.port !== existing.port || target.slaveId !== existing.slaveId;
    const device = await storage.updateDevice(id, {
      ...updates, ...target, ...(changed || reconnect ? { isConnected: false } : {}),
    });
    if (changed || reconnect) setModbusTarget(id, target.ip, target.port, target.slaveId);
    if (!reconnect) return { device, connection: { success: device.isConnected, message: "Gerätedaten gespeichert" } };
    const connection = await probeDeviceConnection(target);
    const verified = await storage.updateDevice(id, {
      isConnected: connection.success, ...(connection.success ? { lastSeen: new Date() } : {}),
    });
    return { device: verified, connection };
  } finally {
    changesInProgress.delete(id);
  }
}
