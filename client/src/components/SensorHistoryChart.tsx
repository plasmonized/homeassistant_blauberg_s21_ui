import { useSensorHistory } from "@/hooks/use-sensor-history";
import { useRegisters } from "@/hooks/use-registers";
import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";

interface Props {
  deviceId: number;
}

// Colors and labels match TemperatureDiagram.tsx exactly
const TEMP_SERIES: Record<string, { label: string; color: string }> = {
  Outdoor: { label: "Außenluft", color: "#60a5fa" }, // blue-400
  Supply:  { label: "Zuluft",    color: "#4ade80" }, // green-400
  Extract: { label: "Abluft",    color: "#f87171" }, // red-400
  Exhaust: { label: "Fortluft",  color: "#fb923c" }, // orange-400
};
const FAN_COLOR = "#94a3b8";

function getSeriesInfo(regName: string): { label: string; color: string } {
  for (const [key, info] of Object.entries(TEMP_SERIES)) {
    if (regName.includes(key)) return info;
  }
  return { label: regName.replace(/^Temperature - /, ""), color: "#94a3b8" };
}

export function SensorHistoryChart({ deviceId }: Props) {
  const { data: history, isLoading: histLoading } = useSensorHistory(deviceId, 48);
  const { data: registers } = useRegisters(deviceId);

  // Identify which registers to show
  const tempRegs = useMemo(() =>
    (registers ?? []).filter(r =>
      (r.tags ?? []).includes("temperature") && r.lastValue !== null
    ).slice(0, 4),
    [registers]
  );
  const fanReg = useMemo(() =>
    (registers ?? []).find(r =>
      (r.tags ?? []).includes("fan") && r.isWritable
    ),
    [registers]
  );

  const relevantIds = useMemo(() => {
    const ids = new Set(tempRegs.map(r => r.id));
    if (fanReg) ids.add(fanReg.id);
    return ids;
  }, [tempRegs, fanReg]);

  // Pivot: { t, [regId]: value, ... }[]
  const chartData = useMemo(() => {
    if (!history) return [];
    const byTime = new Map<string, Record<string, number>>();
    for (const pt of history) {
      if (!relevantIds.has(pt.registerId)) continue;
      if (!byTime.has(pt.t)) byTime.set(pt.t, { t: pt.t } as any);
      byTime.get(pt.t)![`r_${pt.registerId}`] = pt.value;
    }
    return Array.from(byTime.values()).sort((a, b) =>
      (a.t as string).localeCompare(b.t as string)
    );
  }, [history, relevantIds]);

  const formatTick = (iso: string) => {
    try {
      return format(parseISO(iso), "HH:mm", { locale: de });
    } catch {
      return iso;
    }
  };

  const formatTooltipLabel = (iso: string) => {
    try {
      return format(parseISO(iso), "EEE, dd.MM. HH:mm", { locale: de });
    } catch {
      return iso;
    }
  };

  if (histLoading) {
    return <Skeleton className="h-56 w-full rounded-xl" />;
  }

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-40 text-muted-foreground text-sm rounded-xl border border-dashed border-border/40">
        <TrendingUp className="w-5 h-5 opacity-40" />
        <span>Noch keine Verlaufsdaten – Messungen starten nach ca. 5 Minuten.</span>
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="sensor-history-chart">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/40)" />
          <XAxis
            dataKey="t"
            tickFormatter={formatTick}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            minTickGap={40}
          />
          <YAxis
            yAxisId="temp"
            unit="°C"
            width={46}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            domain={["auto", "auto"]}
          />
          {fanReg && (
            <YAxis
              yAxisId="fan"
              orientation="right"
              domain={[0.5, 3.5]}
              ticks={[1, 2, 3]}
              width={28}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
          )}
          <Tooltip
            labelFormatter={formatTooltipLabel}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: 12,
            }}
            formatter={(val: number, name: string) => {
              const isTemp = !name.includes("Lüfterstufe");
              return [`${val}${isTemp ? " °C" : ""}`, name];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(val) => <span style={{ color: "hsl(var(--muted-foreground))" }}>{val}</span>}
          />
          {tempRegs.map((reg) => {
            const { label, color } = getSeriesInfo(reg.name);
            return (
              <Line
                key={reg.id}
                yAxisId="temp"
                type="monotone"
                dataKey={`r_${reg.id}`}
                name={label}
                stroke={color}
                dot={false}
                strokeWidth={1.5}
                connectNulls={false}
              />
            );
          })}
          {fanReg && (
            <Line
              yAxisId="fan"
              type="stepAfter"
              dataKey={`r_${fanReg.id}`}
              name="Lüfterstufe"
              stroke={FAN_COLOR}
              dot={false}
              strokeWidth={1.5}
              strokeDasharray="4 2"
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
