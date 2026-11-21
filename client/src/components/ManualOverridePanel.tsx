import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Clock3, RotateCcw } from "lucide-react";
import type { ManualOverrideStatus } from "@shared/manual-override";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useManualOverride } from "@/hooks/use-manual-override";

type ManualOverrideControls = ReturnType<typeof useManualOverride>;

interface ManualOverridePanelProps {
  override: ManualOverrideControls;
  now: number;
  isDeviceConnected: boolean;
  actualFanStage: string | null;
}

const sourceLabels: Record<NonNullable<ManualOverrideStatus["source"]>, string> = {
  app: "App",
  mqtt: "MQTT",
  console: "Konsole",
};

const boostSourceLabels: Record<NonNullable<ManualOverrideStatus["boostSource"]>, string> = {
  hardware: "Hardware-Boost",
  rule: "Regel-Boost",
  app: "App-Boost",
};

function formatDeadline(timestamp: number): string {
  return new Date(timestamp).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function remainingMinutes(until: number, now: number): number | null {
  return until > now ? Math.ceil((until - now) / 60_000) : null;
}

function minutesLabel(minutes: number): string {
  return `${minutes} ${minutes === 1 ? "Minute" : "Minuten"}`;
}

export function ManualOverridePanel({
  override,
  now,
  isDeviceConnected,
  actualFanStage,
}: ManualOverridePanelProps) {
  const { query, configure, resume, boost, stopBoost } = override;
  const [duration, setDuration] = useState("30");
  const durationEdited = useRef(false);

  useEffect(() => {
    if (query.data && !durationEdited.current) {
      setDuration(String(query.data.durationMinutes));
    }
  }, [query.data?.durationMinutes]);

  const parsedDuration = Number(duration);
  const validDuration = Number.isInteger(parsedDuration) && parsedDuration >= 1 && parsedDuration <= 240;
  const status = query.data;
  const manualUntil = status?.manualUntil ?? null;
  const manualRemaining = manualUntil === null ? null : remainingMinutes(manualUntil, now);
  const manualWindowActive = manualRemaining !== null;
  const canResumeManual = manualUntil !== null && manualRemaining !== null;
  const boostUntil = status?.boostUntil ?? null;
  const boostRemaining = boostUntil === null ? null : remainingMinutes(boostUntil, now);
  const hardwareBoost = Boolean(status?.boost && status.boostSource === "hardware");
  const hardwareObservedAt = status?.boostObservedAt ?? null;
  const hardwareObservationAge = hardwareObservedAt === null ? null : now - hardwareObservedAt;
  const hardwareUnconfirmed = hardwareBoost && (
    hardwareObservationAge === null
    || hardwareObservationAge < 0
    || hardwareObservationAge > 90_000
  );
  const actualStageNumber = actualFanStage === null ? Number.NaN : Number.parseFloat(actualFanStage.trim());
  const appBoostStageConfirmed = isDeviceConnected && actualStageNumber === 3;
  const canStartBoost = Boolean(
    isDeviceConnected
    && status
    && !query.isError
    && hardwareObservationAge !== null && hardwareObservationAge >= 0 && hardwareObservationAge <= 90_000
    && !hardwareBoost
    && !(status.boost && status.boostSource === null)
    && validDuration
    && parsedDuration === status.durationMinutes
    && !boost.isPending,
  );

  function handleConfigure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validDuration) return;
    configure.reset();
    configure.mutate(parsedDuration, {
      onSuccess: () => {
        durationEdited.current = false;
      },
    });
  }

  function handleResume() {
    resume.reset();
    resume.mutate();
  }

  function handleStartBoost() {
    boost.reset();
    boost.mutate();
  }

  function handleStopBoost() {
    stopBoost.reset();
    stopBoost.mutate();
  }

  return (
    <section
      className="mt-3 rounded-lg border border-border/50 bg-background/55 px-3 py-3"
      aria-label="Manuelle Steuerung"
      data-testid="manual-override-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Manuelle Steuerung
          </p>
          <h3 className="mt-0.5 text-sm font-semibold">Eingriff und Boost</h3>
        </div>
        {status?.boost && (
          <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
            {status.boostSource ? `${boostSourceLabels[status.boostSource]} aktiv` : "Boost-Quelle unbekannt"}
          </span>
        )}
      </div>

      {query.isLoading && !status ? (
        <div className="mt-3 space-y-2" aria-label="Status wird geladen">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : query.isError && !status ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5" role="alert">
          <p className="text-xs font-medium">Status der manuellen Steuerung konnte nicht geladen werden.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-8"
            onClick={() => void query.refetch()}
          >
            Erneut versuchen
          </Button>
        </div>
      ) : (
        <>
          {query.isError && status && (
            <p className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-300" role="status">
              Aktualisierung fehlgeschlagen – der angezeigte Status ist nicht bestätigt.
            </p>
          )}

          {status?.boost ? (
            <div className="mt-2 rounded-md bg-muted/45 px-3 py-2">
              {status.boostSource === "hardware" ? (
                <>
                  <p className="text-xs font-medium">
                    Hardware-Boost hat Vorrang. Er endet ausschließlich an der Anlage oder mit deren Timer;
                    diese Funktion kann ihn nicht abbrechen.
                  </p>
                  {hardwareUnconfirmed && (
                    <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300" role="status">
                      Hardware-Status nicht bestätigt
                      {hardwareObservationAge !== null && hardwareObservationAge >= 0
                        ? ` – letzte Beobachtung vor ${Math.floor(hardwareObservationAge / 60_000)} Min.`
                        : " – keine gültige Beobachtungszeit verfügbar"}.
                      {hardwareObservationAge !== null && hardwareObservationAge > 90_000
                        ? " Die letzte Beobachtung liegt mehr als 90 Sekunden zurück."
                        : " Es gibt keine gültige Beobachtung innerhalb der letzten 90 Sekunden."}
                    </p>
                  )}
                </>
              ) : status.boostSource === "rule" ? (
                <p className="text-xs font-medium">
                  Regel-/Automations-Boost hat Vorrang vor dem manuellen Zeitfenster und endet durch die Regel
                  oder deren Timer, nicht durch diese App.
                </p>
              ) : status.boostSource === "app" ? (
                <div>
                  <p className="text-xs font-medium">
                    App-Boost aktiv · Sollstufe 3
                    {boostUntil !== null && boostRemaining !== null
                      ? ` · noch etwa ${minutesLabel(boostRemaining)}`
                      : boostUntil !== null
                        ? " · App-Timer abgelaufen; Status wird aktualisiert"
                        : " · Endzeitpunkt nicht bestätigt"}
                  </p>
                  {boostUntil !== null && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      App-Timer {boostRemaining === null ? "abgelaufen" : "endet"} am {formatDeadline(boostUntil)}.
                    </p>
                  )}
                  <p className={`mt-1 text-[11px] ${appBoostStageConfirmed ? "text-muted-foreground" : "font-medium text-amber-700 dark:text-amber-300"}`}>
                    {appBoostStageConfirmed
                      ? "Anlagenregister meldet Stufe 3."
                      : `Stufe 3 nicht bestätigt${actualFanStage ? ` (Registerstand: ${actualFanStage}${isDeviceConnected ? "" : ", letzter bekannter Stand"})` : " (keine aktuelle Lüfterstufe verfügbar)"}.`}
                  </p>
                </div>
              ) : (
                <p className="text-xs font-medium">
                  Boost aktiv, Quelle unbekannt. Ein Abbruch über diese App wird nicht angeboten.
                </p>
              )}

              {status.boostSource === "app" && (
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={stopBoost.isPending}
                    onClick={handleStopBoost}
                  >
                    {stopBoost.isPending ? "App-Boost wird beendet …" : "Boost beenden"}
                  </Button>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Beendet nur den App-Timer, keinen Hardware- oder Regel-Boost.
                  </p>
                </div>
              )}
            </div>
          ) : status ? (
            <div className="mt-2 rounded-md bg-muted/45 px-3 py-2">
              {manualWindowActive ? (
                <>
                  <p className="text-xs font-medium">
                    Manueller Eingriff aktiv · Quelle: {status.source ? sourceLabels[status.source] : "unbekannt"}
                    {status.manualStage !== null && ` · Stufe ${status.manualStage}`}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {manualRemaining === null
                      ? "Verbleibende Zeit nicht bekannt."
                      : `Noch etwa ${minutesLabel(manualRemaining)}.`}
                  </p>
                  {(!isDeviceConnected || actualStageNumber !== status.manualStage) && (
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300" role="status">
                      Die angeforderte manuelle Stufe ist am Gerät noch nicht bestätigt.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Kein aktives manuelles Zeitfenster. Die Automatik regelt wieder.
                </p>
              )}
            </div>
          ) : null}

          {status?.boost && (manualWindowActive || canResumeManual) && (
            <div className="mt-2 rounded-md border border-border/45 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Nachrangiges manuelles Zeitfenster
              </p>
              {manualWindowActive ? (
                <>
                  <p className="mt-1 text-xs font-medium">
                    Quelle: {status.source ? sourceLabels[status.source] : "unbekannt"}
                    {status.manualStage !== null && ` · Stufe ${status.manualStage}`}
                    {manualRemaining !== null && ` · noch etwa ${minutesLabel(manualRemaining)}`}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Kein aktives manuelles Zeitfenster.
                </p>
              )}
            </div>
          )}

          {manualUntil !== null && (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock3 className="h-3 w-3 shrink-0" />
              Gespeichertes manuelles Zeitfenster {manualRemaining === null ? "abgelaufen" : "endet"} am{" "}
              {formatDeadline(manualUntil)}.
            </p>
          )}
          {!isDeviceConnected && (manualUntil !== null || (status?.boostSource === "app" && boostUntil !== null)) && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Gespeicherte Endzeitpunkte laufen auch ohne Anlagenverbindung weiter.
            </p>
          )}
        </>
      )}

      <form className="mt-3 border-t border-border/45 pt-3" onSubmit={handleConfigure}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor="manual-override-duration" className="text-[11px]">
              Dauer für den nächsten Eingriff (Minuten)
            </Label>
            <Input
              id="manual-override-duration"
              type="number"
              min={1}
              max={240}
              step={1}
              inputMode="numeric"
              value={duration}
              onChange={(event) => {
                durationEdited.current = true;
                setDuration(event.target.value);
              }}
              aria-invalid={!validDuration}
              aria-describedby="manual-override-duration-help"
              className="mt-1 h-9"
            />
            {duration !== "" && !validDuration && (
              <p className="mt-1 text-[10px] text-destructive" role="alert">
                Bitte eine ganze Zahl zwischen 1 und 240 eingeben.
              </p>
            )}
            <p id="manual-override-duration-help" className="mt-1 text-[10px] text-muted-foreground">
              1 bis 240 Minuten. Gilt für den nächsten manuellen Eingriff und einen neu gestarteten App-Boost;
              laufende Zeitfenster bleiben unverändert.
            </p>
          </div>
          <Button type="submit" size="sm" className="h-9 shrink-0" disabled={!validDuration || configure.isPending}>
            {configure.isPending ? "Wird gespeichert …" : "Dauer speichern"}
          </Button>
        </div>
      </form>

      {configure.isError && (
        <Alert variant="destructive" className="mt-2 py-2" role="alert">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Dauer konnte nicht gespeichert werden. Bitte erneut versuchen.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={!canStartBoost}
          onClick={handleStartBoost}
        >
          {boost.isPending ? "Boost wird gestartet …" : "Boost starten"}
        </Button>
        <p className="text-[10px] text-muted-foreground">
          Startet sofort Stufe 3 für die gespeicherte Dauer. Geänderte Dauer bitte zuerst speichern.
          Bei Geräte-Boost, unbekanntem Status oder Offline-Anlage nicht verfügbar.
        </p>
      </div>

      {boost.isError && (
        <Alert variant="destructive" className="mt-2 py-2" role="alert">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            App-Boost konnte nicht gestartet werden. Bitte erneut versuchen.
          </AlertDescription>
        </Alert>
      )}
      {stopBoost.isError && (
        <Alert variant="destructive" className="mt-2 py-2" role="alert">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            App-Boost konnte nicht beendet werden. Bitte erneut versuchen.
          </AlertDescription>
        </Alert>
      )}

      {canResumeManual && (
        <div className="mt-2 border-t border-border/45 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={resume.isPending}
            onClick={handleResume}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {resume.isPending ? "Automatik wird fortgesetzt …" : "Automatik fortsetzen"}
          </Button>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Löscht nur das manuelle Zeitfenster, nicht einen Hardware-, Regel- oder App-Boost.
          </p>
        </div>
      )}

      {resume.isError && (
        <Alert variant="destructive" className="mt-2 py-2" role="alert">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Automatik konnte nicht fortgesetzt werden. Bitte erneut versuchen.
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
