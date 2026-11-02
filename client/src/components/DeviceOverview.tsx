import { AlertCircle, Check, CircleHelp, Fan, Filter, Radio, ShieldAlert, Wifi } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ControlProfile, Device, Register } from "@shared/schema";
import type { ControlDecision } from "@shared/control-decision";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { deriveDeviceOverviewStatus } from "@/lib/device-overview-status";
import { presentControlDecision } from "@/lib/control-decision-presentation";
import { useControlDecision } from "@/hooks/use-control-decision";
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
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    // Also age cached evaluations when network failures prevent query updates.
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  const status = deriveDeviceOverviewStatus(registers, Boolean(device.isConnected));
  const hasFilterAlert = status.filter.condition === "blocked";
  const decisionQuery = useControlDecision(device.id);
  const decision = decisionQuery.data?.decision ?? null;
  const decisionPresentation = presentControlDecision(
    decision,
    decisionQuery.data?.staleAfterMs ?? 90_000,
    now,
    Boolean(device.isConnected),
    status,
  );

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

            <DecisionSummary
              decision={decision}
              presentation={decisionPresentation}
              isLoading={decisionQuery.isLoading}
              isError={decisionQuery.isError}
            />

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

function DecisionSummary({
  decision,
  presentation,
  isLoading,
  isError,
}: {
  decision: ControlDecision | null;
  presentation: ReturnType<typeof presentControlDecision>;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <div className="mt-3 rounded-lg border border-primary/15 bg-primary/[0.035] px-3 py-2.5" data-testid="overview-control-decision">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Warum diese Lüfterstufe?
        </p>
        {presentation?.evaluatedAt && (
          <span className="text-[10px] text-muted-foreground">
            {presentation.historicalReason ? "Letzte Auswertung" : "Auswertung"} · {presentation.evaluatedAt}
          </span>
        )}
      </div>

      {isError && decision && (
        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
          Aktualisierung fehlgeschlagen – zuletzt geladene Auswertung. Erneuter Versuch erfolgt automatisch.
        </p>
      )}
      {isLoading && !decision ? (
        <div className="mt-2 space-y-1.5">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : isError && !decision ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Regelauswertung derzeit nicht abrufbar. Ein Grund für den aktuellen Zustand liegt nicht vor.
        </p>
      ) : !decision || !presentation ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Noch keine aktuelle Regelauswertung verfügbar; ein Grund für den aktuellen Zustand ist nicht bekannt.
        </p>
      ) : (
        <DecisionDetails decision={decision} presentation={presentation} />
      )}
    </div>
  );
}

function DecisionDetails({
  decision,
  presentation,
}: {
  decision: ControlDecision;
  presentation: NonNullable<ReturnType<typeof presentControlDecision>>;
}) {
  const historicalLabels = {
    failed: "Letzte Regelauswertung fehlgeschlagen – sie erklärt den aktuellen Zustand nicht.",
    offline: "Anlage offline – diese Auswertung ist nicht als aktueller Zustand bestätigt.",
    "invalid-date": "Zeitpunkt ungültig – diese Auswertung ist nicht als aktuell bestätigt.",
    stale: "Auswertung veraltet – sie erklärt den aktuellen Zustand nicht.",
  };
  const outcomeLabels = {
    unchanged: "Regelung hat den bisherigen Ausgang beibehalten.",
    held: "Regelung hält den Ausgang.",
    applied: "Regelung hat den Ausgang gesetzt.",
    failed: "Ausgang konnte nicht gesetzt werden.",
  };
  const isStandby = decision.actionType === "standby";
  const requestedOutput = isStandby ? "Standby" : `Stufe ${decision.requestedValue}`;
  const effectiveOutput = decision.effectiveValue === null
    ? requestedOutput
    : isStandby ? "Standby" : `Stufe ${decision.effectiveValue}`;
  const proposedOutput = decision.outcome === "failed"
    ? `Angefordert: ${requestedOutput}`
    : `Ausgang: ${effectiveOutput}`;
  const isHistorical = presentation.historicalReason !== null;
  const retentionDetail = (decision.outcome === "held" || decision.outcome === "unchanged")
    ? decision.detail : null;

  return (
    <>
      {isHistorical ? (
        <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
          {historicalLabels[presentation.historicalReason!]}
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs font-medium text-foreground">
            {decision.reason || "Für diese Auswertung wurde kein Grundtext hinterlegt."}
          </p>
          <p className={`mt-1 text-[11px] ${retentionDetail ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>
            {outcomeLabels[decision.outcome]}
            {retentionDetail ? ` ${retentionDetail}` : ""}
          </p>
          {presentation.actualMismatch === true && (
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
              Controller-Ausgabe {proposedOutput} weicht vom Registerstand ab. Ursache oder Rückmeldung nicht bestätigt.
            </p>
          )}
          {presentation.actualMismatch === null && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Rückmeldung der Anlage unvollständig – der Regelungsausgang ist noch nicht bestätigt.
            </p>
          )}
        </>
      )}
      {isHistorical && (
        <p className="mt-1 text-xs text-muted-foreground">
          {decision.reason || "Für diese Auswertung wurde kein Grundtext hinterlegt."}
          {" "}{proposedOutput}. {decision.detail ?? ""}
        </p>
      )}
      {!isHistorical && decision.outcome === "failed" && decision.detail && (
        <p className="mt-1 text-[11px] text-muted-foreground">{decision.detail}</p>
      )}
      <p className="mt-1 text-[10px] text-muted-foreground">
        {decision.profileName}
      </p>
    </>
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
