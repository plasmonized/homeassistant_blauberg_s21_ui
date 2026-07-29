/**
 * heat-protection.ts
 *
 * Pure helper that reads the Hitzeschutz (heat-protection) state from a list
 * of control-log entries.  Extracted from ControlProfilesPanel so it can be
 * unit-tested without any React or Vite dependencies.
 *
 * CONTRACT — log field formats produced by automation.ts / control-engine.ts:
 *
 *   Standby active:
 *     actionTaken starts with "standby"   e.g. "standby=0"
 *
 *   CO₂/humidity override (threshold exceeded but fresh-air forced):
 *     message contains "Hitzeschutz" AND "Override"
 *     e.g. "Hitzeschutz (außen 33.0°C ≥ 32°C) – Override wegen CO₂ 1100ppm > 1000ppm → Stufe 1 Mindestlüftung → …"
 *     The override reason is extracted via /Override wegen (.+?) →/
 *
 * If this contract ever changes (e.g. the reason strings in control-engine.ts
 * are reworded), the unit tests in scripts/test-heat-protection-badge.ts will
 * fail immediately — that is intentional.
 */

export interface HeatProtectionStatus {
  standby: boolean;
  override: boolean;
  overrideReason: string | null;
}

export function getHeatProtectionStatus(
  logs: any[],
  profileId: number,
): HeatProtectionStatus {
  if (!logs || logs.length === 0) {
    return { standby: false, override: false, overrideReason: null };
  }

  const profileLogs = logs
    .filter((l: any) => l.profileId === profileId)
    .sort(
      (a: any, b: any) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

  const latest = profileLogs[0];
  if (!latest) {
    return { standby: false, override: false, overrideReason: null };
  }

  // Standby: the automation wrote the System State coil to 0.
  if (latest.actionTaken?.startsWith("standby")) {
    return { standby: true, override: false, overrideReason: null };
  }

  // Override: heat threshold exceeded but CO₂ or humidity forced stage 1.
  if (
    latest.message?.includes("Hitzeschutz") &&
    latest.message?.includes("Override")
  ) {
    const match = latest.message.match(/Override wegen (.+?) →/);
    return {
      standby: false,
      override: true,
      overrideReason: match ? match[1] : null,
    };
  }

  return { standby: false, override: false, overrideReason: null };
}
