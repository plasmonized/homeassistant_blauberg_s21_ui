import { useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useDevice, useConnectDevice, usePollDevice, useDevices, useDeleteDevice } from "@/hooks/use-devices";
import { useRegisters } from "@/hooks/use-registers";
import { useExternalSensors } from "@/hooks/use-external-sensors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Power, AlertCircle, Settings2, Sliders, LayoutDashboard, Bot, CheckCircle2, Clock, Thermometer, Droplets, Wind, Sun, Moon, Trash2, Radio } from "lucide-react";
import { AddRegisterDialog } from "@/components/AddRegisterDialog";
import { AddDeviceDialog } from "@/components/AddDeviceDialog";
import { RegisterCard } from "@/components/RegisterCard";
import { TemperatureDiagram } from "@/components/TemperatureDiagram";
import { AutomationPanel } from "@/components/AutomationPanel";
import { ExternalSensorsPanel } from "@/components/ExternalSensorsPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { useControlProfiles } from "@/hooks/use-control-profiles";
import { formatDistanceToNow } from "date-fns";
import type { ControlProfile, ExternalSensor } from "@shared/schema";

function ExternalSensorValueCard({ sensor }: { sensor: ExternalSensor }) {
  const isHumidity = sensor.sensorType.includes("humidity");
  const isCo2 = sensor.sensorType === "co2";
  const Icon = isCo2 ? Wind : Droplets;
  const colorClass = isCo2 ? "text-green-400" : "text-blue-400";

  return (
    <Card className="border-border/40 bg-card/50 relative group" data-testid={`card-ext-sensor-${sensor.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${colorClass}`} />
            <span className="text-sm font-medium truncate">{sensor.name}</span>
          </div>
          <Badge variant="outline" className="text-[10px] shrink-0 gap-1">
            <Radio className="w-2.5 h-2.5" /> extern
          </Badge>
        </div>
        <div className={`text-2xl font-bold font-mono ${colorClass}`}>
          {sensor.lastValue ?? "–"}
          {sensor.unit && <span className="text-sm font-normal text-muted-foreground ml-1">{sensor.unit}</span>}
        </div>
        {sensor.entityId && (
          <div className="text-[10px] text-muted-foreground font-mono mt-1 truncate">{sensor.entityId}</div>
        )}
        {sensor.updatedAt && (
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {formatDistanceToNow(new Date(sensor.updatedAt))} ago
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const schemaTypeLabel: Record<string, string> = {
  temperature_control: "Temperaturregelung",
  humidity_control: "Feuchtigkeitsregelung",
  co2_control: "CO₂-Regelung",
  summer_winter: "Sommer/Winter",
  night_setback: "Nachtabsenkung",
  weather_compensated: "Witterungsgeführt",
};

const schemaTypeIcon: Record<string, JSX.Element> = {
  temperature_control: <Thermometer className="w-4 h-4 text-orange-400" />,
  humidity_control: <Droplets className="w-4 h-4 text-blue-400" />,
  co2_control: <Wind className="w-4 h-4 text-green-400" />,
  summer_winter: <Sun className="w-4 h-4 text-amber-400" />,
  night_setback: <Moon className="w-4 h-4 text-indigo-400" />,
  weather_compensated: <Wind className="w-4 h-4 text-cyan-400" />,
};

function ActiveProfileCard({ profile }: { profile: ControlProfile }) {
  const params = profile.parameters as Record<string, any>;
  const timeRange = profile.timeFrom && profile.timeTo
    ? `${profile.timeFrom} – ${profile.timeTo}`
    : null;
  const seasonLabel: Record<string, string> = { all: "Ganzjährig", summer: "Sommer", winter: "Winter" };

  return (
    <Card className="border-border/40 bg-card/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            {schemaTypeIcon[profile.schemaType] ?? <Bot className="w-4 h-4 text-primary" />}
            <span className="font-medium text-sm">{profile.name}</span>
          </div>
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
        </div>
        <div className="text-xs text-muted-foreground mb-2">
          {schemaTypeLabel[profile.schemaType] ?? profile.schemaType}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {params?.targetTemp !== undefined && (
            <Badge variant="outline" className="text-[11px]">Soll {params.targetTemp} °C</Badge>
          )}
          {params?.targetHumidity !== undefined && (
            <Badge variant="outline" className="text-[11px]">Soll {params.targetHumidity} %</Badge>
          )}
          {params?.targetCo2 !== undefined && (
            <Badge variant="outline" className="text-[11px]">Soll {params.targetCo2} ppm</Badge>
          )}
          {params?.nightSetpointTemp !== undefined && (
            <Badge variant="outline" className="text-[11px]">Nacht {params.nightSetpointTemp} °C</Badge>
          )}
          {timeRange && (
            <Badge variant="secondary" className="text-[11px] gap-1">
              <Clock className="w-3 h-3" />{timeRange}
            </Badge>
          )}
          {profile.season && profile.season !== "all" && (
            <Badge variant="secondary" className="text-[11px]">{seasonLabel[profile.season]}</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DeviceDetail() {
  const { id } = useParams();
  const deviceId = Number(id);
  
  const { data: device, isLoading: isDeviceLoading } = useDevice(deviceId);
  const { data: registers, isLoading: isRegistersLoading } = useRegisters(deviceId);
  const { data: externalSensors } = useExternalSensors(deviceId);

  const { data: profiles } = useControlProfiles(deviceId);
  const activeProfiles: ControlProfile[] = (profiles ?? []).filter((p: ControlProfile) => p.enabled);

  const connectMutation = useConnectDevice();
  const pollMutation = usePollDevice();
  const { data: allDevices } = useDevices();
  const deleteDevice = useDeleteDevice();
  const [, navigate] = useLocation();
  const otherDevices = (allDevices ?? []).filter(d => d.id !== deviceId);

  useEffect(() => {
    if (!isDeviceLoading && !device) {
      navigate("/");
    }
  }, [isDeviceLoading, device]);

  if (isDeviceLoading || !device) return <div className="p-8"><Skeleton className="h-12 w-64 mb-4" /><Skeleton className="h-64 w-full" /></div>;

  const handleConnect = () => connectMutation.mutate(deviceId);
  const handlePoll = () => pollMutation.mutate(deviceId);

  const hasTag = (r: { tags?: string[] | null }, ...t: string[]) =>
    t.some((x) => (r.tags ?? []).includes(x));

  // Group registers by type/intent — tag-based so renamed registers still land in the right group
  const controls = registers?.filter(r => r.isWritable || r.type === 'coil');
  const sensors = registers?.filter(r => !r.isWritable && r.type !== 'coil');

  // Group controls by category using tags
  const systemControls    = controls?.filter(r => hasTag(r, 'power'));
  // Sourced from all registers (not just `controls`) so the read-only Bypass Status
  // register renders next to the Bypass Control card instead of a separate sensors group.
  const ventilationControls = registers?.filter(r => hasTag(r, 'fan', 'mode', 'bypass') && !hasTag(r, 'power'));
  const boostControls     = controls?.filter(r => hasTag(r, 'boost'));
  const otherControls     = controls?.filter(r =>
    !systemControls?.includes(r) && !ventilationControls?.includes(r) && !boostControls?.includes(r));

  // External sensors that actively provide values (lastValue != null)
  // These replace S21 register cards for sensor types the S21 doesn't have built-in.
  const activeExtByType = (type: string): ExternalSensor | undefined =>
    (externalSensors as ExternalSensor[] | undefined)?.find(
      (s) => s.sensorType === type && s.lastValue !== null
    );
  const extCo2        = activeExtByType("co2");
  const extOutdoorHum = activeExtByType("outdoor_humidity");

  // Group sensors by category using tags — exclude registers overridden by an external sensor
  const tempSensors       = sensors?.filter(r => hasTag(r, 'temperature'));
  const airQualitySensors = sensors?.filter(r => {
    if (!hasTag(r, 'humidity', 'co2')) return false;
    // Hide CO2 register when an external CO2 sensor is active
    if (extCo2 && hasTag(r, 'co2')) return false;
    // Hide outdoor humidity register when an external outdoor_humidity sensor is active
    if (extOutdoorHum && hasTag(r, 'humidity') && hasTag(r, 'outdoor')) return false;
    return true;
  });
  // Bypass status is already shown alongside Bypass Control in ventilationControls above.
  const statusSensors     = sensors?.filter(r => hasTag(r, 'filter', 'status') && !hasTag(r, 'temperature', 'humidity', 'co2', 'bypass'));
  const otherSensors      = sensors?.filter(r =>
    !tempSensors?.includes(r) && !airQualitySensors?.includes(r) && !statusSensors?.includes(r) && !hasTag(r, 'bypass'));

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-lg sticky top-0 z-20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight">{device.name}</h1>
                  <Badge variant={device.isConnected ? "success" : "destructive"}>
                    {device.isConnected ? "Online" : "Offline"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 font-mono">
                  <span>{device.ip}:{device.port}</span>
                  <span>•</span>
                  <span>Last seen: {device.lastSeen ? formatDistanceToNow(new Date(device.lastSeen)) + " ago" : "Never"}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleConnect}
                disabled={connectMutation.isPending || !!device.isConnected}
                className={device.isConnected ? "border-green-900/50 text-green-500 bg-green-900/10" : ""}
              >
                <Power className="w-4 h-4 mr-2" />
                {device.isConnected ? "Connected" : "Connect"}
              </Button>
              
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={handlePoll}
                disabled={pollMutation.isPending || !device.isConnected}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${pollMutation.isPending ? "animate-spin" : ""}`} />
                Poll Now
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!device.isConnected && (
          <Alert variant="destructive" className="mb-6 bg-red-950/20 border-red-900/50">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Connection Lost</AlertTitle>
            <AlertDescription>
              The device is currently unreachable. Check your network connection or IP settings.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <div className="flex justify-between items-center">
            <TabsList className="bg-muted/40 p-1">
              <TabsTrigger value="overview" className="gap-2">
                <LayoutDashboard className="w-4 h-4" /> Übersicht
              </TabsTrigger>
              <TabsTrigger value="controls" className="gap-2">
                <Sliders className="w-4 h-4" /> Controls
              </TabsTrigger>
              <TabsTrigger value="automation" className="gap-2">
                <Bot className="w-4 h-4" /> Automatisierung
              </TabsTrigger>
              <TabsTrigger value="einstellungen" className="gap-2">
                <Settings2 className="w-4 h-4" /> Einstellungen
              </TabsTrigger>
            </TabsList>
            
            <AddRegisterDialog deviceId={deviceId} />
          </div>

          <TabsContent value="overview" className="space-y-6">
            <TemperatureDiagram registers={registers} isLoading={isRegistersLoading} />

            {/* Aktive Automatisierungen */}
            {activeProfiles.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Bot className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Aktive Regelungen</h3>
                  <Badge variant="secondary" className="text-xs">{activeProfiles.length}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeProfiles.map((profile) => (
                    <ActiveProfileCard key={profile.id} profile={profile} />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="controls" className="space-y-4">
            {isRegistersLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}
              </div>
            ) : controls && controls.length > 0 ? (
              <div className="space-y-6">
                {systemControls && systemControls.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">System</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {systemControls.map(register => (
                        <RegisterCard key={register.id} register={register} deviceId={deviceId} />
                      ))}
                    </div>
                  </div>
                )}
                {ventilationControls && ventilationControls.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Lüftung</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {ventilationControls.map(register => (
                        <RegisterCard key={register.id} register={register} deviceId={deviceId} />
                      ))}
                    </div>
                  </div>
                )}
                {boostControls && boostControls.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Boost</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {boostControls.map(register => (
                        <RegisterCard key={register.id} register={register} deviceId={deviceId} />
                      ))}
                    </div>
                  </div>
                )}
                {otherControls && otherControls.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Sonstige</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {otherControls.map(register => (
                        <RegisterCard key={register.id} register={register} deviceId={deviceId} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-20 border border-dashed rounded-xl opacity-60">
                <p>Keine steuerbaren Register definiert.</p>
                <p className="text-sm">Fügen Sie Register hinzu, um Lüftergeschwindigkeit, Modus oder Relais zu steuern.</p>
              </div>
            )}

            {/* Sensoren */}
            {sensors && sensors.length > 0 && (
              <>
                <Separator />
                <div className="space-y-6">
                  {tempSensors && tempSensors.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Temperaturen</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {tempSensors.map(register => (
                          <RegisterCard key={register.id} register={register} deviceId={deviceId} />
                        ))}
                      </div>
                    </div>
                  )}
                  {((airQualitySensors && airQualitySensors.length > 0) || extCo2 || extOutdoorHum) && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Luftqualität</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {/* External sensor cards first (replace missing S21 hardware) */}
                        {extCo2 && <ExternalSensorValueCard sensor={extCo2} />}
                        {extOutdoorHum && <ExternalSensorValueCard sensor={extOutdoorHum} />}
                        {/* Remaining S21 register cards (not overridden) */}
                        {airQualitySensors?.map(register => (
                          <RegisterCard key={register.id} register={register} deviceId={deviceId} />
                        ))}
                      </div>
                    </div>
                  )}
                  {statusSensors && statusSensors.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Status</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {statusSensors.map(register => (
                          <RegisterCard key={register.id} register={register} deviceId={deviceId} />
                        ))}
                      </div>
                    </div>
                  )}
                  {otherSensors && otherSensors.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Sonstige Sensoren</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {otherSensors.map(register => (
                          <RegisterCard key={register.id} register={register} deviceId={deviceId} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="automation">
            <AutomationPanel deviceId={deviceId} />
          </TabsContent>

          <TabsContent value="einstellungen" className="space-y-8">
            {/* Externe Sensoren */}
            <ExternalSensorsPanel deviceId={deviceId} />

            <Separator />

            {/* Geräte-Konfiguration */}
            <div>
              <h3 className="text-base font-semibold mb-4">Geräte-Konfiguration</h3>
              <div className="bg-card rounded-xl border p-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">IP-Adresse:</span>
                    <div className="font-mono mt-1 p-2 bg-muted rounded">{device.ip}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Port:</span>
                    <div className="font-mono mt-1 p-2 bg-muted rounded">{device.port}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Slave ID:</span>
                    <div className="font-mono mt-1 p-2 bg-muted rounded">{device.slaveId}</div>
                  </div>
                </div>
              </div>
            </div>
            <Separator />

            {/* Anlage wechseln (nur bei mehreren Anlagen) */}
            {otherDevices.length > 0 && (
              <div>
                <h3 className="text-base font-semibold mb-3">Anlage wechseln</h3>
                <div className="space-y-2">
                  {otherDevices.map(d => (
                    <Link key={d.id} href={`/devices/${d.id}`}>
                      <Button variant="outline" className="w-full justify-between" size="sm" data-testid={`button-switch-device-${d.id}`}>
                        {d.name}
                        <Badge variant={d.isConnected ? "success" : "secondary"} className="text-xs">
                          {d.isConnected ? "Online" : "Offline"}
                        </Badge>
                      </Button>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Weitere Anlage hinzufügen */}
            <div>
              <h3 className="text-base font-semibold mb-3">Weitere Anlage hinzufügen</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Füge eine weitere S21 Lüftungsanlage hinzu. Du kannst jederzeit im Einstellungen-Tab zwischen Anlagen wechseln.
              </p>
              <AddDeviceDialog />
            </div>

            <Separator />

            {/* Gefahrenzone */}
            <div>
              <h3 className="text-base font-semibold text-destructive mb-3">Gefahrenzone</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Die Anlage wird aus der App entfernt. Alle gespeicherten Register, Automatisierungen und Profile werden gelöscht.
              </p>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteDevice.isPending}
                data-testid="button-delete-device"
                onClick={() => {
                  if (confirm(`"${device.name}" wirklich entfernen?`)) {
                    deleteDevice.mutate(deviceId, {
                      onSuccess: () => navigate("/"),
                    });
                  }
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {deleteDevice.isPending ? "Wird entfernt..." : "Anlage entfernen"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
