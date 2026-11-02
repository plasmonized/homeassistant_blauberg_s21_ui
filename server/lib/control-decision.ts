import type { ControlDecision } from "@shared/control-decision";

// Observations only: never run a controller again merely to explain its output.
// A fresh evaluation is captured even when no Modbus write/log entry is needed.
const decisions = new Map<number, Map<number, ControlDecision>>();

export function recordControlDecision(decision: Omit<ControlDecision, "evaluatedAt">, now = Date.now()) {
  let profiles = decisions.get(decision.deviceId);
  if (!profiles) decisions.set(decision.deviceId, profiles = new Map());
  profiles.set(decision.profileId, { ...decision, evaluatedAt: new Date(now).toISOString() });
}

export function latestControlDecision(deviceId: number, activeProfileIds: number[]): ControlDecision | null {
  const profiles = decisions.get(deviceId);
  if (!profiles) return null;
  const active = new Set(activeProfileIds);
  // Remove disabled/deleted profiles so old decisions cannot be reactivated.
  for (const id of profiles.keys()) if (!active.has(id)) profiles.delete(id);
  return [...profiles.values()].reduce<ControlDecision | null>((latest, decision) =>
    !latest || decision.evaluatedAt >= latest.evaluatedAt ? decision : latest, null);
}
