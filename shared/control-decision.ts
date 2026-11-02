export const CONTROL_DECISION_STALE_MS = 90_000;

export interface ControlDecision {
  deviceId: number;
  profileId: number;
  profileName: string;
  actionType: "fan_speed" | "standby";
  requestedValue: number;
  effectiveValue: number | null;
  reason: string;
  outcome: "unchanged" | "held" | "applied" | "failed";
  detail: string | null;
  evaluatedAt: string;
}

export interface ControlDecisionResponse {
  decision: ControlDecision | null;
  staleAfterMs: number;
}
