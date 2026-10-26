import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Device } from "@shared/schema";
import type { DeviceConnection } from "@shared/device-connection";
import { useSaveDeviceConnection, useTestDeviceConnection } from "@/hooks/use-device-connection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Check, Network, RotateCcw, Save, Signal, SignalZero } from "lucide-react";

type Props = { device: Device; deviceId: number };
type Feedback = { kind: "test" | "saved" | "restored"; success: boolean; message: string };

const connectionFrom = (device: Device): DeviceConnection => ({
  ip: device.ip,
  port: device.port,
  slaveId: device.slaveId,
});

export function DeviceConnectionSettings({ device, deviceId }: Props) {
  const [draft, setDraft] = useState<DeviceConnection>(() => connectionFrom(device));
  const [savedConnection, setSavedConnection] = useState<DeviceConnection>(() => connectionFrom(device));
  const [previousConnection, setPreviousConnection] = useState<DeviceConnection | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState("");
  const initializedId = useRef<number | null>(null);
  const testConnection = useTestDeviceConnection(deviceId);
  const saveConnection = useSaveDeviceConnection(deviceId);
  const busy = testConnection.isPending || saveConnection.isPending;
  const isDirty = draft.ip !== savedConnection.ip || draft.port !== savedConnection.port || draft.slaveId !== savedConnection.slaveId;

  // Polling refreshes the device every five seconds. Only initialize when this editor
  // is mounted for a new device; never overwrite a draft with background poll data.
  useEffect(() => {
    if (initializedId.current !== deviceId) {
      const initial = connectionFrom(device);
      initializedId.current = deviceId;
      setDraft(initial);
      setSavedConnection(initial);
      setPreviousConnection(null);
      setFeedback(null);
      setError("");
    }
  }, [deviceId, device]);

  const updateDraft = (update: Partial<DeviceConnection>) => {
    setDraft((current) => ({ ...current, ...update }));
    setFeedback(null);
    setError("");
  };

  const test = async () => {
    setError("");
    setFeedback(null);
    try {
      const result = await testConnection.mutateAsync(draft);
      setFeedback({ kind: "test", ...result });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verbindungstest fehlgeschlagen.");
    }
  };

  const save = async (event?: FormEvent, restore = false) => {
    event?.preventDefault();
    if (busy) return;
    const target = restore && previousConnection ? previousConnection : draft;
    setError("");
    setFeedback(null);
    try {
      const result = await saveConnection.mutateAsync(target);
      const nextSaved = connectionFrom(result.device);
      setPreviousConnection(savedConnection);
      setSavedConnection(nextSaved);
      setDraft(nextSaved);
      setFeedback({
        kind: restore ? "restored" : "saved",
        success: result.connection.success,
        message: result.connection.message,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verbindungseinstellungen konnten nicht gespeichert werden.");
    }
  };

  const discard = () => {
    setDraft(savedConnection);
    setFeedback(null);
    setError("");
  };

  return (
    <section id="device-connection-editor" className="scroll-mt-28">
      <Card className="border-primary/25 bg-card/80">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary"><Network className="h-4 w-4" /></div>
              <div>
                <h3 className="font-semibold">S21-Verbindung</h3>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Adresse und Modbus-Zugang dieser bestehenden Anlage ändern. Profile, Sensorbindungen, Register und Verlauf bleiben erhalten.
                </p>
              </div>
            </div>
            <Badge variant={device.isConnected ? "success" : "destructive"} className="gap-1.5">
              {device.isConnected ? <Signal className="h-3.5 w-3.5" /> : <SignalZero className="h-3.5 w-3.5" />}
              Gespeichert: {device.isConnected ? "verbunden" : "offline"}
            </Badge>
          </div>

          <form onSubmit={(event) => save(event)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="device-connection-ip">IP-Adresse oder Hostname</Label>
                <Input id="device-connection-ip" value={draft.ip} onChange={(event) => updateDraft({ ip: event.target.value })} placeholder="192.168.1.21" autoComplete="off" disabled={busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="device-connection-port">Port</Label>
                <Input id="device-connection-port" type="number" min={1} max={65535} step={1} value={draft.port} onChange={(event) => updateDraft({ port: Number(event.target.value) })} disabled={busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="device-connection-slave">Slave ID</Label>
                <Input id="device-connection-slave" type="number" min={0} max={247} step={1} value={draft.slaveId} onChange={(event) => updateDraft({ slaveId: Number(event.target.value) })} disabled={busy} />
              </div>
            </div>

            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              Eine neue Netzwerkadresse erfordert keine neue Anlage. Die bestehende Geräte-ID und alle zugehörigen Profile, Sensorbindungen und historischen Daten bleiben unverändert.
            </div>

            {feedback && (
              <div role="status" className={`flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm ${
                feedback.success
                  ? "border-emerald-700/40 bg-emerald-950/20 text-emerald-300"
                  : "border-amber-700/40 bg-amber-950/20 text-amber-200"
              }`}>
                {feedback.success ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>
                  {feedback.kind === "test"
                    ? `Verbindungstest ${feedback.success ? "erfolgreich" : "nicht erfolgreich"} — nicht gespeichert. `
                    : feedback.success
                      ? `${feedback.kind === "restored" ? "Vorherige Adresse gespeichert" : "Adresse gespeichert"} und Verbindung hergestellt. `
                      : `${feedback.kind === "restored" ? "Vorherige Adresse gespeichert" : "Adresse gespeichert"}, aber Anlage nicht erreichbar. Die neue Adresse bleibt gespeichert; es wurden keine Profile oder Verlaufsdaten gelöscht. `}
                  {feedback.message}
                </span>
              </div>
            )}
            {error && <p role="alert" className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}

            <div className="flex flex-col gap-2 border-t border-border/40 pt-4 sm:flex-row sm:flex-wrap">
              <Button type="button" variant="outline" disabled={busy} onClick={test}>
                <Signal className="mr-2 h-4 w-4" />{testConnection.isPending ? "Wird getestet …" : "Verbindung testen"}
              </Button>
              <Button type="submit" disabled={busy || !isDirty}>
                <Save className="mr-2 h-4 w-4" />{saveConnection.isPending ? "Wird gespeichert …" : "Speichern & neu verbinden"}
              </Button>
              <Button type="button" variant="ghost" disabled={busy || !isDirty} onClick={discard}>Änderungen verwerfen</Button>
              {previousConnection && (
                <Button type="button" variant="ghost" disabled={busy} onClick={() => save(undefined, true)}>
                  <RotateCcw className="mr-2 h-4 w-4" />Zur vorherigen Adresse
                </Button>
              )}
            </div>
            {previousConnection && <p className="text-xs text-muted-foreground">Vorherige Adresse nur für diese Sitzung vorgemerkt; sie wird erst nach Klick erneut gespeichert.</p>}
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
