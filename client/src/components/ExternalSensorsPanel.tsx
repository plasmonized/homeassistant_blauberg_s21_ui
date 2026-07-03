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
} from "lucide-react";

const sourceOptions = [
  { value: "homeassistant", label: "Home Assistant", icon: Home },
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

function SensorTypeLabel({ type }: { type: string }) {
  const opt = sensorTypeOptions.find((o) => o.value === type);
  return (
    <span className="flex items-center gap-1">
      {opt ? <opt.icon className="w-3 h-3" /> : null}
      {opt?.label ?? type}
    </span>
  );
}

interface EditSensorDialogProps {
  sensor: ExternalSensor;
  deviceId: number;
  onClose: () => void;
}

function EditSensorDialog({ sensor, deviceId, onClose }: EditSensorDialogProps) {
  const [name, setName] = useState(sensor.name);
  const [entityId, setEntityId] = useState(sensor.entityId ?? "");
  const [sensorType, setSensorType] = useState(sensor.sensorType);
  const [unit, setUnit] = useState(sensor.unit ?? "");
  const updateSensor = useUpdateExternalSensor(deviceId);

  const handleSave = () => {
    updateSensor.mutate(
      {
        id: sensor.id,
        name: name.trim() || sensor.name,
        entityId: entityId.trim() || null,
        sensorType: sensorType as ExternalSensor["sensorType"],
        unit: unit.trim() || null,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sensor bearbeiten</DialogTitle>
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
            <Select value={sensorType} onValueChange={(v) => setSensorType(v as any)}>
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
              disabled={updateSensor.isPending}
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
  const [sourceType, setSourceType] = useState<"homeassistant" | "openweather" | "manual">("homeassistant");
  const [entityId, setEntityId] = useState("");
  const [sensorType, setSensorType] = useState("temperature");
  const [unit, setUnit] = useState("°C");

  const handleCreate = () => {
    if (!name.trim()) return;
    createSensor.mutate(
      { name, deviceId, sourceType, entityId: entityId || null, sensorType: sensorType as any, unit },
      {
        onSuccess: () => {
          setIsOpen(false);
          setName("");
          setEntityId("");
          setUnit("°C");
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

  return (
    <div className="space-y-4">
      {/* Edit dialog (rendered outside list to avoid nesting) */}
      {editingSensor && (
        <EditSensorDialog
          sensor={editingSensor}
          deviceId={deviceId}
          onClose={() => setEditingSensor(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Externe Sensoren</h3>
          <p className="text-sm text-muted-foreground">
            Home Assistant, Wetterstationen und andere externe Datenquellen
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
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-sensor">
                <Plus className="w-4 h-4 mr-1" /> Sensor hinzufügen
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Externen Sensor hinzufügen</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="sensor-name">Name</Label>
                  <Input
                    id="sensor-name"
                    placeholder="z.B. Außentemperatur Wetterstation"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="input-sensor-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Datenquelle</Label>
                  <Select value={sourceType} onValueChange={(v: string) => setSourceType(v as any)}>
                    <SelectTrigger>
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

                <div className="space-y-2">
                  <Label>Sensor-Typ</Label>
                  <p className="text-xs text-muted-foreground">
                    Legt fest, wie die App diesen Sensor für Regelungen verwendet.
                  </p>
                  <Select value={sensorType} onValueChange={(v: string) => setSensorType(v)}>
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
                  disabled={createSensor.isPending || !name.trim()}
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
          {sensors.map((sensor: ExternalSensor) => (
            <Card key={sensor.id} className="p-4" data-testid={`card-sensor-${sensor.id}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-muted shrink-0">
                    <Radio className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{sensor.name}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {sourceOptions.find((o) => o.value === sensor.sourceType)?.label}
                      </Badge>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        <SensorTypeLabel type={sensor.sensorType} />
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {sensor.entityId && (
                        <span className="font-mono mr-2">{sensor.entityId}</span>
                      )}
                      {sensor.unit && <span>({sensor.unit})</span>}
                    </div>
                    {sensor.lastValue !== null && (
                      <div className="text-xs font-mono mt-0.5 text-foreground/70">
                        Letzter Wert: <span className="font-semibold">{sensor.lastValue} {sensor.unit}</span>
                        {sensor.updatedAt && (
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
          ))}
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

      {/* Home Assistant Discovery Panel */}
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
