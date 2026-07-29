import { useState } from "react";
import {
  useExternalSensors,
  useCreateExternalSensor,
  useUpdateExternalSensor,
  useDeleteExternalSensor,
  useHomeAssistantStatus,
  useHomeAssistantSensors,
  useImportHomeAssistantSensor,
  useSyncHomeAssistantSensors,
} from "@/hooks/use-external-sensors";
import { type ExternalSensor } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  Plus, Trash2, Radio, Home, Thermometer, Droplets, Wind, Gauge,
  CloudRain, RefreshCw, Import, Scan, Pencil, Search, ToggleLeft,
  GitMerge, WifiOff,
} from "lucide-react";

// Must match STALE_SENSOR_THRESHOLD_MS in server/lib/automation.ts (default 30 min).
// The server honours SENSOR_STALE_MINUTES env var; we default to the same value here.
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

function isSensorStale(sensor: ExternalSensor): boolean {
  if (!sensor.updatedAt) return true; // never synced
  return Date.now() - new Date(sensor.updatedAt).getTime() > STALE_THRESHOLD_MS;
}

function formatLastSeen(updatedAt: Date | string | null): string {
  if (!updatedAt) return "Noch nie aktualisiert";
  const diffMs = Date.now() - new Date(updatedAt).getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "Gerade eben";
  if (diffMin < 60) return `Vor ${diffMin} Min.`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `Vor ${diffH} Std.`;
  const diffD = Math.round(diffH / 24);
  return `Vor ${diffD} Tag${diffD !== 1 ? "en" : ""}`;
}

const sourceOptions = [
  { value: "homeassistant", label: "Home Assistant", icon: Home },
  { value: "virtual_avg", label: "Mittelwert-Sensor", icon: GitMerge },
];

const sensorTypeOptions = [
  { value: "temperature", label: "Temperatur (allgemein)", icon: Thermometer },
  { value: "indoor_temp", label: "Innen-Temperatur", icon: Thermometer },
  { value: "outdoor_temp", label: "Außen-Temperatur", icon: Thermometer },
  { value: "humidity", label: "Luftfeuchtigkeit (allgemein)", icon: Droplets },
  { value: "indoor_humidity", label: "Innen-Luftfeuchte", icon: Droplets },
  { value: "outdoor_humidity", label: "Außen-Luftfeuchte", icon: Droplets },
  { value: "co2", label: "CO₂", icon: Wind },
  { value: "forecast_temp", label: "Vorhersage-Temperatur", icon: CloudRain },
  { value: "pressure", label: "Luftdruck", icon: Gauge },
  { value: "wind_speed", label: "Windgeschwindigkeit", icon: Wind },
  { value: "binary", label: "Binär (Ein/Aus)", icon: ToggleLeft },
];

function suggestUnit(sensorType: string): string {
  if (sensorType.includes("temp")) return "°C";
  if (sensorType.includes("humidity")) return "%";
  if (sensorType === "co2") return "ppm";
  if (sensorType === "pressure") return "hPa";
  if (sensorType === "wind_speed") return "km/h";
  return "";
}

function SensorTypeLabel({ type }: { type: string }) {
  const opt = sensorTypeOptions.find((o) => o.value === type);
  return (
    <span className="flex items-center gap-1">
      {opt ? <opt.icon className="w-3 h-3" /> : null}
      {opt?.label ?? type}
    </span>
  );
}

// Checkbox-list for picking multiple source sensors (excludes virtual_avg sensors themselves)
function SourceSensorPicker({
  sensors,
  selectedIds,
  onChange,
}: {
  sensors: ExternalSensor[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const pickable = sensors.filter((s) => s.sourceType !== "virtual_avg");
  if (pickable.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        Keine Quell-Sensoren vorhanden. Füge zuerst Home Assistant-Sensoren hinzu.
      </p>
    );
  }
  return (
    <div className="space-y-1.5 max-h-48 overflow-y-auto border rounded-md p-2">
      {pickable.map((s) => {
        const checked = selectedIds.includes(s.id);
        return (
          <label
            key={s.id}
            className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-muted/50"
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(v) => {
                if (v) {
                  onChange([...selectedIds, s.id]);
                } else {
                  onChange(selectedIds.filter((id) => id !== s.id));
                }
              }}
              data-testid={`checkbox-source-${s.id}`}
            />
            <span className="text-sm flex-1 min-w-0">
              <span className="font-medium">{s.name}</span>
              <span className="text-muted-foreground ml-1.5 text-xs">
                ({sensorTypeOptions.find((o) => o.value === s.sensorType)?.label ?? s.sensorType})
              </span>
              {s.lastValue !== null && (
                <span className="text-muted-foreground ml-1.5 text-xs font-mono">
                  {s.lastValue} {s.unit}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

interface EditSensorDialogProps {
  sensor: ExternalSensor;
  deviceId: number;
  allSensors: ExternalSensor[];
  onClose: () => void;
}

function EditSensorDialog({ sensor, deviceId, allSensors, onClose }: EditSensorDialogProps) {
  const [name, setName] = useState(sensor.name);
  const [entityId, setEntityId] = useState(sensor.entityId ?? "");
  const [sensorType, setSensorType] = useState(sensor.sensorType);
  const [unit, setUnit] = useState(sensor.unit ?? "");
  const existingSourceIds = ((sensor.config as { sourceIds?: number[] } | null)?.sourceIds) ?? [];
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>(existingSourceIds);
  const updateSensor = useUpdateExternalSensor(deviceId);

  const isVirtual = sensor.sourceType === "virtual_avg";

  const handleSave = () => {
    updateSensor.mutate(
      {
        id: sensor.id,
        name: name.trim() || sensor.name,
        entityId: isVirtual ? null : (entityId.trim() || null),
        sensorType: sensorType as ExternalSensor["sensorType"],
        unit: unit.trim() || null,
        ...(isVirtual ? { config: { sourceIds: selectedSourceIds } } : {}),
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isVirtual ? "Mittelwert-Sensor bearbeiten" : "Sensor bearbeiten"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-edit-sensor-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Sensor-Typ</Label>
            <p className="text-xs text-muted-foreground">
              Bestimmt, wie die App diesen Sensor verwendet (z.B. für Außentemperatur-Regelung).
            </p>
            <Select
              value={sensorType}
              onValueChange={(v) => {
                setSensorType(v as any);
                if (!unit) setUnit(suggestUnit(v));
              }}
            >
              <SelectTrigger data-testid="select-edit-sensor-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sensorTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <opt.icon className="w-4 h-4" />
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isVirtual ? (
            <div className="space-y-1.5">
              <Label>Quell-Sensoren</Label>
              <p className="text-xs text-muted-foreground">
                Der Mittelwert dieser Sensoren wird automatisch berechnet.
              </p>
              <SourceSensorPicker
                sensors={allSensors}
                selectedIds={selectedSourceIds}
                onChange={setSelectedSourceIds}
              />
              {selectedSourceIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedSourceIds.length} Sensor{selectedSourceIds.length !== 1 ? "en" : ""} ausgewählt
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Entity ID (Home Assistant)</Label>
              <Input
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="sensor.outdoor_temp"
                className="font-mono text-sm"
                data-testid="input-edit-sensor-entity"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Einheit</Label>
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="°C"
              data-testid="input-edit-sensor-unit"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={updateSensor.isPending || (isVirtual && selectedSourceIds.length === 0)}
              className="flex-1"
              data-testid="button-save-sensor"
            >
              {updateSensor.isPending ? "Speichern..." : "Speichern"}
            </Button>
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-sensor">
              Abbrechen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExternalSensorsPanel({ deviceId }: { deviceId: number }) {
  const { data: sensors, isLoading } = useExternalSensors(deviceId);
  const createSensor = useCreateExternalSensor(deviceId);
  const deleteSensor = useDeleteExternalSensor(deviceId);
  const { data: haStatus } = useHomeAssistantStatus();
  const { data: haSensors, refetch: discoverHaSensors, isLoading: haLoading } = useHomeAssistantSensors();
  const importSensor = useImportHomeAssistantSensor(deviceId);
  const syncSensors = useSyncHomeAssistantSensors(deviceId);

  const [isOpen, setIsOpen] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [editingSensor, setEditingSensor] = useState<ExternalSensor | null>(null);
  const [haSearchQuery, setHaSearchQuery] = useState("");

  // Add form state
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<"homeassistant" | "openweather" | "manual" | "virtual_avg">("homeassistant");
  const [entityId, setEntityId] = useState("");
  const [sensorType, setSensorType] = useState("temperature");
  const [unit, setUnit] = useState("°C");
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([]);

  const resetForm = () => {
    setName("");
    setEntityId("");
    setUnit("°C");
    setSensorType("temperature");
    setSourceType("homeassistant");
    setSelectedSourceIds([]);
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    const isVirtual = sourceType === "virtual_avg";
    createSensor.mutate(
      {
        name,
        deviceId,
        sourceType,
        entityId: isVirtual ? null : (entityId || null),
        sensorType: sensorType as any,
        unit,
        ...(isVirtual ? { config: { sourceIds: selectedSourceIds } } : {}),
      },
      {
        onSuccess: () => {
          setIsOpen(false);
          resetForm();
        },
      }
    );
  };

  const handleDiscover = async () => {
    setShowDiscover(true);
    setHaSearchQuery("");
    await discoverHaSensors();
  };

  const filteredHaSensors = (haSensors ?? []).filter((sensor: any) => {
    const query = haSearchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      sensor.name?.toLowerCase().includes(query) ||
      sensor.entity_id?.toLowerCase().includes(query) ||
      sensor.sensor_type?.toLowerCase().includes(query)
    );
  });

  const handleImport = (sensor: any) => {
    importSensor.mutate({
      entityId: sensor.entity_id,
      sensorType: sensor.sensor_type,
      name: sensor.name,
    });
  };

  const isVirtualForm = sourceType === "virtual_avg";
  const canCreate = name.trim() && (!isVirtualForm || selectedSourceIds.length > 0);

  return (
    <div className="space-y-4">
      {editingSensor && (
        <EditSensorDialog
          sensor={editingSensor}
          deviceId={deviceId}
          allSensors={sensors ?? []}
          onClose={() => setEditingSensor(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Externe Sensoren</h3>
          <p className="text-sm text-muted-foreground">
            Home Assistant, Wetterstationen und virtuelle Mittelwert-Sensoren
          </p>
          {haStatus && (
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={haStatus.available ? "default" : "destructive"} className="text-xs">
                {haStatus.available ? "Home Assistant verbunden" : "Home Assistant nicht verfügbar"}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {haStatus.mode === "supervisor" ? "Supervisor" : "Standalone"}
              </Badge>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {haStatus?.available && (
            <>
              <Button size="sm" variant="outline" onClick={handleDiscover} disabled={haLoading}>
                <Scan className="w-4 h-4 mr-1" /> Sensoren entdecken
              </Button>
              <Button size="sm" variant="outline" onClick={() => syncSensors.mutate()} disabled={syncSensors.isPending}>
                <RefreshCw className={`w-4 h-4 mr-1 ${syncSensors.isPending ? "animate-spin" : ""}`} /> Sync
              </Button>
            </>
          )}
          <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-sensor">
                <Plus className="w-4 h-4 mr-1" /> Sensor hinzufügen
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {isVirtualForm ? "Mittelwert-Sensor erstellen" : "Externen Sensor hinzufügen"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Typ</Label>
                  <Select
                    value={sourceType}
                    onValueChange={(v) => {
                      setSourceType(v as any);
                      setSelectedSourceIds([]);
                    }}
                  >
                    <SelectTrigger data-testid="select-source-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <opt.icon className="w-4 h-4" />
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isVirtualForm && (
                  <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    Berechnet automatisch den Mittelwert der gewählten Sensoren beim nächsten Zyklus.
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="sensor-name">Name</Label>
                  <Input
                    id="sensor-name"
                    placeholder={isVirtualForm ? "z.B. Ø Innentemperatur" : "z.B. Außentemperatur Wetterstation"}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="input-sensor-name"
                  />
                </div>

                {!isVirtualForm && (
                  <div className="space-y-2">
                    <Label htmlFor="entity-id">Entity ID</Label>
                    <Input
                      id="entity-id"
                      placeholder="sensor.outdoor_temp"
                      value={entityId}
                      onChange={(e) => setEntityId(e.target.value)}
                      className="font-mono text-sm"
                      data-testid="input-entity-id"
                    />
                    <p className="text-xs text-muted-foreground">
                      z.B. <code className="bg-muted px-1 rounded">sensor.outdoor_temp</code>
                    </p>
                  </div>
                )}

                {isVirtualForm && (
                  <div className="space-y-2">
                    <Label>Quell-Sensoren</Label>
                    <p className="text-xs text-muted-foreground">
                      Der Mittelwert dieser Sensoren wird alle 10 Sekunden berechnet.
                    </p>
                    <SourceSensorPicker
                      sensors={sensors ?? []}
                      selectedIds={selectedSourceIds}
                      onChange={setSelectedSourceIds}
                    />
                    {selectedSourceIds.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {selectedSourceIds.length} Sensor{selectedSourceIds.length !== 1 ? "en" : ""} ausgewählt
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Sensor-Typ</Label>
                  <p className="text-xs text-muted-foreground">
                    Legt fest, wie die App diesen Sensor für Regelungen verwendet.
                  </p>
                  <Select
                    value={sensorType}
                    onValueChange={(v) => {
                      setSensorType(v);
                      setUnit(suggestUnit(v));
                    }}
                  >
                    <SelectTrigger data-testid="select-sensor-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sensorTypeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <opt.icon className="w-4 h-4" />
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unit">Einheit</Label>
                  <Input
                    id="unit"
                    placeholder="°C"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    data-testid="input-sensor-unit"
                  />
                </div>

                <Button
                  onClick={handleCreate}
                  disabled={createSensor.isPending || !canCreate}
                  className="w-full"
                  data-testid="button-create-sensor"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {createSensor.isPending ? "Speichern..." : "Speichern"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : sensors && sensors.length > 0 ? (
        <div className="space-y-2">
          {sensors.map((sensor: ExternalSensor) => {
            const isVirtual = sensor.sourceType === "virtual_avg";
            const sourceIds = ((sensor.config as { sourceIds?: number[] } | null)?.sourceIds) ?? [];
            const sourceNames = sourceIds
              .map((id) => sensors.find((s) => s.id === id)?.name)
              .filter(Boolean);
            const stale = sensor.lastValue !== null && isSensorStale(sensor);

            return (
              <Card
                key={sensor.id}
                className={`p-4 transition-colors ${stale ? "border-amber-500/60 bg-amber-500/5" : ""}`}
                data-testid={`card-sensor-${sensor.id}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg shrink-0 ${stale ? "bg-amber-500/15" : isVirtual ? "bg-primary/10" : "bg-muted"}`}>
                      {stale
                        ? <WifiOff className="w-4 h-4 text-amber-400" />
                        : isVirtual
                          ? <GitMerge className="w-4 h-4 text-primary" />
                          : <Radio className="w-4 h-4 text-muted-foreground" />
                      }
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium ${stale ? "text-muted-foreground" : ""}`}>{sensor.name}</span>
                        <Badge variant={isVirtual ? "default" : "outline"} className="text-xs shrink-0">
                          {isVirtual ? "Mittelwert" : (sourceOptions.find((o) => o.value === sensor.sourceType)?.label ?? sensor.sourceType)}
                        </Badge>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          <SensorTypeLabel type={sensor.sensorType} />
                        </Badge>
                        {stale && (
                          <Badge
                            variant="outline"
                            className="text-xs shrink-0 border-amber-500/60 text-amber-400 bg-amber-500/10 gap-1"
                            data-testid={`badge-stale-${sensor.id}`}
                          >
                            <WifiOff className="w-3 h-3" />
                            Offline — {formatLastSeen(sensor.updatedAt)}
                          </Badge>
                        )}
                      </div>
                      {isVirtual && sourceNames.length > 0 ? (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Ø aus: {sourceNames.join(", ")}
                        </div>
                      ) : (
                        sensor.entityId && (
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">
                            {sensor.entityId}
                          </div>
                        )
                      )}
                      {sensor.lastValue !== null && (
                        <div className={`text-xs font-mono mt-0.5 ${stale ? "text-muted-foreground/60" : "text-foreground/70"}`}>
                          {isVirtual ? "Mittelwert: " : "Letzter Wert: "}
                          <span className={`font-semibold ${stale ? "line-through decoration-amber-400/60" : ""}`}>
                            {sensor.lastValue} {sensor.unit}
                          </span>
                          {sensor.updatedAt && !stale && (
                            <span className="text-muted-foreground ml-2">
                              {new Date(sensor.updatedAt).toLocaleString("de-DE")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingSensor(sensor)}
                      title="Bearbeiten"
                      data-testid={`button-edit-sensor-${sensor.id}`}
                    >
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => deleteSensor.mutate(sensor.id)}
                      disabled={deleteSensor.isPending}
                      data-testid={`button-delete-sensor-${sensor.id}`}
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
          <Radio className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm">Keine externen Sensoren konfiguriert</p>
          <p className="text-xs text-muted-foreground mt-1">
            Füge Sensoren hinzu, um Home Assistant oder Wetterdaten zu nutzen
          </p>
        </div>
      )}

      {showDiscover && haStatus?.available && (
        <div className="mt-4 border rounded-xl p-4 bg-muted/20">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Scan className="w-4 h-4" />
            Entdeckte Home Assistant Sensoren
            {haSensors && haSensors.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                ({filteredHaSensors.length} von {haSensors.length})
              </span>
            )}
          </h4>
          {haLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : haSensors && haSensors.length > 0 ? (
            <>
              <div className="relative mb-2">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={haSearchQuery}
                  onChange={(e) => setHaSearchQuery(e.target.value)}
                  placeholder="Sensor suchen (Name, Entity ID, Typ)..."
                  className="pl-8"
                  data-testid="input-search-ha-sensors"
                />
              </div>
              {filteredHaSensors.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Sensoren gefunden für "{haSearchQuery}"</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredHaSensors.map((sensor: any) => (
                    <div key={sensor.entity_id} className="flex items-center justify-between p-2 bg-card rounded border">
                      <div>
                        <div className="text-sm font-medium">{sensor.name}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{sensor.entity_id}</span>
                          <span className="ml-2">{sensor.sensor_type}</span>
                          {sensor.last_value && (
                            <span className="ml-2 font-mono">{sensor.last_value} {sensor.unit}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleImport(sensor)}
                        disabled={importSensor.isPending}
                      >
                        <Import className="w-3 h-3 mr-1" /> Importieren
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Keine passenden Sensoren gefunden</p>
          )}
        </div>
      )}
    </div>
  );
}
