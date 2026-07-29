import { storage } from "../storage";
import { getModbusClient, closeConnection } from "./modbus";

// Per-request timeout: if a single Modbus register read does not resolve
// within this many milliseconds it is aborted and counted as a failure.
// This prevents a frozen S21 TCP connection from stalling an entire poll
// cycle for up to the 60-second cycle hard-timeout.
const REGISTER_READ_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout reading ${label} after ${ms}ms`)), ms)
    ),
  ]);
}

// Reads every register for a device straight from the S21 over Modbus,
// writes the fresh values into the DB, and updates isConnected/lastSeen.
// Shared by the manual "Refresh" API route and the periodic automation
// cycle so both paths keep the same live-vs-stale semantics.
//
// Returns:
//   success:false          – could not even obtain a Modbus client (TCP connect failed)
//   success:true, failed:0 – full success, all registers read
//   success:true, failed:N – partial success, some registers failed (connection may be degraded)
//   success:false          – ALL registers failed → treated as full disconnect
export async function pollDeviceRegisters(
  deviceId: number
): Promise<{ success: boolean; message?: string; failedCount?: number }> {
  const device = await storage.getDevice(deviceId);
  if (!device) return { success: false, message: "Device not found" };

  try {
    const client = await getModbusClient(device.id, device.ip, device.port, device.slaveId);
    const registers = await storage.getRegisters(device.id);

    let failedCount = 0;

    for (const reg of registers) {
      let value: any = null;
      try {
        if (reg.type === "holding") {
          const resp = await withTimeout(
            client.readHoldingRegisters(reg.address, 1),
            REGISTER_READ_TIMEOUT_MS,
            reg.name
          );
          value = resp.response.body.values[0];
        } else if (reg.type === "input") {
          const resp = await withTimeout(
            client.readInputRegisters(reg.address, 1),
            REGISTER_READ_TIMEOUT_MS,
            reg.name
          );
          value = resp.response.body.values[0];
        } else if (reg.type === "coil") {
          const resp = await withTimeout(
            client.readCoils(reg.address, 1),
            REGISTER_READ_TIMEOUT_MS,
            reg.name
          );
          value = resp.response.body.values[0] ? 1 : 0;
        } else if (reg.type === "discrete") {
          const resp = await withTimeout(
            client.readDiscreteInputs(reg.address, 1),
            REGISTER_READ_TIMEOUT_MS,
            reg.name
          );
          const body = resp.response.body as any;
          value = body.values?.[0] ? 1 : 0;
        }

        if (reg.dataType === "bool") {
          value = !!value;
        } else if (reg.scale && reg.scale !== 1) {
          value = value / reg.scale;
        }

        await storage.updateRegisterValue(reg.id, value);
      } catch (e) {
        console.error(`Failed to read register ${reg.name}:`, e);
        failedCount++;
      }
    }

    // If every single register read failed the Modbus client is effectively
    // dead (zombie socket). Force-close it now so the next poll cycle opens a
    // fresh TCP connection instead of repeating the same failed reads forever.
    if (registers.length > 0 && failedCount === registers.length) {
      console.warn(`[Poll] All ${failedCount} registers failed for device ${device.id} – forcing reconnect`);
      closeConnection(device.id);
      await storage.updateDevice(device.id, { isConnected: false });
      return { success: false, message: `All ${failedCount} register reads failed`, failedCount };
    }

    await storage.updateDevice(device.id, { isConnected: true, lastSeen: new Date() });
    return { success: true, failedCount };
  } catch (error: any) {
    // TCP connect itself failed.
    closeConnection(device.id);
    await storage.updateDevice(device.id, { isConnected: false });
    return { success: false, message: error.message };
  }
}
