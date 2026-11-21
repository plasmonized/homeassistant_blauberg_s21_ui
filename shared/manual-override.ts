export interface ManualOverrideStatus {
  durationMinutes: number;
  manualUntil: number | null;
  manualStage: number | null;
  source: "app" | "mqtt" | "console" | null;
  boost: boolean;
  boostSource: "hardware" | "rule" | "app" | null;
  boostUntil: number | null;
  boostObservedAt: number | null;
  active: boolean;
}
