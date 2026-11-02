import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { historyTimeAtPosition, nearestHistoryPoint } from "../client/src/lib/history-comparison";

const start = Date.parse("2026-11-01T12:00:00Z");
const points = [
  { t: start, value: 18 },
  { t: start + 300_000, value: null },
  { t: start + 600_000, value: 20 },
];
assert.equal(nearestHistoryPoint(points, start), points[0]);
assert.equal(nearestHistoryPoint(points, start + 50_000), points[0], "return actual point, not an interpolated value or timestamp");
assert.equal(nearestHistoryPoint(points, start + 150_000), points[0], "ties prefer earlier sample");
assert.equal(nearestHistoryPoint([...points].reverse(), start + 150_000), points[0], "tie independent of ordering");
assert.equal(nearestHistoryPoint(points, start + 299_000)?.value, null, "missing measurement remains missing");
assert.equal(nearestHistoryPoint(points, start + 750_001), undefined, "do not carry values past half the sample interval");
assert.equal(nearestHistoryPoint(points, start - 150_001), undefined);
assert.equal(nearestHistoryPoint([], start), undefined);
assert.equal(nearestHistoryPoint(points, NaN), undefined);
assert.equal(nearestHistoryPoint([{ t: NaN, value: 3 }], start), undefined);
const offsetSeries = [{ t: start + 90_000, value: 700 }];
assert.equal(nearestHistoryPoint(offsetSeries, start)?.t, start + 90_000, "different sampling times retain original timestamp");
assert.equal(nearestHistoryPoint(offsetSeries, start + 300_000), undefined, "no measurement in the comparison window");
assert.equal(nearestHistoryPoint([points[0], points[2]], start + 300_000), undefined, "outage is not bridged");
assert.equal(historyTimeAtPosition(200, 100, 200, start, start + 600_000), start + 300_000);
assert.equal(historyTimeAtPosition(90, 100, 200, start, start + 600_000), start);
assert.equal(historyTimeAtPosition(400, 100, 200, start, start + 600_000), start + 600_000);
assert.equal(historyTimeAtPosition(100, 100, 0, start, start + 600_000), null);
assert.equal(historyTimeAtPosition(NaN, 100, 200, start, start + 600_000), null);
// Exercise the actual SVG pointer handlers without needing device hardware or a
// browser. The bounding box, rather than a fixed axis width, defines the time.
const originalReact = Object.getOwnPropertyDescriptor(globalThis, "React");
Object.defineProperty(globalThis, "React", { configurable: true, value: React });
try {
  const { HistoryComparisonTarget, HistoryComparisonReadout } = await import("../client/src/components/HistoryComparison");
  let selected: number | null = null;
  const target = HistoryComparisonTarget({
    offset: { left: 42, top: 4, width: 200, height: 180 },
    windowStart: start, windowEnd: start + 600_000,
    onComparisonTimeChange: time => { selected = time; },
  })!;
  const event = (pointerType: string, clientX: number) => ({
    pointerType, clientX, currentTarget: { getBoundingClientRect: () => ({ left: 100, width: 200 }) },
  });
  target.props.onPointerMove(event("mouse", 200));
  assert.equal(selected, start + 300_000, "mouse hover selects continuous time");
  target.props.onPointerDown(event("touch", 250));
  assert.equal(selected, start + 450_000, "touch tap selects and persists");
  target.props.onPointerMove(event("touch", 270));
  assert.equal(selected, start + 450_000, "touch scrolling does not move the pinned selection");
  assert.equal(target.props.style.touchAction, "pan-y pinch-zoom", "native vertical scrolling remains available");
  const html = renderToStaticMarkup(React.createElement(HistoryComparisonReadout, {
    time: start,
    readings: [
      { key: "co2", label: "CO₂", color: "green", value: 700, unit: "ppm", measuredAt: start + 90_000 },
      { key: "missing", label: "Raum", color: "red", value: null, unit: "°C" },
      { key: "invalid", label: "Feuchte", color: "purple", value: NaN, unit: "%" },
    ],
  }));
  assert.match(html, /700 ppm/);
  assert.match(html, /Messung/);
  assert.equal((html.match(/Keine Messung/g) ?? []).length, 2);
  assert.ok(!html.includes("NaN"));
} finally {
  if (originalReact) Object.defineProperty(globalThis, "React", originalReact);
  else Reflect.deleteProperty(globalThis, "React");
}
console.log("Verlaufsvergleich: Zeitposition, versetzte Messungen, fehlende Werte und Aufzeichnungslücken bestanden.");
