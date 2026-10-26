import { Socket } from "node:net";
import { ModbusTCPClient } from "jsmodbus";
import type { DeviceConnection } from "@shared/device-connection";

// Independent, bounded, read-only probe: testing never switches the live socket
// or sends writes to a candidate IP.
export async function probeDeviceConnection(
  target: DeviceConnection, timeoutMs = 6000,
): Promise<{ success: boolean; message: string }> {
  const socket = new Socket();
  const client = new ModbusTCPClient(socket, target.slaveId);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Zeitüberschreitung: Anlage nicht erreichbar")), timeoutMs);
      const finish = (error?: Error) => {
        clearTimeout(timer);
        if (error) reject(error); else resolve();
      };
      socket.once("error", finish);
      socket.once("close", () => finish(new Error("Die Anlage hat die Verbindung geschlossen")));
      socket.once("connect", async () => {
        try {
          // Canonical S21 Fan Speed, holding register 2. No power or fan writes.
          await client.readHoldingRegisters(2, 1);
          finish();
        } catch (error) { finish(error instanceof Error ? error : new Error("Keine gültige Modbus-Antwort")); }
      });
      socket.connect({ host: target.ip, port: target.port });
    });
    return { success: true, message: "Modbus-Verbindung erfolgreich geprüft" };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    const message = code === "ECONNREFUSED" ? "Verbindung abgelehnt – IP-Adresse, Modbus-Port und Freigabe prüfen"
      : code === "ENOTFOUND" || code === "EAI_AGAIN" ? "Hostname konnte nicht aufgelöst werden"
      : error instanceof Error ? error.message : "Anlage nicht erreichbar";
    return { success: false, message };
  } finally {
    socket.destroy();
  }
}
