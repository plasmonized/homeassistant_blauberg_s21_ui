import { useState } from "react";
import { useExternalSensors, useCreateExternalSensor, useDeleteExternalSensor, useHomeAssistantStatus, useHomeAssistantSensors, useImportHomeAssistantSensor, useSyncHomeAssistantSensors } from "@/hooks/use-external-sensors";
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
import { Plus, Trash2, Radio, Home, Cloud, Thermometer, Droplets, Wind, Gauge, CloudRain, RefreshCw, Import, Scan } from "lucide-react";

const sourceOptions = [
  { value: "homeassistant", label: "Home Assistant", icon: Home },
];

const sensorTypeOptions = [
  { value: "temperature", label: "Temperatur", icon: Thermometer },
  { value: "humidity", label: "Luftfeuchtigkeit", icon: Droplets },
  { value: "co2", label: "CO₂", icon: Wind },
  { value: "forecast_temp", label: "Vorhersage-Temperatur", icon: CloudRain },
  { value: "pressure", label: "Luftdruck", icon: Gauge },
  { value: "wind_speed", label: "Windgeschwindigkeit", icon: Wind },
];

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
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState("homeassistant");
  const [entityId, setEntityId] = useState("");
  const [sensorType, setSensorType] = useState("temperature");
  const [unit, setUnit] = useState("°C");

  const handleCreate = () => {
    if (!name.trim()) return;
    createSensor.mutate(
      { name, sourceType, entityId: entityId || null, sensorType, unit },
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
    await discoverHaSensors();
  };

  const handleImport = (sensor: any) => {
    importSensor.mutate({
      entityId: sensor.entity_id,
      sensorType: sensor.sensor_type,
      name: sensor.name,
    });
  };

  return (
    <div className="space-y-4">
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
              <Button size="sm">
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
                />
              </div>

              <div className="space-y-2">
                <Label>Datenquelle</Label>
                <Select value={sourceType} onValueChange={setSourceType}>
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
                <Label htmlFor="entity-id">Entity ID / API-Endpoint</Label>
                <Input
                  id="entity-id"
                  placeholder="sensor.outdoor_temp"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  z.B. <code className="bg-muted px-1 rounded">sensor.outdoor_temp</code> (Home Assistant)
                  oder <code className="bg-muted px-1 rounded">/weather/forecast</code> (API)
                </p>
              </div>

              <div className="space-y-2">
                <Label>Sensor-Typ</Label>
                <Select value={sensorType} onValueChange={setSensorType}>
                  <SelectTrigger>
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
                />
              </div>

              <Button
                onClick={handleCreate}
                disabled={createSensor.isPending || !name.trim()}
                className="w-full"
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
          {sensors.map((sensor) => (
            <Card key={sensor.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Radio className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{sensor.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {sourceOptions.find((o) => o.value === sensor.sourceType)?.label}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {sensor.entityId && (
                      <span className="font-mono mr-2">{sensor.entityId}</span>
                    )}
                    <span>
                      {sensorTypeOptions.find((o) => o.value === sensor.sensorType)?.label}
                    </span>
                    {sensor.unit && (
                      <span className="ml-1">({sensor.unit})</span>
                    )}
                  </div>
                  {sensor.lastValue !== null && (
                    <div className="text-xs font-mono mt-0.5">
                      Letzter Wert: {sensor.lastValue} {sensor.unit}
                      {sensor.updatedAt && (
                        <span className="text-muted-foreground ml-2">
                          {new Date(sensor.updatedAt).toLocaleString("de-DE")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => deleteSensor.mutate(sensor.id)}
                disabled={deleteSensor.isPending}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
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
          </h4>
          {haLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : haSensors && haSensors.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {haSensors.map((sensor: any) => (
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
          ) : (
            <p className="text-sm text-muted-foreground">Keine passenden Sensoren gefunden</p>
          )}
        </div>
      )}
    </div>
  );
}
