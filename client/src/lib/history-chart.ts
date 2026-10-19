// A missing five-minute sample must break a line rather than bridge an outage.
export function withHistoryGaps<T extends { t: number }>(points: T[], empty: (t: number) => T): T[] {
  const result: T[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous && point.t - previous.t > 450_000) result.push(empty(previous.t + 300_000));
    result.push(point);
  }
  return result;
}
