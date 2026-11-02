import type { BaseProfileReferenceSettings } from "@shared/base-profile-history";

export interface BaseReferenceLine {
  key: string;
  axis: "temp" | "co2" | "humidity";
  value: number;
  label: string;
  color: string;
  unit: string;
  dash: string;
}

export function baseProfileReferenceLines(settings: BaseProfileReferenceSettings | null | undefined): BaseReferenceLine[] {
  if (!settings) return [];
  const lines: BaseReferenceLine[] = [
    { key: "roomSetpoint", axis: "temp", value: settings.roomSetpoint, label: "Raum-Soll", color: "#f87171", unit: "°C", dash: "6 4" },
  ];
  if (settings.co2ControlEnabled) {
    lines.push(
      { key: "co2Setpoint", axis: "co2", value: settings.co2Setpoint, label: "CO₂ ab Stufe 2", color: "#4ade80", unit: "ppm", dash: "6 4" },
      { key: "co2BoostThreshold", axis: "co2", value: settings.co2BoostThreshold, label: "CO₂ ab Stufe 3", color: "#4ade80", unit: "ppm", dash: "2 3" },
    );
  }
  if (settings.humidityControlEnabled) {
    lines.push(
      { key: "humiditySetpoint", axis: "humidity", value: settings.humiditySetpoint, label: "Feuchte ab Stufe 2", color: "#c084fc", unit: "%", dash: "6 4" },
      { key: "humidityBoostThreshold", axis: "humidity", value: settings.humidityBoostThreshold, label: "Feuchte ab Stufe 3", color: "#c084fc", unit: "%", dash: "2 3" },
    );
  }
  return lines.filter(line => Number.isFinite(line.value));
}
