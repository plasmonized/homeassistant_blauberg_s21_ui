import { useBaseProfileHistory } from "@/hooks/use-base-profile-history";
import { useId, useState } from "react";
import { AlertCircle, History, RotateCw } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { withHistoryGaps } from "@/lib/history-chart";
import { baseProfileReferenceLines } from "@/lib/base-profile-reference-lines";
import { Switch } from "@/components/ui/switch";

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
  const [showReferences, setShowReferences] = useState(false);
  const referenceSwitchId = useId();
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useBaseProfileHistory(deviceId, 48);
  const referenceLines = showReferences ? baseProfileReferenceLines(data?.currentSettings) : [];
  const windowStart = windowEnd - 48 * 60 * 60 * 1000;
  const points = withHistoryGaps((data?.points ?? [])
    .map((point) => ({ ...point, t: new Date(point.t).getTime() }))
    .filter((point) => Number.isFinite(point.t) && point.t >= windowStart && point.t <= windowEnd)
    .sort((a, b) => a.t - b.t), t => ({
      t, indoorTemp: null, outdoorTemp: null, co2: null, humidity: null, fanSpeed: null,
    }));

  if (isLoading) return <Skeleton className="h-[270px] w-full rounded-xl" />;

  if (isError && !data) {
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
      {isError && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Aktualisierung fehlgeschlagen – zuletzt geladene Daten bleiben sichtbar
            {dataUpdatedAt ? ` (geladen ${format(new Date(dataUpdatedAt), "dd.MM. HH:mm")})` : ""}.
            {" "}Ein erneuter Versuch erfolgt automatisch.
          </span>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RotateCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Aktualisieren
          </Button>
        </div>
      )}
      {!data.profile.enabled && (
        <p className="text-xs text-muted-foreground">Grundprofil deaktiviert – Aufzeichnung pausiert. Vorhandener Verlauf bleibt sichtbar.</p>
      )}
      <div className="flex items-center gap-2 px-1">
        <Switch id={referenceSwitchId} checked={showReferences} onCheckedChange={setShowReferences} data-testid="toggle-base-profile-references" />
        <label htmlFor={referenceSwitchId} className="cursor-pointer text-xs">Aktuelle Soll- und Schwellenwerte einblenden</label>
      </div>
      {showReferences && (
        <div className="space-y-1 px-1 text-[10px] text-muted-foreground" data-testid="base-profile-reference-legend">
          <p>Referenzlinien: aktuell eingestellte Werte – keine historische Konfiguration. Sie gelten zum Vergleich für den gesamten Verlauf.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {referenceLines.map(line => (
              <span key={line.key} className="inline-flex items-center gap-1.5">
                <svg width="20" height="6" aria-hidden="true"><line x1="0" x2="20" y1="3" y2="3" stroke={line.color} strokeWidth="2" strokeDasharray={line.dash} /></svg>
                {line.label} aktuell: {formatValue(line.value, line.axis)} {line.unit}
              </span>
            ))}
          </div>
          {!data.currentSettings && <p>Aktuelle Soll- und Schwellenwerte sind nicht verfügbar.</p>}
          {data.currentSettings && !data.currentSettings.co2ControlEnabled && <p>CO₂-Regelung deaktiviert – keine CO₂-Referenzlinien.</p>}
          {data.currentSettings && !data.currentSettings.humidityControlEnabled && <p>Feuchteregelung deaktiviert – keine Feuchte-Referenzlinien.</p>}
        </div>
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
          <YAxis yAxisId="humidity" orientation="right" width={36} domain={["auto", "auto"]} tick={AXIS_TICK} tickFormatter={(value) => `${value}%`} hide={!showReferences} />
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
          {referenceLines.map(line => (
            <ReferenceLine
              key={line.key}
              yAxisId={line.axis}
              y={line.value}
              stroke={line.color}
              strokeWidth={1.5}
              strokeDasharray={line.dash}
              ifOverflow="extendDomain"
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
