import { useBaseProfileHistory } from "@/hooks/use-base-profile-history";
import { AlertCircle, History, RotateCw } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { withHistoryGaps } from "@/lib/history-chart";

interface Props {
  deviceId: number;
  windowEnd: number;
}

const CHART_MARGIN = { top: 4, right: 36, left: 0, bottom: 4 };
const AXIS_TICK = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };
const SERIES = [
  { key: "co2", label: "CO₂", color: "#4ade80", unit: "ppm", axis: "co2" },
  { key: "indoorTemp", label: "Raum", color: "#f87171", unit: "°C", axis: "temp" },
  { key: "outdoorTemp", label: "Außen", color: "#60a5fa", unit: "°C", axis: "temp" },
  { key: "humidity", label: "Feuchte", color: "#c084fc", unit: "%", axis: "humidity" },
  { key: "fanSpeed", label: "Lüfterstufe", color: "#cbd5e1", unit: "", axis: "fan" },
] as const;

const formatTick = (value: number) => format(new Date(value), "HH:mm", { locale: de });
const formatTooltipTime = (value: number) =>
  format(new Date(value), "EEE, dd.MM. HH:mm", { locale: de });
const formatValue = (value: number, key: string) => value.toLocaleString("de-DE", {
  maximumFractionDigits: key === "co2" || key === "fanSpeed" ? 0 : 1,
});

function SourceNote({ label, source }: { label: string; source: string }) {
  return <span title={`${label}: aktuell konfiguriert — ${source}`} className="truncate">{label}: {source}</span>;
}

export function BaseProfileHistoryChart({ deviceId, windowEnd }: Props) {
  const { data, isLoading, isError, error, refetch, isFetching } = useBaseProfileHistory(deviceId, 48);
  const windowStart = windowEnd - 48 * 60 * 60 * 1000;
  const points = withHistoryGaps((data?.points ?? [])
    .map((point) => ({ ...point, t: new Date(point.t).getTime() }))
    .filter((point) => Number.isFinite(point.t) && point.t >= windowStart && point.t <= windowEnd)
    .sort((a, b) => a.t - b.t), t => ({
      t, indoorTemp: null, outdoorTemp: null, co2: null, humidity: null, fanSpeed: null,
    }));

  if (isLoading) return <Skeleton className="h-[270px] w-full rounded-xl" />;

  if (isError) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 text-center">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Grundprofil-Verlauf ist nicht verfügbar."}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RotateCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Erneut versuchen
        </Button>
      </div>
    );
  }

  if (!data?.profile) {
    return <div className="rounded-xl border border-dashed border-border/50 px-4 py-8 text-center text-sm text-muted-foreground">Kein Grundprofil für dieses Gerät konfiguriert.</div>;
  }

  const usablePoints = points.some((point) =>
    point.indoorTemp !== null || point.outdoorTemp !== null || point.co2 !== null ||
    point.humidity !== null || point.fanSpeed !== null
  );

  if (!usablePoints) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 px-4 text-center">
        <History className="h-5 w-5 text-muted-foreground/60" />
        <p className="text-sm font-medium">Noch keine Grundprofil-Historie</p>
        <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
          {data.profile.enabled
            ? "Die Aufzeichnung beginnt nach der Aktualisierung. Ältere Messwerte sind nicht rückwirkend verfügbar."
            : "Das Grundprofil ist deaktiviert. Die Aufzeichnung beginnt, sobald es aktiviert wird."}
        </p>
      </div>
    );
  }

  const sourceEntries = [
    ["Raum", data.sources.indoorTemp],
    ["Außen", data.sources.outdoorTemp],
    ["CO₂", data.sources.co2],
    ["Feuchte", data.sources.humidity],
  ] as const;
  const activeSeries = SERIES.filter((series) =>
    points.some((point) => point[series.key] !== null)
  );

  return (
    <div className="space-y-2" data-testid="base-profile-history-chart">
      {!data.profile.enabled && (
        <p className="text-xs text-muted-foreground">Grundprofil deaktiviert – Aufzeichnung pausiert. Vorhandener Verlauf bleibt sichtbar.</p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[10px] text-muted-foreground">
        {activeSeries.map((series) => {
          const values = points.map((point) => point[series.key]).filter((value): value is number => value !== null);
          const min = Math.min(...values);
          const max = Math.max(...values);
          const low = formatValue(min, series.key);
          const high = formatValue(max, series.key);
          const range = low === high ? low : `${low}–${high}`;
          return (
            <span key={series.key} className="inline-flex items-center gap-1.5 whitespace-nowrap" title={`Eigene Skala: ${range}${series.unit ? ` ${series.unit}` : ""}`}>
              <span className="h-0.5 w-3 rounded" style={{ backgroundColor: series.color }} />
              {series.label}{series.unit ? ` · ${series.unit}` : ""} <span className="font-mono opacity-75">{range}</span>
            </span>
          );
        })}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/40)" />
          <XAxis
            type="number"
            dataKey="t"
            scale="time"
            domain={[windowStart, windowEnd]}
            ticks={Array.from({ length: 7 }, (_, index) => windowStart + index * 8 * 60 * 60 * 1000)}
            tickFormatter={formatTick}
            tick={AXIS_TICK}
            minTickGap={20}
            allowDataOverflow
          />
          <YAxis yAxisId="co2" orientation="left" width={42} domain={["auto", "auto"]} tick={AXIS_TICK} tickFormatter={(value) => `${value}`} />
          <YAxis yAxisId="temp" orientation="right" width={36} domain={["auto", "auto"]} tick={AXIS_TICK} tickFormatter={(value) => `${value}°`} />
          <YAxis yAxisId="humidity" orientation="right" width={36} domain={["auto", "auto"]} tick={AXIS_TICK} tickFormatter={(value) => `${value}%`} hide />
          <YAxis yAxisId="fan" orientation="right" width={36} domain={[-0.25, 3.25]} ticks={[0, 1, 2, 3]} tick={AXIS_TICK} hide />
          <Tooltip
            labelFormatter={(value) => formatTooltipTime(Number(value))}
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
            formatter={(value, name) => {
              const series = SERIES.find((entry) => entry.label === name);
              if (value === null || value === undefined) return ["Keine Messung", name];
              const formatted = formatValue(Number(value), series?.key ?? "");
              return [series?.key === "fanSpeed" ? `Stufe ${formatted}` : `${formatted}${series?.unit ? ` ${series.unit}` : ""}`, name];
            }}
          />
          {activeSeries.map((series) => (
            <Line
              key={series.key}
              yAxisId={series.axis}
              type={series.key === "fanSpeed" ? "stepAfter" : "monotone"}
              dataKey={series.key}
              name={series.label}
              stroke={series.color}
              dot={points.length === 1 ? { r: 3 } : false}
              activeDot={{ r: 3 }}
              strokeWidth={series.key === "fanSpeed" ? 1.5 : 1.7}
              strokeDasharray={series.key === "fanSpeed" ? "5 3" : undefined}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border/30 px-1 pt-2 text-[10px] text-muted-foreground">
        {sourceEntries.map(([label, source]) => (
          <SourceNote key={label} label={label} source={[source.label, source.source].filter(Boolean).join(" · ") || "nicht konfiguriert"} />
        ))}
        <span className="basis-full pt-0.5 opacity-75">Quellen zeigen die aktuelle Konfiguration; frühere Quellen können abweichen. Fan = gemessene Stufe 0–3.</span>
      </div>
    </div>
  );
}
