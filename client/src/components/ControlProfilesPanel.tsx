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
  History, Power, Settings2, ChevronDown, ChevronUp, Flame, Cpu, Timer,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

// Which sensor measurement types each profile needs, with German label + icon key
const profileSensorTypes: Record<string, { key: string; label: string; icon: string }[]> = {
  temperature_control: [{ key: "indoor_temp",  label: "Innentemperatur",  icon: "thermometer" }],
  humidity_control:    [{ key: "humidity",      label: "Luftfeuchtigkeit", icon: "droplets"    }],
  co2_control:         [{ key: "co2",           label: "CO₂-Sensor",       icon: "wind"        }],
  summer_winter:       [
    { key: "indoor_temp",  label: "Innentemperatur",  icon: "thermometer" },
    { key: "outdoor_temp", label: "Außentemperatur",  icon: "sun"         },
  ],
  night_setback:       [{ key: "indoor_temp",  label: "Innentemperatur",  icon: "thermometer" }],
  weather_compensated: [
    { key: "indoor_temp",  label: "Innentemperatur",  icon: "thermometer" },
    { key: "outdoor_temp", label: "Außentemperatur",  icon: "sun"         },
  ],
};

// Which external sensor sensorTypes are compatible with each measurement key
const compatibleSensorTypes: Record<string, string[]> = {
  indoor_temp:  ["indoor_temp",  "temperature"],
  outdoor_temp: ["outdoor_temp", "temperature"],
  humidity:     ["humidity",     "indoor_humidity", "outdoor_humidity"],
  co2:          ["co2"],
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
  "holdMinutes",
  // co2OverrideThreshold and humidityOverrideThreshold are intentionally NOT
  // listed here — they live inside the Hitzeschutz section of the dialog, not
  // in the generic "Erweitert" collapsible.
];

// Hardware only supports fan speed levels 1-3 (Blauberg S21). Any parameter
// controlling a fan speed must be constrained to this range in the input UI.
const FAN_SPEED_PARAM_KEYS = [
  "baseFanSpeed",
  "activeFanSpeed",
  "maxFanSpeed",
  "heaterFanSpeed",
  "fanSpeedDay",
  "fanSpeedNight",
  "outputMin",
  "outputMax",
];

function isFanSpeedParam(key: string) {
  return FAN_SPEED_PARAM_KEYS.includes(key);
}

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

// Extracted to a separate file so it can be unit-tested without React deps.
// Tests: scripts/test-heat-protection-badge.ts
import { getHeatProtectionStatus } from "@/lib/heat-protection";

function getHoldStatus(logs: any[], profileId: number): { active: boolean; remainingMin: number | null } {
  if (!logs || logs.length === 0) return { active: false, remainingMin: null };
  const profileLogs = logs
    .filter((l: any) => l.profileId === profileId)
    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const latest = profileLogs[0];
  if (!latest || !latest.actionTaken?.includes("⏸")) return { active: false, remainingMin: null };
  const match = latest.message?.match(/noch (\d+) Min\./);
  return { active: true, remainingMin: match ? parseInt(match[1], 10) : null };
}

export function ControlProfilesPanel({ deviceId }: ControlProfilesPanelProps) {
  const { data: profiles, isLoading: profilesLoading } = useControlProfiles(deviceId);
  const [logPage, setLogPage] = useState(1);
  const LOG_PAGE_SIZE = 25;
  const { data: logsData, isLoading: logsLoading } = useControlLogs(deviceId, logPage, LOG_PAGE_SIZE);
  const logs = logsData?.logs;
  const logTotal = logsData?.total ?? 0;
  const logTotalPages = logsData?.totalPages ?? 1;
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
  // sensorMappings: { [measurementKey]: sensorId-as-string } — persisted in params.sensorMappings as numbers
  const [sensorMappings, setSensorMappings] = useState<Record<string, string>>({});

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

    // Convert string IDs → numeric for storage inside params.sensorMappings
    const numericMappings: Record<string, number> = {};
    for (const [type, id] of Object.entries(sensorMappings)) {
      if (id && id !== "none") numericMappings[type] = Number(id);
    }
    const finalParams = {
      ...params,
      sensorMappings: Object.keys(numericMappings).length > 0 ? numericMappings : undefined,
    };

    const data = {
      name,
      schemaType,
      controlType: schemaType,
      parameters: finalParams,
      enabled: true,
      deviceId,
    };

    if (editingProfile) {
      updateProfile.mutate({ id: editingProfile.id, data: { name, parameters: finalParams } });
    } else {
      createProfile.mutate(data as any);
    }

    setDialogOpen(false);
    setEditingProfile(null);
    setSelectedTemplate("");
    setParams({});
    setName("");
    setShowExpert(false);
    setSensorMappings({});
  };

  const handleEdit = (profile: any) => {
    setEditingProfile(profile);
    setSelectedTemplate(profile.schemaType || profile.controlType);
    setName(profile.name);
    setParams(profile.parameters || {});
    setShowExpert(false);
    // Restore sensorMappings from saved params (stored as numeric IDs → convert to strings for Select)
    const savedMappings = profile.parameters?.sensorMappings || {};
    const strMappings: Record<string, string> = {};
    for (const [type, id] of Object.entries(savedMappings)) {
      strMappings[type] = String(id);
    }
    setSensorMappings(strMappings);
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
    if (key === "useHeater") {
      const on = !!value;
      return (
        <div key={key} className="col-span-full">
          <button
            type="button"
            onClick={() => handleParamChange(key, !on)}
            data-testid="switch-param-useHeater"
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
              on
                ? "border-orange-500 bg-orange-500/10 text-orange-400"
                : "border-border bg-muted/30 text-muted-foreground hover:border-border/80"
            }`}
          >
            <div className={`p-2 rounded-lg ${on ? "bg-orange-500/20" : "bg-muted"}`}>
              <Flame className={`w-5 h-5 ${on ? "text-orange-400" : "text-muted-foreground"}`} />
            </div>
            <div className="flex-1 text-left">
              <div className="font-medium text-sm text-foreground">Heizregister nutzen</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {on
                  ? "Elektro-Heizregister wird bei Kältebedarf zugeschaltet"
                  : "Nur Lüftung – kein Heizen"}
              </div>
            </div>
            <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${on ? "bg-orange-500" : "bg-muted"}`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0"}`} />
            </div>
          </button>
        </div>
      );
    }
    if (key === "heatProtectionEnabled") {
      const on = value !== false;
      return (
        <div key={key} className="col-span-full">
          <button
            type="button"
            onClick={() => handleParamChange(key, !on)}
            data-testid="switch-param-heatProtectionEnabled"
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
              on
                ? "border-red-500 bg-red-500/10 text-red-400"
                : "border-border bg-muted/30 text-muted-foreground hover:border-border/80"
            }`}
          >
            <div className={`p-2 rounded-lg ${on ? "bg-red-500/20" : "bg-muted"}`}>
              <Thermometer className={`w-5 h-5 ${on ? "text-red-400" : "text-muted-foreground"}`} />
            </div>
            <div className="flex-1 text-left">
              <div className="font-medium text-sm text-foreground">Hitzeschutz aktivieren</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {on
                  ? "Anlage geht bei hoher Außentemperatur automatisch auf Standby"
                  : "Hitzeschutz deaktiviert – Anlage läuft auch bei Hitze durch"}
              </div>
            </div>
            <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${on ? "bg-red-500" : "bg-muted"}`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0"}`} />
            </div>
          </button>
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
          onChange={(e) => {
            if (e.target.value === "") {
              handleParamChange(key, null);
              return;
            }
            let num = Number(e.target.value);
            if (isFanSpeedParam(key) && !Number.isNaN(num)) {
              num = Math.max(1, Math.min(3, num));
            }
            if (key === "holdMinutes" && !Number.isNaN(num)) {
              num = Math.max(1, Math.min(30, num));
            }
            handleParamChange(key, num);
          }}
          min={isFanSpeedParam(key) ? 1 : key === "holdMinutes" ? 1 : undefined}
          max={isFanSpeedParam(key) ? 3 : key === "holdMinutes" ? 30 : undefined}
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
  // Keys rendered in dedicated sections are excluded from both generic lists.
  const DEDICATED_KEYS = new Set([
    "useExternalSensors", "useHeater", "heatProtectionEnabled",
    "heatShutdownAbove", "co2OverrideThreshold", "humidityOverrideThreshold",
  ]);
  const setpointEntries = dialogParamEntries.filter(([key]) => !isExpertParam(key) && !DEDICATED_KEYS.has(key));
  const expertEntries   = dialogParamEntries.filter(([key]) => isExpertParam(key)  && !DEDICATED_KEYS.has(key));

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
                setSensorMappings({});
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

                  {/* External sensor toggle + per-type sensor pickers */}
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
                      {params.useExternalSensors && (() => {
                        const ct = editingProfile
                          ? (editingProfile.schemaType || editingProfile.controlType)
                          : selectedTemplate;
                        const needed = profileSensorTypes[ct] || [];
                        if (needed.length === 0) return null;
                        const allSensors = (externalSensors as any[]) || [];
                        return (
                          <div className="space-y-3 rounded-lg border border-border/40 bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground">
                              Wählen Sie für jeden Messwert den gewünschten Sensor.
                              „Automatisch“ nutzt den besten passenden Gerätesensor.
                            </p>
                            {needed.map(({ key: sType, label: sLabel }) => {
                              const compatible = allSensors.filter((s: any) =>
                                (compatibleSensorTypes[sType] || []).includes(s.sensorType)
                              );
                              const IconComp = sType === "indoor_temp" ? Thermometer
                                : sType === "outdoor_temp" ? Sun
                                : sType === "humidity"     ? Droplets
                                : Wind;
                              return (
                                <div key={sType} className="space-y-1.5">
                                  <Label className="text-xs font-medium flex items-center gap-1.5">
                                    <IconComp className="w-3.5 h-3.5 text-muted-foreground" />
                                    {sLabel}
                                  </Label>
                                  <Select
                                    value={sensorMappings[sType] || "none"}
                                    onValueChange={(v) =>
                                      setSensorMappings((prev) => ({ ...prev, [sType]: v === "none" ? "" : v }))
                                    }
                                  >
                                    <SelectTrigger data-testid={`select-sensor-${sType}`}>
                                      <SelectValue placeholder="Automatisch" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">
                                        Automatisch (Gerätesensor bevorzugt)
                                      </SelectItem>
                                      {compatible.length > 0 ? compatible.map((s: any) => (
                                        <SelectItem key={s.id} value={String(s.id)}>
                                          {s.name}
                                          {s.unit ? ` (${s.unit})` : ""}
                                          {s.lastValue !== null ? ` — aktuell: ${s.lastValue}` : ""}
                                        </SelectItem>
                                      )) : (
                                        <SelectItem value="__none__" disabled>
                                          Keine passenden Sensoren verfügbar
                                        </SelectItem>
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                      {!params.useExternalSensors && (
                        <p className="text-xs text-muted-foreground">
                          Konfigurieren Sie externe Sensoren im Reiter „Konfiguration“.
                        </p>
                      )}
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

                  {/* Hitzeschutz toggle + threshold + override thresholds */}
                  {dialogParamEntries.some(([key]) => key === "heatProtectionEnabled") && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold">Hitzeschutz</h4>
                      {renderParamInput("heatProtectionEnabled", params["heatProtectionEnabled"], "Hitzeschutz aktivieren")}

                      {/* All three threshold fields share the same enabled/disabled state */}
                      {(() => {
                        const off = params.heatProtectionEnabled === false;
                        const fieldClass = off ? "opacity-40" : "";
                        const labelClass = `text-sm ${off ? "text-muted-foreground/50" : ""}`;
                        return (
                          <div className={`space-y-4 ${off ? "pointer-events-none select-none" : ""}`}>
                            {/* Abschalten ab */}
                            <div className="space-y-2">
                              <Label className={labelClass}>Abschalten ab (°C, Standard: 32)</Label>
                              <Input
                                type="number"
                                value={params.heatShutdownAbove ?? 32}
                                disabled={off}
                                onChange={(e) => {
                                  if (e.target.value === "") { handleParamChange("heatShutdownAbove", null); return; }
                                  handleParamChange("heatShutdownAbove", Number(e.target.value));
                                }}
                                step={1} min={20} max={50}
                                data-testid="input-param-heatShutdownAbove"
                                className={fieldClass}
                              />
                              <p className="text-xs text-muted-foreground">
                                {off
                                  ? "Hitzeschutz ist deaktiviert – der gespeicherte Schwellenwert bleibt erhalten."
                                  : "Anlage geht auf Standby, sobald die Außentemperatur diesen Wert überschreitet."}
                              </p>
                            </div>

                            {/* Override-Schwellenwerte */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label className={labelClass}>CO₂-Override (ppm, Standard: 1000)</Label>
                                <Input
                                  type="number"
                                  value={params.co2OverrideThreshold ?? 1000}
                                  disabled={off}
                                  onChange={(e) => {
                                    if (e.target.value === "") { handleParamChange("co2OverrideThreshold", null); return; }
                                    handleParamChange("co2OverrideThreshold", Number(e.target.value));
                                  }}
                                  step={50} min={400} max={5000}
                                  data-testid="input-param-co2OverrideThreshold"
                                  className={fieldClass}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className={labelClass}>Feuchte-Override (%, Standard: 65)</Label>
                                <Input
                                  type="number"
                                  value={params.humidityOverrideThreshold ?? 65}
                                  disabled={off}
                                  onChange={(e) => {
                                    if (e.target.value === "") { handleParamChange("humidityOverrideThreshold", null); return; }
                                    handleParamChange("humidityOverrideThreshold", Number(e.target.value));
                                  }}
                                  step={1} min={30} max={100}
                                  data-testid="input-param-humidityOverrideThreshold"
                                  className={fieldClass}
                                />
                              </div>
                            </div>
                            {!off && (
                              <p className="text-xs text-muted-foreground">
                                Überschreitet CO₂ oder Feuchte den Override-Wert, bleibt die Anlage auf Stufe 1 aktiv — auch wenn Hitzeschutz greifen würde.
                              </p>
                            )}
                          </div>
                        );
                      })()}
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

                {/* Hold-time indicator */}
                {enabled && (() => {
                  const holdStatus = getHoldStatus(logs || [], profile.id);
                  if (!holdStatus.active) return null;
                  return (
                    <div
                      className="mt-3 flex items-center gap-1.5 text-xs text-amber-500 dark:text-amber-400"
                      data-testid={`status-holdtime-${profile.id}`}
                    >
                      <Timer className="h-3 w-3 shrink-0" />
                      <span>
                        Haltezeit{holdStatus.remainingMin !== null ? ` – noch ${holdStatus.remainingMin} Min.` : ""}
                      </span>
                    </div>
                  );
                })()}

                {/* Heat-protection status badges */}
                {enabled && controlType === "weather_compensated" && (() => {
                  const heatStatus = getHeatProtectionStatus(logs || [], profile.id);
                  if (!heatStatus.standby && !heatStatus.override) return null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {heatStatus.standby && (
                        <Badge
                          variant="outline"
                          className="gap-1 text-[10px] px-1.5 py-0 border-orange-500/50 bg-orange-500/10 text-orange-500"
                          data-testid={`badge-heatprotection-${profile.id}`}
                        >
                          🌡 Hitzeschutz aktiv
                        </Badge>
                      )}
                      {heatStatus.override && (
                        <Badge
                          variant="outline"
                          className="gap-1 text-[10px] px-1.5 py-0 border-sky-500/50 bg-sky-500/10 text-sky-400"
                          data-testid={`badge-heatprotection-override-${profile.id}`}
                        >
                          ⚠ {heatStatus.overrideReason ? `Override: ${heatStatus.overrideReason}` : "Override aktiv"}
                        </Badge>
                      )}
                    </div>
                  );
                })()}

                {/* Status indicators */}
                {enabled && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Power className="h-3 w-3 text-green-500" />
                    <span>Regelung aktiv</span>
                    {profile.parameters?.useHeater && (
                      <Badge variant="outline" className="ml-1 gap-1 text-[10px] px-1.5 py-0 border-orange-500/50 text-orange-400">
                        <Flame className="h-2.5 w-2.5" />
                        Heizung
                      </Badge>
                    )}
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
              {logTotal > 0 && (
                <Badge variant="outline" className="text-xs">{logTotal}</Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {logsLoading ? (
              <Skeleton className="h-24" />
            ) : logs && logs.length > 0 ? (
              <div className="space-y-2">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {logs.map((log: any) => (
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
                {logTotalPages > 1 && (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-xs text-muted-foreground">
                      Seite {logPage} von {logTotalPages} ({logTotal} Einträge)
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLogPage(p => Math.max(1, p - 1))}
                        disabled={logPage <= 1}
                        className="h-7 px-2 text-xs"
                      >
                        ‹ Zurück
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLogPage(p => Math.min(logTotalPages, p + 1))}
                        disabled={logPage >= logTotalPages}
                        className="h-7 px-2 text-xs"
                      >
                        Weiter ›
                      </Button>
                    </div>
                  </div>
                )}
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
