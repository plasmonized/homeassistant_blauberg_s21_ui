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
  // Fan Speed HR_SPEED_MODE (addr 2) = 2 (Stufe 2)
  buf.writeUInt16BE(2, 4);
  // Operation Mode HR_OPERATION_MODE (addr 43) = 3 (Auto)
  buf.writeUInt16BE(3, 86);
  // Temperature Setpoint HR_SetTEMP (addr 44) = 23°C
  buf.writeUInt16BE(23, 88);
  // Bypass HR_BPS_ROTOR_MODE (addr 74) = 2 (Auto)
  buf.writeUInt16BE(2, 148);
  return buf;
}

function initInputBuffer(): Buffer {
  const buf = Buffer.alloc(REG_INPUT_END * 2);
  // jsmodbus server uses 0-based addressing: buffer offset = address * 2
  // Temperature Outdoor IR_CurTEMP_SuAirIn (addr 1) = 22.5°C -> 225 (scale 10)
  buf.writeUInt16BE(225, 2);
  // Temperature Supply IR_CurTEMP_SuAirOut (addr 2) = 23.0°C -> 230
  buf.writeUInt16BE(230, 4);
  // Temperature Extract IR_CurTEMP_ExAirIn (addr 3) = 24.5°C -> 245
  buf.writeUInt16BE(245, 6);
  // Temperature Exhaust IR_CurTEMP_ExAirOut (addr 4) = 23.5°C -> 235
  buf.writeUInt16BE(235, 8);
  // Humidity Indoor IR_CurRH_Int (addr 10) = 45%
  buf.writeUInt16BE(45, 20);
  // Humidity Outdoor IR_CurRH_Ext (addr 11) = 65%
  buf.writeUInt16BE(65, 22);
  // CO2 IR_CurCO2_Int (addr 12) = 420 ppm
  buf.writeUInt16BE(420, 24);
  // Filter Status IR_StateFILTER (addr 31) = 0 (Sauber)
  buf.writeUInt16BE(0, 62);
  return buf;
}

function initCoilBuffer(): Buffer {
  // jsmodbus stores coils as a bit-field: coil `address` lives in
  // byte Math.floor(address / 8), bit (address % 8).
  const buf = Buffer.alloc(100);
  const setCoil = (address: number, on: boolean) => {
    if (!on) return;
    buf[Math.floor(address / 8)] |= 1 << (address % 8);
  };
  setCoil(0, true);   // CL_POWER – system on
  setCoil(3, false);  // CL_Boost_MODE – boost not active
  setCoil(13, true);  // CL_BoostSWITCH_CTRL – boost switch enabled (default)
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
    const coils = initCoilBuffer();
    const discrete = Buffer.alloc(100);

    // ModbusTCPServer's constructor attaches its own 'connection' handler to
    // the net server and manages each client socket itself. Do NOT pass a
    // connectionListener to NetServer or call _onConnection manually: doing so
    // per connection registers duplicate Modbus handlers, so every socket ends
    // up answered by multiple server instances. The extra responses desync the
    // client, which then reports "request fc and response fc does not match".
    const netServer = new NetServer();
    const modbusServer = new ModbusTCPServer(netServer, {
      coils,
      discrete,
      holding,
      input,
    });
    void modbusServer;

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
