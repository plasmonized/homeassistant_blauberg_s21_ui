import type { ControlDecision } from "@shared/control-decision";
import type { DeviceOverviewStatus } from "@/lib/device-overview-status";

export type DecisionHistoryReason = "failed" | "offline" | "invalid-date" | "stale";

export interface ControlDecisionPresentation {
  evaluatedAt: string | null;
  historicalReason: DecisionHistoryReason | null;
  actualMismatch: boolean | null;
}

function actualFanNumber(fanLevel: string | null): number | null {
  if (!fanLevel) return null;
  const value = Number.parseFloat(fanLevel);
  return Number.isFinite(value) ? value : null;
}

export function presentControlDecision(
  decision: ControlDecision | null | undefined,
  staleAfterMs: number,
  now: number,
  connected: boolean,
  actual: Pick<DeviceOverviewStatus, "fanLevel" | "power">,
): ControlDecisionPresentation | null {
  if (!decision) return null;

  const evaluatedTime = Date.parse(decision.evaluatedAt);
  const evaluatedAt = Number.isFinite(evaluatedTime)
    ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(evaluatedTime)
    : null;
  let historicalReason: DecisionHistoryReason | null = null;

  if (decision.outcome === "failed") {
    historicalReason = "failed";
  } else if (!evaluatedAt) {
    historicalReason = "invalid-date";
  } else if (now - evaluatedTime > staleAfterMs) {
    historicalReason = "stale";
  } else if (!connected) {
    historicalReason = "offline";
  }

  let actualMismatch: boolean | null = null;
  if (historicalReason === null) {
    if (decision.actionType === "standby") {
      actualMismatch = actual.power === null ? null : actual.power !== "off";
    } else if (decision.effectiveValue !== null) {
      const fanNumber = actualFanNumber(actual.fanLevel);
      actualMismatch = actual.power === "off" ? true
        : actual.power === null || fanNumber === null ? null : fanNumber !== decision.effectiveValue;
    }
  }

  return { evaluatedAt, historicalReason, actualMismatch };
}
