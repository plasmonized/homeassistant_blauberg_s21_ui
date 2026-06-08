import { useState } from "react";
import { useAutomationRules, useAutomationLogs, useCreateRule, useUpdateRule, useDeleteRule } from "@/hooks/use-automation";
import { useExternalSensors } from "@/hooks/use-external-sensors";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, Trash2, Pencil, Bot, Clock, Thermometer, Droplets, Wind, History, Home } from "lucide-react";
import { ControlProfilesPanel } from "./ControlProfilesPanel";

interface AutomationPanelProps {
  deviceId: number;
}

const sensorOptions = [
  { value: "outdoor_temp", label: "Außentemperatur", icon: Thermometer },
  { value: "indoor_temp", label: "Innentemperatur", icon: Thermometer },
  { value: "humidity", label: "Luftfeuchtigkeit", icon: Droplets },
  { value: "co2", label: "CO₂", icon: Wind },
  { value: "forecast_temp", label: "Vorhersage-Temperatur", icon: Wind },
];

const operatorOptions = [
  { value: "gt", label: "> größer als" },
  { value: "lt", label: "< kleiner als" },
  { value: "gte", label: "≥ größer gleich" },
  { value: "lte", label: "≤ kleiner gleich" },
  { value: "eq", label: "= gleich" },
];

const actionOptions = [
  { value: "fan_speed", label: "Lüfterdrehzahl" },
  { value: "bypass", label: "Bypass" },
  { value: "mode", label: "Betriebsmodus" },
  { value: "boost", label: "Boost-Timer" },
  { value: "standby", label: "Standby" },
];

const seasonOptions = [
  { value: "summer", label: "Sommer (Mai-Sept)" },
  { value: "winter", label: "Winter (Okt-Apr)" },
  { value: "all", label: "Ganzjährig" },
];

export function AutomationPanel({ deviceId }: AutomationPanelProps) {
  const { data: rules, isLoading: rulesLoading } = useAutomationRules(deviceId);
  const { data: logs, isLoading: logsLoading } = useAutomationLogs(deviceId);
  const { data: externalSensors } = useExternalSensors(deviceId);
  const createRule = useCreateRule(deviceId);
  const updateRule = useUpdateRule(deviceId);
  const deleteRule = useDeleteRule(deviceId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);

  const [form, setForm] = useState({
    name: "",
    season: "all" as string,
    sensorType: "outdoor_temp" as string,
    externalSensorId: null as number | null,
    operator: "gt" as string,
    threshold: 25,
    actionType: "fan_speed" as string,
    actionValue: 2,
    timeFrom: "",
    timeTo: "",
    hysteresis: 1,
  });

  const resetForm = () => {
    setForm({
      name: "",
      season: "all",
      sensorType: "outdoor_temp",
      externalSensorId: null,
      operator: "gt",
      threshold: 25,
      actionType: "fan_speed",
      actionValue: 2,
      timeFrom: "",
      timeTo: "",
      hysteresis: 1,
    });
    setEditingRule(null);
  };

  const handleSubmit = () => {
    const payload: any = {
      ...form,
      deviceId,
      enabled: true,
    };
    // If no external sensor selected, remove the field
    if (!payload.externalSensorId) delete payload.externalSensorId;
    if (editingRule) {
      updateRule.mutate({ id: editingRule.id, data: payload });
    } else {
      createRule.mutate(payload);
    }
    setDialogOpen(false);
    resetForm();
  };

  const handleEdit = (rule: any) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      season: rule.season,
      sensorType: rule.sensorType,
      externalSensorId: rule.externalSensorId || null,
      operator: rule.operator,
      threshold: rule.threshold,
      actionType: rule.actionType,
      actionValue: rule.actionValue,
      timeFrom: rule.timeFrom || "",
      timeTo: rule.timeTo || "",
      hysteresis: rule.hysteresis || 1,
    });
    setDialogOpen(true);
  };

  const toggleEnabled = (rule: any) => {
    updateRule.mutate({ id: rule.id, data: { enabled: !rule.enabled } });
  };

  if (rulesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Automatisierungsregeln</h3>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={resetForm}>
              <Plus className="w-4 h-4 mr-1" /> Neue Regel
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingRule ? "Regel bearbeiten" : "Neue Automatisierungsregel"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="z.B. Sommer-Kühlung"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Saison</Label>
                  <Select
                    value={form.season}
                    onValueChange={(v) => setForm({ ...form, season: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {seasonOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Sensor</Label>
                  <Select
                    value={form.sensorType}
                    onValueChange={(v) => setForm({ ...form, sensorType: v, externalSensorId: null })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sensorOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Specific external sensor selection */}
                {externalSensors && externalSensors.length > 0 && (
                  <div>
                    <Label>Spezifischer Home Assistant Sensor</Label>
                    <Select
                      value={form.externalSensorId?.toString() || ""}
                      onValueChange={(v) =>
                        setForm({ ...form, externalSensorId: v ? Number(v) : null })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Geräteintern (kein externer)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Geräteintern (kein externer)</SelectItem>
                        {externalSensors
                          .filter((s: any) => s.sensorType === form.sensorType ||
                            (form.sensorType === "outdoor_temp" && s.sensorType === "temperature") ||
                            (form.sensorType === "forecast_temp" && s.sensorType === "forecast_temp") ||
                            (form.sensorType === "humidity" && s.sensorType === "humidity") ||
                            (form.sensorType === "co2" && s.sensorType === "co2"))
                          .map((sensor: any) => (
                            <SelectItem key={sensor.id} value={String(sensor.id)}>
                              <div className="flex items-center gap-2">
                                <Home className="w-3 h-3" />
                                {sensor.name}
                                {sensor.lastValue && (
                                  <span className="text-muted-foreground text-xs">
                                    ({sensor.lastValue} {sensor.unit})
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      {form.externalSensorId
                        ? "Verwendet den Wert dieses Home Assistant Sensors"
                        : "Verwendet den Wert des Geräts selbst"}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Operator</Label>
                  <Select
                    value={form.operator}
                    onValueChange={(v) => setForm({ ...form, operator: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {operatorOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Schwellwert</Label>
                  <Input
                    type="number"
                    value={form.threshold}
                    onChange={(e) =>
                      setForm({ ...form, threshold: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Aktion</Label>
                  <Select
                    value={form.actionType}
                    onValueChange={(v) => setForm({ ...form, actionType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {actionOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Aktionswert</Label>
                  <Input
                    type="number"
                    value={form.actionValue}
                    onChange={(e) =>
                      setForm({ ...form, actionValue: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Zeit von (optional)</Label>
                  <Input
                    type="time"
                    value={form.timeFrom}
                    onChange={(e) =>
                      setForm({ ...form, timeFrom: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Zeit bis (optional)</Label>
                  <Input
                    type="time"
                    value={form.timeTo}
                    onChange={(e) =>
                      setForm({ ...form, timeTo: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Hysterese (°C/%)</Label>
                <Input
                  type="number"
                  value={form.hysteresis}
                  onChange={(e) =>
                    setForm({ ...form, hysteresis: Number(e.target.value) })
                  }
                  placeholder="1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Verhindert ständiges Ein-/Ausschalten
                </p>
              </div>

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={!form.name || createRule.isPending || updateRule.isPending}
              >
                {editingRule ? "Speichern" : "Regel erstellen"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Rules List */}
      {rules && rules.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((rule: any) => (
            <Card
              key={rule.id}
              className={`p-4 border-border/40 transition-opacity ${
                !rule.enabled ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {rule.name}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {rule.season === "summer"
                        ? "Sommer"
                        : rule.season === "winter"
                        ? "Winter"
                        : "Ganzjährig"}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-1">
                      <Thermometer className="w-3 h-3" />
                      {sensorOptions.find((s) => s.value === rule.sensorType)?.label}{" "}
                      {rule.operator === "gt"
                        ? ">"
                        : rule.operator === "lt"
                        ? "<"
                        : rule.operator === "gte"
                        ? "≥"
                        : rule.operator === "lte"
                        ? "≤"
                        : "="}{" "}
                      {rule.threshold}
                    </div>
                    <div className="flex items-center gap-1">
                      <Wind className="w-3 h-3" />
                      {actionOptions.find((a) => a.value === rule.actionType)?.label} →{" "}
                      {rule.actionValue}
                    </div>
                    {(rule.timeFrom || rule.timeTo) && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {rule.timeFrom || "00:00"} - {rule.timeTo || "23:59"}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => toggleEnabled(rule)}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => handleEdit(rule)}
                  >
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => deleteRule.mutate(rule.id)}
                  >
                    <Trash2 className="w-3 h-3 text-destructive/70" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border border-dashed rounded-xl opacity-60">
          <Bot className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p>Noch keine Automatisierungsregeln</p>
          <p className="text-sm">
            Erstelle Regeln für Sommerkühlung oder Winter-Luftfeuchtigkeit
          </p>
        </div>
      )}

      {/* Logs */}
      <Accordion type="single" collapsible>
        <AccordionItem value="logs">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <History className="w-4 h-4" />
              <span className="text-sm">Ausführungsprotokoll</span>
              {logs && logs.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {logs.length}
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {logsLoading ? (
              <Skeleton className="h-32" />
            ) : logs && logs.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {logs.map((log: any) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 text-xs p-2 rounded bg-muted/50"
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${
                        log.success ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <span className="text-muted-foreground">
                      {new Date(log.triggeredAt).toLocaleString("de-DE", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                    <span className="font-mono">{log.sensorValue / 10}°C</span>
                    <span>{log.actionTaken}</span>
                    <span
                      className={`ml-auto ${
                        log.success ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {log.success ? "OK" : "Fehler"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Noch keine Ausführungen
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <hr className="border-border/40 my-6" />

      {/* Control Profiles (Regulation Schemas) */}
      <ControlProfilesPanel deviceId={deviceId} />
    </div>
  );
}
