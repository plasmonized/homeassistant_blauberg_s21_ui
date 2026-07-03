import { storage } from "../storage";
import { getModbusClient } from "./modbus";

// Reads every register for a device straight from the S21 over Modbus,
// writes the fresh values into the DB, and updates isConnected/lastSeen.
// Shared by the manual "Refresh" API route and the periodic automation
// cycle so both paths keep the same live-vs-stale semantics.
export async function pollDeviceRegisters(deviceId: number): Promise<{ success: boolean; message?: string }> {
  const device = await storage.getDevice(deviceId);
  if (!device) return { success: false, message: "Device not found" };

  try {
    const client = await getModbusClient(device.id, device.ip, device.port, device.slaveId);
    const registers = await storage.getRegisters(device.id);

    for (const reg of registers) {
      let value: any = null;
      try {
        if (reg.type === "holding") {
          const resp = await client.readHoldingRegisters(reg.address, 1);
          value = resp.response.body.values[0];
        } else if (reg.type === "input") {
          const resp = await client.readInputRegisters(reg.address, 1);
          value = resp.response.body.values[0];
        } else if (reg.type === "coil") {
          const resp = await client.readCoils(reg.address, 1);
          value = resp.response.body.values[0] ? 1 : 0;
        } else if (reg.type === "discrete") {
          const resp = await client.readDiscreteInputs(reg.address, 1);
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
      }
    }

    await storage.updateDevice(device.id, { isConnected: true, lastSeen: new Date() });
    return { success: true };
  } catch (error: any) {
    await storage.updateDevice(device.id, { isConnected: false });
    return { success: false, message: error.message };
  }
}
