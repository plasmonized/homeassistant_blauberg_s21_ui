/**
 * Canonical Modbus register map for the REAL Blauberg S21 hardware.
 *
 * This is the single source of truth for which registers the add-on manages.
 * Addresses, types and ranges follow the official S21 Modbus table:
 *   - CL_POWER ............ coil   @0   System on/off
 *   - CL_Boost_MODE ....... coil   @3   Boost active (read-only status)
 *   - CL_BoostSWITCH_CTRL . coil   @13  Boost switch enable
 *   - HR_SPEED_MODE ....... holding@2   Fan stage 1..5
 *   - HR_OPERATION_MODE ... holding@43  Operating mode
 *   - HR_SetTEMP .......... holding@44  Temperature setpoint (°C)
 *   - HR_BPS_ROTOR_MODE ... holding@74  Bypass {0 closed, 1 open, 2 auto}
 *   - IR_CurTEMP_* ........ input  @1..4 Outdoor/Supply/Extract/Exhaust (×10 °C)
 *   - IR_CurRH_Int ........ input  @10  Humidity (%)
 *   - IR_CurCO2_Int ....... input  @12  CO2 (ppm)
 *   - IR_StateFILTER ...... input  @31  Filter status enum
 *
 * The automation engine resolves registers by NAME substring (e.g. "Fan Speed",
 * "System", "Bypass", "Operation Mode", "Boost", "Temperature Setpoint"), so the
 * canonical names below deliberately keep those tokens.
 */

import type { InsertRegister, RegisterType, RegisterDataType } from "@shared/schema";
import { storage } from "../storage";

export interface CanonicalRegister {
  name: string;
  address: number;
  type: RegisterType;
  dataType: RegisterDataType;
  isWritable: boolean;
  unit?: string | null;
  scale?: number;
  options?: Record<string, string> | null;
  /**
   * Older register names (from previous seed versions) that this canonical
   * entry should adopt during reconciliation. Matched by exact equality so a
   * pre-existing row is updated in place (preserving its id) instead of being
   * duplicated.
   */
  legacyNames?: string[];
}

export const S21_REGISTERS: CanonicalRegister[] = [
  // --- Controls ---
  {
    name: "System State",
    address: 0,
    type: "coil",
    dataType: "bool",
    isWritable: true,
    legacyNames: ["System State (0:Off, 1:On)"],
  },
  {
    name: "Fan Speed",
    address: 2,
    type: "holding",
    dataType: "uint16",
    isWritable: true,
    legacyNames: ["Fan Speed (0:Low, 1:Med, 2:High)"],
  },
  {
    name: "Operation Mode",
    address: 43,
    type: "holding",
    dataType: "enum",
    isWritable: true,
    options: { "0": "Lüftung", "1": "Heizung", "2": "Kühlung", "3": "Auto" },
  },
  {
    name: "Temperature Setpoint",
    address: 44,
    type: "holding",
    dataType: "uint16",
    isWritable: true,
    unit: "°C",
    scale: 1,
  },
  {
    name: "Bypass Control",
    address: 74,
    type: "holding",
    dataType: "enum",
    isWritable: true,
    options: { "0": "Geschlossen", "1": "Offen", "2": "Auto" },
  },
  {
    name: "Boost Switch",
    address: 13,
    type: "coil",
    dataType: "bool",
    isWritable: true,
    legacyNames: ["Boost Timer (min)"],
  },
  {
    name: "Boost Active",
    address: 3,
    type: "coil",
    dataType: "bool",
    isWritable: false,
  },

  // --- Sensors (read-only input registers) ---
  {
    name: "Temperature - Outdoor",
    address: 1,
    type: "input",
    dataType: "int16",
    isWritable: false,
    unit: "°C",
    scale: 10,
  },
  {
    name: "Temperature - Supply",
    address: 2,
    type: "input",
    dataType: "int16",
    isWritable: false,
    unit: "°C",
    scale: 10,
  },
  {
    name: "Temperature - Extract",
    address: 3,
    type: "input",
    dataType: "int16",
    isWritable: false,
    unit: "°C",
    scale: 10,
  },
  {
    name: "Temperature - Exhaust",
    address: 4,
    type: "input",
    dataType: "int16",
    isWritable: false,
    unit: "°C",
    scale: 10,
  },
  {
    name: "Humidity",
    address: 10,
    type: "input",
    dataType: "uint16",
    isWritable: false,
    unit: "%",
  },
  {
    name: "CO2 Level",
    address: 12,
    type: "input",
    dataType: "uint16",
    isWritable: false,
    unit: "ppm",
  },
  {
    name: "Filter Status",
    address: 31,
    type: "input",
    dataType: "enum",
    isWritable: false,
    options: {
      "0": "Sauber",
      "1": "Zuluftfilter verstopft",
      "2": "Abluftfilter verstopft",
      "3": "Beide / Timer abgelaufen",
    },
    legacyNames: ["Filter Timer Remaining"],
  },
];

/**
 * Register names that no longer exist on the real S21 and must be removed
 * during reconciliation (they are not adopted by any canonical entry).
 */
export const OBSOLETE_REGISTER_NAMES = ["Standby Mode"];

function toInsert(deviceId: number, reg: CanonicalRegister): InsertRegister {
  return {
    deviceId,
    name: reg.name,
    address: reg.address,
    type: reg.type,
    dataType: reg.dataType,
    isWritable: reg.isWritable,
    unit: reg.unit ?? null,
    scale: reg.scale ?? 1,
    options: reg.options ?? null,
  };
}

/** Build the full canonical seed for a freshly created device. */
export function buildSeedRegisters(deviceId: number): InsertRegister[] {
  return S21_REGISTERS.map((reg) => toInsert(deviceId, reg));
}

/**
 * Idempotently bring a device's register rows in line with the canonical S21
 * map. Matches each canonical register by its name first, then by any legacy
 * alias; updates the matched row in place (preserving its id so caches/links
 * stay valid), creates any that are missing, and finally deletes only known
 * obsolete rows. Unknown user-added registers are left untouched.
 */
export async function reconcileS21Registers(deviceId: number): Promise<void> {
  const existing = await storage.getRegisters(deviceId);
  const consumed = new Set<number>();

  for (const canonical of S21_REGISTERS) {
    const candidateNames = [canonical.name, ...(canonical.legacyNames ?? [])];
    const match = existing.find(
      (r) => !consumed.has(r.id) && candidateNames.includes(r.name)
    );

    if (match) {
      consumed.add(match.id);
      await storage.updateRegister(match.id, {
        name: canonical.name,
        address: canonical.address,
        type: canonical.type,
        dataType: canonical.dataType,
        isWritable: canonical.isWritable,
        unit: canonical.unit ?? null,
        scale: canonical.scale ?? 1,
        options: canonical.options ?? null,
      });
    } else {
      await storage.createRegister(toInsert(deviceId, canonical));
    }
  }

  // Remove registers that are obsolete on the real S21 hardware.
  for (const reg of existing) {
    if (!consumed.has(reg.id) && OBSOLETE_REGISTER_NAMES.includes(reg.name)) {
      await storage.deleteRegister(reg.id);
    }
  }
}

/** Reconcile every known device at startup. */
export async function reconcileAllS21Devices(): Promise<void> {
  const devices = await storage.getDevices();
  for (const device of devices) {
    try {
      await reconcileS21Registers(device.id);
    } catch (err) {
      console.error(`[S21] Register reconciliation failed for device ${device.id}:`, err);
    }
  }
}
