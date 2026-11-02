import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { PointerEvent } from "react";
import { historyTimeAtPosition, type HistoryComparisonProps } from "@/lib/history-comparison";

export const formatComparisonTime = (time: number) =>
  format(new Date(time), "EEE, dd.MM. HH:mm:ss", { locale: de });

// Recharts supplies the real plot offset to Customized, including all visible
// axes. Mapping pointer positions here also works when the axis layout changes.
export function HistoryComparisonTarget({
  offset, windowStart, windowEnd, onComparisonTimeChange,
}: {
  offset?: { left: number; top: number; width: number; height: number };
  windowStart: number;
  windowEnd: number;
} & Pick<HistoryComparisonProps, "onComparisonTimeChange">) {
  if (!offset) return null;
  const select = (event: PointerEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const time = historyTimeAtPosition(event.clientX, bounds.left, bounds.width, windowStart, windowEnd);
    if (time !== null) onComparisonTimeChange(time);
  };
  return (
    <rect
      x={offset.left} y={offset.top} width={offset.width} height={offset.height}
      fill="transparent" pointerEvents="all"
      style={{ touchAction: "pan-y pinch-zoom", cursor: "crosshair" }}
      onPointerDown={select}
      onPointerMove={(event) => { if (event.pointerType === "mouse") select(event); }}
      data-testid="history-comparison-target"
    />
  );
}

export interface ComparisonReading {
  key: string;
  label: string;
  color: string;
  value: number | null | undefined;
  unit: string;
  measuredAt?: number;
}

export function HistoryComparisonReadout({ time, readings }: { time: number; readings: ComparisonReading[] }) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-xs" data-testid="history-comparison-readout">
      <p className="mb-1 font-medium">Vergleich: {formatComparisonTime(time)}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {readings.map(reading => (
          <div key={reading.key}>
            <span style={{ color: reading.color }}>{reading.label}: </span>
            {typeof reading.value === "number" && Number.isFinite(reading.value) && reading.measuredAt !== undefined ? (
              <>
                <span className="font-mono">{reading.value.toLocaleString("de-DE", { maximumFractionDigits: 2 })}{reading.unit ? ` ${reading.unit}` : ""}</span>
                <span className="ml-1 text-muted-foreground">(Messung {formatComparisonTime(reading.measuredAt)})</span>
              </>
            ) : <span className="text-muted-foreground">Keine Messung</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
