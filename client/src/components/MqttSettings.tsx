import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Check, Radio, RotateCcw, Save } from "lucide-react";

type MqttSettingsData = {
  host: string;
  port: number;
  username: string;
  enabled: boolean;
  tls: boolean;
  hasPassword: boolean;
  source: "ui" | "addon";
  connected: boolean;
  lastError: string | null;
};

const emptySettings: MqttSettingsData = {
  host: "", port: 1883, username: "", enabled: false, tls: false,
  hasPassword: false, source: "addon", connected: false, lastError: null,
};

export function MqttSettings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptySettings);
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery<MqttSettingsData>({
    queryKey: ["/api/mqtt/settings"],
    queryFn: async () => (await apiRequest("GET", "/api/mqtt/settings")).json(),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (data && !dirty) setForm(data);
  }, [data, dirty]);

  const change = (updates: Partial<MqttSettingsData>) => {
    setDirty(true);
    setFeedback("");
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setFeedback("");
    const body: Record<string, unknown> = {
      host: form.host,
      port: Number(form.port),
      username: form.username,
      enabled: form.enabled,
      tls: form.tls,
      ...(password ? { password } : {}),
      ...(clearPassword ? { clearPassword: true } : {}),
    };
    try {
      const result = await (await apiRequest("PUT", "/api/mqtt/settings", body)).json() as MqttSettingsData;
      setForm(result);
      setPassword("");
      setClearPassword(false);
      setDirty(false);
      setFeedback(!result.enabled ? "MQTT gespeichert und deaktiviert."
        : result.connected ? "MQTT gespeichert. Broker verbunden."
        : "MQTT gespeichert. Verbindung noch nicht hergestellt; automatische Wiederholung läuft.");
      queryClient.setQueryData(["/api/mqtt/settings"], result);
      await queryClient.invalidateQueries({ queryKey: ["/api/status"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Einstellungen konnten nicht gespeichert werden.");
    } finally { setSaving(false); }
  };

  const reset = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    setFeedback("");
    try {
      const result = await (await apiRequest("POST", "/api/mqtt/reset")).json() as MqttSettingsData;
      setForm(result);
      setPassword("");
      setClearPassword(false);
      setDirty(false);
      setFeedback("Override zurückgesetzt. Es gelten wieder die Add-on-Standards.");
      queryClient.setQueryData(["/api/mqtt/settings"], result);
      await queryClient.invalidateQueries({ queryKey: ["/api/status"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zurücksetzen fehlgeschlagen.");
    } finally { setSaving(false); }
  };

  if (isLoading) return <Card><CardContent className="p-5 space-y-3"><div className="h-5 w-40 animate-pulse rounded bg-muted" /><div className="h-10 animate-pulse rounded bg-muted" /><div className="h-10 animate-pulse rounded bg-muted" /></CardContent></Card>;
  if (isError && !data) return <Card><CardContent className="p-5 flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">MQTT-Einstellungen konnten nicht geladen werden.</span><Button variant="outline" size="sm" onClick={() => refetch()}>Erneut versuchen</Button></CardContent></Card>;

  const connected = data?.connected ?? form.connected;
  const lastError = data ? data.lastError : form.lastError;
  return <Card className="border-border/50">
    <CardContent className="p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary"><Radio className="h-4 w-4" /></div>
          <div>
            <h3 className="font-semibold">MQTT-Verbindung</h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">Die Home Assistant MQTT-Integration muss auf denselben Broker zeigen. Entitäten werden automatisch erkannt. Manuelle Änderungen in Home Assistant können durch die Automatisierung überschrieben werden.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={connected ? "success" : "secondary"} className="gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-500" : "bg-muted-foreground"}`} />
            {connected ? "Verbunden" : "Getrennt"}
          </Badge>
          <Badge variant="outline">{(data?.source ?? form.source) === "ui" ? "Eigene Einstellungen" : "Add-on-Standard"}</Badge>
        </div>
      </div>

      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 lg:col-span-2"><Label htmlFor="mqtt-host">Broker-Adresse</Label><Input id="mqtt-host" value={form.host} onChange={(e) => change({ host: e.target.value })} placeholder="core-mosquitto" /></div>
          <div className="space-y-1.5"><Label htmlFor="mqtt-port">Port</Label><Input id="mqtt-port" type="number" min={1} max={65535} value={form.port} onChange={(e) => change({ port: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label htmlFor="mqtt-username">Benutzername</Label><Input id="mqtt-username" value={form.username} onChange={(e) => change({ username: e.target.value })} autoComplete="username" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="mqtt-password">Passwort</Label><Input id="mqtt-password" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setClearPassword(false); setDirty(true); }} placeholder={form.hasPassword ? "Gespeichertes Passwort vorhanden – leer lassen zum Beibehalten" : "Optional"} autoComplete="new-password" /></div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 pb-1">
            <div className="flex items-center gap-2"><Switch checked={form.enabled} onCheckedChange={(enabled) => change({ enabled })} id="mqtt-enabled" /><Label htmlFor="mqtt-enabled">Aktiviert</Label></div>
            <div className="flex items-center gap-2"><Switch checked={form.tls} onCheckedChange={(tls) => change({ tls })} id="mqtt-tls" /><Label htmlFor="mqtt-tls">TLS</Label></div>
          </div>
        </div>
        {form.hasPassword && <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={clearPassword} onChange={(e) => { setClearPassword(e.target.checked); setDirty(true); if (e.target.checked) setPassword(""); }} />
          Gespeichertes Passwort beim Speichern löschen
        </label>}
        {lastError && <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{lastError}</div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {feedback && <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-400"><Check className="h-4 w-4" />{feedback}</p>}
        <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
          <Button type="submit" disabled={!dirty || (form.enabled && !form.host) || saving}><Save className="mr-2 h-4 w-4" />{saving ? "Wird gespeichert …" : "Einstellungen speichern"}</Button>
          <Button type="button" variant="outline" disabled={saving} onClick={reset}><RotateCcw className="mr-2 h-4 w-4" />Auf Add-on-Standard zurücksetzen</Button>
          {dirty && <Button type="button" variant="ghost" onClick={() => { setForm(data || emptySettings); setPassword(""); setClearPassword(false); setDirty(false); setError(""); }}>Änderungen verwerfen</Button>}
        </div>
      </form>
    </CardContent>
  </Card>;
}
