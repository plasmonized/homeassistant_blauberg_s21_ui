import { Server as NetServer } from "net";
import { ModbusTCPServer } from "jsmodbus";

let simulatorServer: NetServer | null = null;

// Register address map for Blauberg S21 simulation
const REG_HOLDING_START = 1;
const REG_HOLDING_END = 100;
const REG_INPUT_START = 1;
const REG_INPUT_END = 100;

// Initialize realistic default values
function initHoldingBuffer(): Buffer {
  const buf = Buffer.alloc(REG_HOLDING_END * 2);
  // jsmodbus server uses 0-based addressing: buffer offset = address * 2
  // System State (addr 1) = 1 (On)
  buf.writeUInt16BE(1, 2);
  // Fan Speed (addr 2) = 1 (Medium)
  buf.writeUInt16BE(1, 4);
  // Operation Mode (addr 3) = 3 (Auto)
  buf.writeUInt16BE(3, 6);
  // Bypass (addr 4) = 0 (Auto)
  buf.writeUInt16BE(0, 8);
  // Standby (addr 5) = 0 (Off)
  buf.writeUInt16BE(0, 10);
  // Boost Timer (addr 21) = 0
  buf.writeUInt16BE(0, 42);
  return buf;
}

function initInputBuffer(): Buffer {
  const buf = Buffer.alloc(REG_INPUT_END * 2);
  // jsmodbus server uses 0-based addressing: buffer offset = address * 2
  // Temperature Outdoor (addr 10) = 22.5°C -> 225 (scale 10)
  buf.writeUInt16BE(225, 20);
  // Temperature Supply (addr 11) = 23.0°C -> 230
  buf.writeUInt16BE(230, 22);
  // Humidity (addr 12) = 45%
  buf.writeUInt16BE(45, 24);
  // CO2 (addr 13) = 420 ppm
  buf.writeUInt16BE(420, 26);
  // Temperature Extract (addr 14) = 24.5°C -> 245
  buf.writeUInt16BE(245, 28);
  // Temperature Exhaust (addr 15) = 23.5°C -> 235
  buf.writeUInt16BE(235, 30);
  // Filter Timer (addr 20) = 8760 hours
  buf.writeUInt16BE(8760, 40);
  return buf;
}

export function startSimulator(port = 5502): Promise<number> {
  return new Promise((resolve, reject) => {
    if (simulatorServer) {
      resolve(port);
      return;
    }

    const holding = initHoldingBuffer();
    const input = initInputBuffer();
    const coils = Buffer.alloc(100);
    const discrete = Buffer.alloc(100);

    const netServer = new NetServer((socket) => {
      const modbusServer = new ModbusTCPServer(netServer, {
        coils,
        discrete,
        holding,
        input,
      });
      modbusServer._onConnection(socket);
    });

    netServer.on("error", (err) => {
      if ((err as any).code === "EADDRINUSE") {
        console.log(`[Simulator] Port ${port} already in use, simulator may already be running.`);
        resolve(port);
      } else {
        reject(err);
      }
    });

    netServer.listen(port, "0.0.0.0", () => {
      simulatorServer = netServer;
      console.log(`[Simulator] Blauberg S21 Modbus TCP simulator running on port ${port}`);
      resolve(port);
    });
  });
}

export function stopSimulator(): void {
  if (simulatorServer) {
    simulatorServer.close();
    simulatorServer = null;
    console.log("[Simulator] Stopped.");
  }
}

export function getSimulatorStatus(): boolean {
  return simulatorServer !== null && simulatorServer.listening;
}
