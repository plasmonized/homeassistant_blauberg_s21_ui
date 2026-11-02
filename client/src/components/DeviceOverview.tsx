import { AlertCircle, Check, CircleHelp, Fan, Filter, Radio, ShieldAlert, Wifi } from "lucide-react";
import type { ReactNode } from "react";
import type { ControlProfile, Device, Register } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { deriveDeviceOverviewStatus } from "@/lib/device-overview-status";
import { TemperatureDiagram } from "@/components/TemperatureDiagram";

interface DeviceOverviewProps {
  device: Device;
  registers: Register[] | undefined;
  isLoading: boolean;
  mqttConnected?: boolean;
  activeBase?: ControlProfile;
  activeProfiles: ControlProfile[];
}

export function DeviceOverview({
  device,
  registers,
  isLoading,
  mqttConnected,
  activeBase,
  activeProfiles,
}: DeviceOverviewProps) {
  const status = deriveDeviceOverviewStatus(registers, Boolean(device.isConnected));
  const hasFilterAlert = status.filter.condition === "blocked";

  return (
    <section
      className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-stretch"
      data-testid="device-overview"
      aria-label="Anlagenübersicht"
    >
      <div className="flex min-w-0 flex-col gap-3" data-testid="overview-alerts">
        {!device.isConnected && (
          <div
            className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3"
            role="alert"
            data-testid="overview-alert-offline"
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-destructive">Anlage nicht erreichbar</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Registerwerte sind der zuletzt bekannte Stand, nicht der aktuelle Anlagenzustand.
              </p>
            </div>
          </div>
        )}

        {hasFilterAlert && (
          <div
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
              status.dataIsLastKnown
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-amber-500/50 bg-amber-500/10"
            }`}
            role="status"
            data-testid="overview-alert-filter"
          >
            <Filter className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                {status.dataIsLastKnown ? "Letzte Filtermeldung" : "Filtermeldung"}
              </p>
              <p className="mt-0.5 text-sm text-foreground">{status.filter.label}</p>
            </div>
          </div>
        )}

        <Card className="min-w-0 flex-1 border-border/40 bg-card/60">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Fan className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Anlagenstatus</p>
                  <p className="text-sm font-semibold">
                    {status.dataIsLastKnown ? "Letzter bekannter Stand" : "Live-Register"}
                  </p>
                </div>
              </div>
              <Badge variant={device.isConnected ? "success" : "destructive"} className="shrink-0">
                {device.isConnected ? "Verbunden" : "Offline"}
              </Badge>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-[68px]" />
                <Skeleton className="h-[68px]" />
                <Skeleton className="h-[68px]" />
                <Skeleton className="h-[68px]" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <StatusValue label="Lüfterstufe" value={status.fanLevel ?? "Keine Daten"} icon={<Fan className="h-3.5 w-3.5" />} />
                <StatusValue label="Modus" value={status.mode ?? "Keine Daten"} />
                <StatusValue
                  label="Betrieb"
                  value={status.power === null ? "Keine Daten" : status.power === "on" ? "Ein" : "Aus"}
                  icon={status.power === null ? <CircleHelp className="h-3.5 w-3.5" /> : undefined}
                />
                <StatusValue
                  label="Filter"
                  value={status.filter.condition === "unknown" ? "Keine Daten" : status.filter.condition === "ok" ? "Ohne Meldung" : "Meldung"}
                  tone={status.filter.condition === "blocked" ? "warning" : "default"}
                  icon={status.filter.condition === "blocked" ? <AlertCircle className="h-3.5 w-3.5" /> : status.filter.condition === "ok" ? <Check className="h-3.5 w-3.5" /> : undefined}
                />
              </div>
            )}

            <div className="mt-3 grid gap-2 border-t border-border/50 pt-3 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Grundprofil</p>
                <p className="truncate text-sm" title={activeBase?.name}>
                  {activeBase?.name ?? "Kein aktives Grundprofil"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Aktive Regelungen</p>
                <p className="truncate text-sm" title={activeProfiles.map((profile) => profile.name).join(", ")}>
                  {activeProfiles.length ? activeProfiles.map((profile) => profile.name).join(", ") : "Keine"}
                </p>
              </div>
            </div>

            {status.filter.condition === "unknown" && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Filterzustand unbekannt; es liegt kein auswertbarer Filterwert vor.
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Wifi className={`h-3.5 w-3.5 ${device.isConnected ? "text-emerald-500" : "text-destructive"}`} />
                S21 {device.isConnected ? "verbunden" : "nicht erreichbar"}
              </span>
              {mqttConnected !== undefined && (
                <span className="inline-flex items-center gap-1.5" title="MQTT ist für den physischen Anlagenzustand nicht maßgeblich">
                  <Radio className="h-3.5 w-3.5" />
                  MQTT {mqttConnected ? "verbunden" : "nicht verbunden"}
                  {!mqttConnected && <span className="text-muted-foreground/70">(optional)</span>}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 lg:flex lg:items-center">
        <TemperatureDiagram registers={registers} isLoading={isLoading} />
      </div>
    </section>
  );
}

function StatusValue({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: "default" | "warning";
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/40 bg-background/45 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 flex min-w-0 items-center gap-1.5 text-sm font-semibold ${tone === "warning" ? "text-amber-600 dark:text-amber-400" : ""}`}>
        {icon}
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}
