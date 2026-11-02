import type { Register } from "@shared/schema";

export type FilterCondition = "ok" | "blocked" | "unknown";

export interface DeviceOverviewStatus {
  fanLevel: string | null;
  mode: string | null;
  power: "on" | "off" | null;
  filter: {
    condition: FilterCondition;
    label: string;
  };
  dataIsLastKnown: boolean;
}

function byTag(registers: Register[] | undefined, tag: string): Register | undefined {
  return registers?.find((register) => (register.tags ?? []).includes(tag));
}

function boolValue(value: string | null | undefined): boolean | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "on", "ein"].includes(normalized)) return true;
  if (["false", "0", "off", "aus"].includes(normalized)) return false;
  return null;
}

export function deriveDeviceOverviewStatus(
  registers: Register[] | undefined,
  isConnected: boolean,
): DeviceOverviewStatus {
  const fan = byTag(registers, "fan");
  const mode = byTag(registers, "mode");
  const power = byTag(registers, "power");
  const filter = byTag(registers, "filter");

  const fanValue = fan?.lastValue;
  const fanLevel = fanValue == null || fanValue.trim() === ""
    ? null
    : `${fanValue}${fan?.unit ? ` ${fan.unit}` : ""}`;
  const modeValue = mode?.lastValue;
  const modeLabel = modeValue == null
    ? null
    : mode?.options && typeof mode.options === "object"
      ? (mode.options as Record<string, unknown>)[modeValue] ?? modeValue
      : modeValue;
  const filterValue = filter?.lastValue?.trim();

  let filterStatus: DeviceOverviewStatus["filter"];
  if (filterValue === "0") {
    filterStatus = { condition: "ok", label: "Filter ohne Meldung" };
  } else if (filterValue === "1") {
    filterStatus = { condition: "blocked", label: "Zuluftfilter verstopft" };
  } else if (filterValue === "2") {
    filterStatus = { condition: "blocked", label: "Abluftfilter verstopft" };
  } else if (filterValue === "3") {
    filterStatus = { condition: "blocked", label: "Beide Filter / Timer abgelaufen" };
  } else {
    filterStatus = { condition: "unknown", label: "Keine Filtermeldung verfügbar" };
  }

  return {
    fanLevel,
    mode: modeLabel == null ? null : String(modeLabel),
    power: boolValue(power?.lastValue) === null
      ? null
      : boolValue(power?.lastValue) ? "on" : "off",
    filter: filterStatus,
    dataIsLastKnown: !isConnected,
  };
}
