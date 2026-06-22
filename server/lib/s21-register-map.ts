/**
 * Canonical Modbus register map for the REAL Blauberg S21 hardware.
 *
 * Single source of truth for addresses, types, and default tags.
 * Tags are seeded on new registers only – user edits are preserved during reconciliation.
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
  tags?: string[];
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
    tags: ["control", "power"],
    legacyNames: ["System State (0:Off, 1:On)"],
  },
  {
    name: "Fan Speed",
    address: 2,
    type: "holding",
    dataType: "uint16",
    isWritable: true,
    tags: ["control", "fan"],
    legacyNames: ["Fan Speed (0:Low, 1:Med, 2:High)"],
  },
  {
    name: "Operation Mode",
    address: 43,
    type: "holding",
    dataType: "enum",
    isWritable: true,
    options: { "0": "Lüftung", "1": "Heizung", "2": "Kühlung", "3": "Auto" },
    tags: ["control", "mode"],
  },
  {
    name: "Temperature Setpoint",
    address: 44,
    type: "holding",
    dataType: "uint16",
    isWritable: true,
    unit: "°C",
    scale: 1,
    tags: ["control", "temperature", "setpoint"],
  },
  {
    name: "Bypass Control",
    address: 74,
    type: "holding",
    dataType: "enum",
    isWritable: true,
    options: { "0": "Geschlossen", "1": "Offen", "2": "Auto" },
    tags: ["control", "bypass"],
  },
  {
    name: "Boost Switch",
    address: 13,
    type: "coil",
    dataType: "bool",
    isWritable: true,
    tags: ["control", "boost"],
    legacyNames: ["Boost Timer (min)"],
  },
  {
    name: "Boost Active",
    address: 3,
    type: "coil",
    dataType: "bool",
    isWritable: false,
    tags: ["status", "boost"],
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
    tags: ["sensor", "temperature", "outdoor"],
  },
  {
    name: "Temperature - Supply",
    address: 2,
    type: "input",
    dataType: "int16",
    isWritable: false,
    unit: "°C",
    scale: 10,
    tags: ["sensor", "temperature", "supply"],
  },
  {
    name: "Temperature - Extract",
    address: 3,
    type: "input",
    dataType: "int16",
    isWritable: false,
    unit: "°C",
    scale: 10,
    tags: ["sensor", "temperature", "extract", "indoor"],
  },
  {
    name: "Temperature - Exhaust",
    address: 4,
    type: "input",
    dataType: "int16",
    isWritable: false,
    unit: "°C",
    scale: 10,
    tags: ["sensor", "temperature", "exhaust"],
  },
  {
    name: "Humidity",
    address: 10,
    type: "input",
    dataType: "uint16",
    isWritable: false,
    unit: "%",
    tags: ["sensor", "humidity", "indoor"],
  },
  {
    name: "CO2 Level",
    address: 12,
    type: "input",
    dataType: "uint16",
    isWritable: false,
    unit: "ppm",
    tags: ["sensor", "co2", "indoor"],
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
    tags: ["sensor", "filter", "status"],
    legacyNames: ["Filter Timer Remaining"],
  },
];

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
    tags: reg.tags ?? null,
  };
}

export function buildSeedRegisters(deviceId: number): InsertRegister[] {
  return S21_REGISTERS.map((reg) => toInsert(deviceId, reg));
}

/**
 * Idempotently bring a device's register rows in line with the canonical S21 map.
 * Tags are seeded on new rows only — user-edited tags on existing rows are preserved.
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
      // Preserve user-edited tags — only seed if the row has none yet
      const tagsToSet = (!match.tags || match.tags.length === 0)
        ? (canonical.tags ?? null)
        : match.tags;

      await storage.updateRegister(match.id, {
        name: canonical.name,
        address: canonical.address,
        type: canonical.type,
        dataType: canonical.dataType,
        isWritable: canonical.isWritable,
        unit: canonical.unit ?? null,
        scale: canonical.scale ?? 1,
        options: canonical.options ?? null,
        tags: tagsToSet,
      });
    } else {
      await storage.createRegister(toInsert(deviceId, canonical));
    }
  }

  for (const reg of existing) {
    if (!consumed.has(reg.id) && OBSOLETE_REGISTER_NAMES.includes(reg.name)) {
      await storage.deleteRegister(reg.id);
    }
  }
}

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
