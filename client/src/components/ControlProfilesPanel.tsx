import { useState } from "react";
import {
  useControlProfiles,
  useControlLogs,
  useControlProfileTemplates,
  useCreateControlProfile,
  useUpdateControlProfile,
  useDeleteControlProfile,
} from "@/hooks/use-control-profiles";
import { useRegisters } from "@/hooks/use-registers";
import { useExternalSensors } from "@/hooks/use-external-sensors";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Plus, Trash2, Pencil, Bot, Thermometer, Droplets, Wind, Moon, Sun, Gauge,
  History, Power, Settings2, ChevronDown, ChevronUp,
} from "lucide-react";

interface ControlProfilesPanelProps {
  deviceId: number;
}

const controlTypeIcons: Record<string, any> = {
  temperature_control: Thermometer,
  humidity_control: Droplets,
  co2_control: Wind,
  summer_winter: Sun,
  night_setback: Moon,
  weather_compensated: Gauge,
};

const controlTypeLabels: Record<string, string> = {
  temperature_control: "Temperaturregelung",
  humidity_control: "Feuchtigkeitsregelung",
  co2_control: "CO2-Regelung",
  summer_winter: "Sommer/Winter",
  night_setback: "Nachtabsenkung",
  weather_compensated: "Wetterkompensiert",
};

const controlTypeUnits: Record<string, string> = {
  temperature_control: "°C",
  humidity_control: "%",
  co2_control: "ppm",
  summer_winter: "°C",
  night_setback: "°C",
  weather_compensated: "°C",
};

const controlTypeSetpointKeys: Record<string, string[]> = {
  temperature_control: ["setpoint"],
  humidity_control: ["setpoint"],
  co2_control: ["setpoint"],
  summer_winter: ["summerSetpoint", "winterSetpoint"],
  night_setback: ["daySetpoint", "nightSetpoint"],
  weather_compensated: ["roomSetpoint"],
};

const expertParamKeys = [
  "kp","ki","kd","outputMin","outputMax","hysteresis","summerHysteresis",
  "switchTemp","nightStart","nightEnd","fanspeed","emergencyThreshold",
];

function isExpertParam(key: string) {
  return expertParamKeys.some((k) => key.toLowerCase().includes(k.toLowerCase()));
}

function getSetpointKey(controlType: string, params: Record<string, any>): string | null {
  const keys = controlTypeSetpointKeys[controlType] || ["setpoint"];
  for (const k of keys) {
    if (params[k] !== undefined && params[k] !== null) return k;
  }
  return keys[0] || null;
}

function getSetpointValue(controlType: string, params: Record<string, any>): number | null {
  const key = getSetpointKey(controlType, params);
  if (!key) return null;
  const val = params[key];
  return val !== undefined && val !== null ? Number(val) : null;
}

function getSetpointLabel(controlType: string, params: Record<string, any>): string {
  const key = getSetpointKey(controlType, params);
  if (!key) return "Sollwert";
  const map: Record<string, string> = {
    setpoint: "Sollwert",
    summerSetpoint: "Sommer-Soll",
    winterSetpoint: "Winter-Soll",
    daySetpoint: "Tag-Soll",
    nightSetpoint: "Nacht-Soll",
    roomSetpoint: "Raum-Soll",
  };
  return map[key] || "Sollwert";
}

export function ControlProfilesPanel({ deviceId }: ControlProfilesPanelProps) {
  const { data: profiles, isLoading: profilesLoading } = useControlProfiles(deviceId);
  const { data: logs, isLoading: logsLoading } = useControlLogs(deviceId);
  const { data: templates } = useControlProfileTemplates();
  const { data: registers } = useRegisters(deviceId);
  const { data: externalSensors } = useExternalSensors(deviceId);
  const createProfile = useCreateControlProfile(deviceId);
  const updateProfile = useUpdateControlProfile(deviceId);
  const deleteProfile = useDeleteControlProfile(deviceId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [params, setParams] = useState<Record<string, any>>({});
  const [name, setName] = useState("");
  const [showExpert, setShowExpert] = useState(false);

  const hasExternalSensor = (type: string) => {
    return externalSensors?.some((s: any) => s.sensorType === type) ?? false;
  };

  const needsExternalSensor = (controlType: string) => {
    return ["temperature_control", "humidity_control", "co2_control", "summer_winter", "night_setback", "weather_compensated"].includes(controlType);
  };

  const getRequiredSensorType = (controlType: string): string | null => {
    switch (controlType) {
      case "temperature_control": return "indoor_temp";
      case "humidity_control": return "humidity";
      case "co2_control": return "co2";
      case "summer_winter": return "outdoor_temp";
      case "night_setback": return "indoor_temp";
      case "weather_compensated": return "outdoor_temp";
      default: return null;
    }
  };

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    if (templates && templates[templateKey]) {
      const t = templates[templateKey];
      setName(t.name);
      setParams(t.defaultParams || {});
    }
  };

  const handleSave = () => {
    if (!selectedTemplate && !editingProfile) return;

    const schemaType = editingProfile
      ? editingProfile.schemaType || editingProfile.controlType
      : selectedTemplate;

    const data = {
      name,
      schemaType,
      controlType: schemaType,
      parameters: params,
      enabled: true,
      deviceId,
    };

    if (editingProfile) {
      updateProfile.mutate({ id: editingProfile.id, data: { name, parameters: params } });
    } else {
      createProfile.mutate(data as any);
    }

    setDialogOpen(false);
    setEditingProfile(null);
    setSelectedTemplate("");
    setParams({});
    setName("");
    setShowExpert(false);
  };

  const handleEdit = (profile: any) => {
    setEditingProfile(profile);
    setSelectedTemplate(profile.schemaType || profile.controlType);
    setName(profile.name);
    setParams(profile.parameters || {});
    setShowExpert(false);
    setDialogOpen(true);
  };

  const handleToggle = (profile: any) => {
    updateProfile.mutate({
      id: profile.id,
      data: { enabled: !profile.enabled },
    });
  };

  const handleQuickSetpoint = (profile: any, newValue: number) => {
    const key = getSetpointKey(profile.schemaType || profile.controlType, profile.parameters || {});
    if (!key) return;
    const newParams = { ...profile.parameters, [key]: newValue };
    updateProfile.mutate({
      id: profile.id,
      data: { parameters: newParams },
    });
  };

  const handleParamChange = (key: string, value: any) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const renderParamInput = (key: string, value: any, label: string) => {
    if (key === "useExternalSensors") {
      return (
        <div key={key} className="flex items-center gap-2">
          <Switch
            checked={!!value}
            onCheckedChange={(v) => handleParamChange(key, v)}
            data-testid={`switch-param-${key}`}
          />
          <Label className="text-sm">{label}</Label>
        </div>
      );
    }
    if (key.toLowerCase().includes("time") && typeof value === "string" && value.includes(":")) {
      return (
        <div key={key} className="space-y-2">
          <Label className="text-sm">{label}</Label>
          <Input
            type="time"
            value={value || "00:00"}
            onChange={(e) => handleParamChange(key, e.target.value)}
            data-testid={`input-param-${key}`}
          />
        </div>
      );
    }
    if (typeof value === "boolean" || key === "enabled") {
      return (
        <div key={key} className="flex items-center gap-2">
          <Switch
            checked={!!value}
            onCheckedChange={(v) => handleParamChange(key, v)}
            data-testid={`switch-param-${key}`}
          />
          <Label className="text-sm">{label}</Label>
        </div>
      );
    }
    return (
      <div key={key} className="space-y-2">
        <Label className="text-sm">{label}</Label>
        <Input
          type="number"
          value={value ?? 0}
          onChange={(e) => handleParamChange(key, e.target.value === "" ? null : Number(e.target.value))}
          step={key.includes("Temp") || key.includes("temp") || key.includes("hysteresis") || key.includes("offset") || key.includes("supply") ? 0.1 : 1}
          data-testid={`input-param-${key}`}
        />
      </div>
    );
  };

  const currentTemplate = selectedTemplate && templates ? templates[selectedTemplate] : null;

  // Split params into setpoint and expert for dialog
  const dialogParamEntries = currentTemplate
    ? Object.entries(currentTemplate.paramLabels || {})
    : [];
  const setpointEntries = dialogParamEntries.filter(([key]) => !isExpertParam(key) && key !== "useExternalSensors" && key !== "useHeater");
  const expertEntries = dialogParamEntries.filter(([key]) => isExpertParam(key) && key !== "useExternalSensors" && key !== "useHeater");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Sollwerte</h3>
          <p className="text-sm text-muted-foreground">
            Geben Sie die gewünschten Werte ein – die Anlage regelt automatisch.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              onClick={() => {
                setEditingProfile(null);
                setSelectedTemplate("");
                setParams({});
                setName("");
                setShowExpert(false);
              }}
              data-testid="button-add-control-profile"
            >
              <Plus className="h-4 w-4 mr-1" />
              Sollwert hinzufügen
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProfile ? "Sollwert bearbeiten" : "Neuen Sollwert einrichten"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {!editingProfile && (
                <div className="space-y-2">
                  <Label>Regelungstyp</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {templates &&
                      Object.entries(templates).map(([key, t]: [string, any]) => {
                        const Icon = controlTypeIcons[key] || Bot;
                        const active = selectedTemplate === key;
                        return (
                          <button
                            key={key}
                            onClick={() => handleTemplateChange(key)}
                            className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors text-left ${
                              active
                                ? "border-primary bg-primary/10"
                                : "border-border hover:bg-muted/50"
                            }`}
                            data-testid={`template-card-${key}`}
                          >
                            <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                            <span className="text-sm font-medium">{t.name}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Wohnzimmer-Temperatur"
                  data-testid="input-profile-name"
                />
              </div>

              {currentTemplate && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {currentTemplate.description}
                  </p>

                  {/* Setpoint params */}
                  {setpointEntries.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold">Sollwert</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {setpointEntries.map(([key, label]) =>
                          renderParamInput(key, params[key], label as string)
                        )}
                      </div>
                    </div>
                  )}

                  {/* External sensor toggle */}
                  {dialogParamEntries.some(([key]) => key === "useExternalSensors") && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold">Externe Sensoren</h4>
                      <div className="grid grid-cols-1 gap-4">
                        {dialogParamEntries
                          .filter(([key]) => key === "useExternalSensors")
                          .map(([key, label]) =>
                            renderParamInput(key, params[key], label as string)
                          )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Konfigurieren Sie externe Sensoren im Reiter „Konfiguration“.
                      </p>
                    </div>
                  )}

                  {/* Heater toggle */}
                  {dialogParamEntries.some(([key]) => key === "useHeater") && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold">Heizung</h4>
                      <div className="grid grid-cols-1 gap-4">
                        {dialogParamEntries
                          .filter(([key]) => key === "useHeater")
                          .map(([key, label]) =>
                            renderParamInput(key, params[key], label as string)
                          )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Nutzt das integrierte Elektro-Heizregister, wenn die Außenluft zu kalt ist, um den Sollwert allein durch Lüften zu erreichen.
                      </p>
                    </div>
                  )}

                  {/* Expert params collapsible */}
                  {expertEntries.length > 0 && (
                    <div className="border rounded-lg">
                      <button
                        onClick={() => setShowExpert((s) => !s)}
                        className="w-full flex items-center justify-between p-3 text-sm font-medium hover:bg-muted/50 rounded-lg"
                        data-testid="button-toggle-expert"
                      >
                        <div className="flex items-center gap-2">
                          <Settings2 className="h-4 w-4 text-muted-foreground" />
                          <span>Erweitert</span>
                        </div>
                        {showExpert ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      {showExpert && (
                        <div className="p-3 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {expertEntries.map(([key, label]) =>
                            renderParamInput(key, params[key], label as string)
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={(!selectedTemplate && !editingProfile) || !name}
                  data-testid="button-save-control-profile"
                >
                  {editingProfile ? "Speichern" : "Erstellen"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Active Profiles — Setpoint Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {profilesLoading ? (
          <>
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </>
        ) : profiles && profiles.length > 0 ? (
          profiles.map((profile: any) => {
            const controlType = profile.schemaType || profile.controlType;
            const Icon = controlTypeIcons[controlType] || Bot;
            const unit = controlTypeUnits[controlType] || "";
            const setpoint = getSetpointValue(controlType, profile.parameters || {});
            const setpointLabel = getSetpointLabel(controlType, profile.parameters || {});
            const enabled = profile.enabled;

            return (
              <Card
                key={profile.id}
                className={`p-4 border-border/40 transition-opacity ${!enabled ? "opacity-60" : ""}`}
                data-testid={`card-control-profile-${profile.id}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${enabled ? "bg-primary/10" : "bg-muted"}`}>
                      <Icon className={`h-4 w-4 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm">{profile.name}</h4>
                        <Badge
                          variant={enabled ? "default" : "secondary"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {enabled ? "Aktiv" : "Inaktiv"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {controlTypeLabels[controlType] || controlType}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={enabled}
                      onCheckedChange={() => handleToggle(profile)}
                      data-testid={`switch-profile-enabled-${profile.id}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleEdit(profile)}
                      data-testid={`button-edit-profile-${profile.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => deleteProfile.mutate(profile.id)}
                      data-testid={`button-delete-profile-${profile.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                {/* Setpoint quick edit */}
                {setpoint !== null && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">{setpointLabel}</Label>
                      <span className="text-xs font-medium tabular-nums">
                        {setpoint.toFixed(1)} {unit}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={setpoint}
                        onChange={(e) => {
                          const val = e.target.value === "" ? 0 : Number(e.target.value);
                          handleQuickSetpoint(profile, val);
                        }}
                        step={0.1}
                        className="text-sm"
                        data-testid={`input-setpoint-${profile.id}`}
                      />
                      <span className="text-sm text-muted-foreground w-8">{unit}</span>
                    </div>
                  </div>
                )}

                {/* Status indicators */}
                {enabled && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Power className="h-3 w-3 text-green-500" />
                    <span>Regelung aktiv</span>
                    {profile.parameters?.outputMin !== undefined && (
                      <span className="ml-auto">
                        Lüfter {profile.parameters.outputMin}–{profile.parameters.outputMax}
                      </span>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        ) : (
          <div className="col-span-full text-center py-12 border border-dashed rounded-xl opacity-60">
            <Bot className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p>Noch keine Sollwerte eingerichtet</p>
            <p className="text-sm mt-1">
              Fügen Sie einen Regelungstyp hinzu und legen Sie den gewünschten Wert fest.
            </p>
          </div>
        )}
      </div>

      {/* Regulation Logs */}
      <Accordion type="single" collapsible>
        <AccordionItem value="logs">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4" />
              <span>Regelungsverlauf</span>
              {logs && logs.length > 0 && (
                <Badge variant="outline" className="text-xs">{logs.length}</Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {logsLoading ? (
              <Skeleton className="h-24" />
            ) : logs && logs.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {logs.slice(0, 20).map((log: any) => (
                  <div
                    key={log.id}
                    className="text-sm p-2 rounded bg-muted/50"
                    data-testid={`control-log-${log.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {controlTypeLabels[log.controlType] || log.controlType || log.schemaType || "Unbekannt"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString("de-DE")}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1">
                      {log.actionTaken} — {log.message}
                    </p>
                    {log.success === false && (
                      <Badge variant="destructive" className="text-xs mt-1">Fehlgeschlagen</Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Noch keine Regelungsaktionen aufgezeichnet
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
