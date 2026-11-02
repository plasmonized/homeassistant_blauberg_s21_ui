// Half of the regular five-minute recording interval. Never interpolate or
// carry a measurement through an outage just to populate the comparison.
export const HISTORY_COMPARISON_TOLERANCE = 150_000;

export interface HistoryComparisonProps {
  comparisonTime: number | null;
  onComparisonTimeChange: (time: number) => void;
}

export function nearestHistoryPoint<T extends { t: number }>(
  points: readonly T[], time: number, tolerance = HISTORY_COMPARISON_TOLERANCE,
): T | undefined {
  if (!Number.isFinite(time)) return undefined;
  let nearest: T | undefined;
  let distance = Infinity;
  for (const point of points) {
    const delta = Math.abs(point.t - time);
    if (delta <= tolerance && (delta < distance || (delta === distance && point.t < (nearest?.t ?? Infinity)))) {
      nearest = point;
      distance = delta;
    }
  }
  return nearest;
}

export function historyTimeAtPosition(x: number, left: number, width: number, start: number, end: number) {
  if (width <= 0 || ![x, left, width, start, end].every(Number.isFinite)) return null;
  return Math.round(start + Math.max(0, Math.min(1, (x - left) / width)) * (end - start));
}
