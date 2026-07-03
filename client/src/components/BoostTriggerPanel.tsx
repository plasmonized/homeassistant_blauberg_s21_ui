import { useState } from "react";
import {
  useAutomationRules,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
} from "@/hooks/use-automation";
import { useExternalSensors } from "@/hooks/use-external-sensors";
import { type AutomationRule, type ExternalSensor } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Timer, Zap } from "lucide-react";

function isRuleActive(rule: AutomationRule): boolean {
  return !!rule.activeUntil && new Date(rule.activeUntil).getTime() > Date.now();
}

export function BoostTriggerPanel({ deviceId }: { deviceId: number }) {
  const { data: rules, isLoading } = useAutomationRules(deviceId);
  const { data: sensors } = useExternalSensors(deviceId);
  const createRule = useCreateRule(deviceId);
  const updateRule = useUpdateRule(deviceId);
  const deleteRule = useDeleteRule(deviceId);

  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [externalSensorId, setExternalSensorId] = useState<string>("");
  const [duration, setDuration] = useState("15");

  const binarySensors: ExternalSensor[] = (sensors ?? []).filter(
    (s: ExternalSensor) => s.sensorType === "binary"
  );

  const boostTriggers: AutomationRule[] = (rules ?? []).filter(
    (r: AutomationRule) => r.actionType === "boost" && !!r.actionDurationMinutes
  );

  const resetForm = () => {
    setName("");
    setExternalSensorId("");
    setDuration("15");
  };

  const handleCreate = () => {
    const sensorId = Number(externalSensorId);
    const durationMinutes = Number(duration);
    if (!name.trim() || !sensorId || !durationMinutes || durationMinutes <= 0) return;

    createRule.mutate(
      {
        deviceId,
        name: name.trim(),
        enabled: true,
        season: "all",
        sensorType: "binary",
        operator: "eq",
        threshold: 1,
        actionType: "boost",
        actionValue: 1,
        actionDurationMinutes: durationMinutes,
        externalSensorId: sensorId,
        timeFrom: null,
        timeTo: null,
        hysteresis: 0,
      } as any,
      {
        onSuccess: () => {
          setIsOpen(false);
          resetForm();
        },
      }
    );
  };

  const sensorLabel = (sensorId: number | null) => {
    const sensor = (sensors ?? []).find((s: ExternalSensor) => s.id === sensorId);
    return sensor ? sensor.name : "Unbekannter Sensor";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Zap className="w-4 h-4" /> Boost-Automatisierung
          </h3>
          <p className="text-sm text-muted-foreground">
            Aktiviert Boost für eine festgelegte Dauer, sobald ein Home Assistant
            Sensor (z.B. Fenster, Bewegung, Präsenz) einschaltet
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-boost-trigger">
              <Plus className="w-4 h-4 mr-1" /> Trigger hinzufügen
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Boost-Trigger hinzufügen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="boost-trigger-name">Name</Label>
                <Input
                  id="boost-trigger-name"
                  placeholder="z.B. Boost bei offenem Fenster"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-boost-trigger-name"
                />
              </div>

              <div className="space-y-2">
                <Label>Home Assistant Sensor (binär)</Label>
                {binarySensors.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Kein binärer Sensor gefunden. Füge zuerst unter "Externe Sensoren"
                    einen Home-Assistant-Sensor vom Typ "Binär" hinzu (z.B. ein
                    binary_sensor für Fenster oder Bewegung).
                  </p>
                ) : (
                  <Select value={externalSensorId} onValueChange={setExternalSensorId}>
                    <SelectTrigger data-testid="select-boost-trigger-sensor">
                      <SelectValue placeholder="Sensor auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {binarySensors.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name} {s.entityId ? `(${s.entityId})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="boost-trigger-duration">Dauer (Minuten)</Label>
                <Input
                  id="boost-trigger-duration"
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  data-testid="input-boost-trigger-duration"
                />
                <p className="text-xs text-muted-foreground">
                  Boost bleibt für diese Dauer aktiv, sobald der Sensor "ein" meldet,
                  und schaltet danach automatisch wieder ab.
                </p>
              </div>

              <Button
                onClick={handleCreate}
                disabled={
                  createRule.isPending ||
                  !name.trim() ||
                  !externalSensorId ||
                  !duration ||
                  Number(duration) <= 0
                }
                className="w-full"
                data-testid="button-create-boost-trigger"
              >
                <Plus className="w-4 h-4 mr-1" />
                {createRule.isPending ? "Speichern..." : "Speichern"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
        </div>
      ) : boostTriggers.length > 0 ? (
        <div className="space-y-2">
          {boostTriggers.map((rule) => {
            const active = isRuleActive(rule);
            return (
              <Card key={rule.id} className="p-4" data-testid={`card-boost-trigger-${rule.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-muted shrink-0">
                      <Timer className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{rule.name}</span>
                        <Badge variant={active ? "default" : "outline"} className="text-xs shrink-0">
                          {active
                            ? `Aktiv bis ${new Date(rule.activeUntil!).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`
                            : "Inaktiv"}
                        </Badge>
                        {!rule.enabled && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            Deaktiviert
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Sensor: {sensorLabel(rule.externalSensorId)} · Dauer: {rule.actionDurationMinutes} min
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={!!rule.enabled}
                      onCheckedChange={(checked) =>
                        updateRule.mutate({ id: rule.id, data: { enabled: checked } })
                      }
                      data-testid={`switch-boost-trigger-${rule.id}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => deleteRule.mutate(rule.id)}
                      disabled={deleteRule.isPending}
                      data-testid={`button-delete-boost-trigger-${rule.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-10 border border-dashed rounded-xl opacity-60">
          <Zap className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm">Keine Boost-Trigger konfiguriert</p>
          <p className="text-xs text-muted-foreground mt-1">
            Lass Boost automatisch starten, wenn ein Home Assistant Sensor einschaltet
          </p>
        </div>
      )}
    </div>
  );
}
