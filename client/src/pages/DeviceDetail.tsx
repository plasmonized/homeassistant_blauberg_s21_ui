import { useParams, Link } from "wouter";
import { useDevice, useConnectDevice, usePollDevice } from "@/hooks/use-devices";
import { useRegisters } from "@/hooks/use-registers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, RefreshCw, Power, AlertCircle, Settings2, Sliders, LayoutDashboard, Bot, CheckCircle2, Clock, Thermometer, Droplets, Wind, Sun, Moon } from "lucide-react";
import { AddRegisterDialog } from "@/components/AddRegisterDialog";
import { RegisterCard } from "@/components/RegisterCard";
import { TemperatureDiagram } from "@/components/TemperatureDiagram";
import { AutomationPanel } from "@/components/AutomationPanel";
import { ExternalSensorsPanel } from "@/components/ExternalSensorsPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { useControlProfiles } from "@/hooks/use-control-profiles";
import { formatDistanceToNow } from "date-fns";
import type { ControlProfile } from "@shared/schema";

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
  
  const { data: profiles } = useControlProfiles(deviceId);
  const activeProfiles: ControlProfile[] = (profiles ?? []).filter((p: ControlProfile) => p.enabled);

  const connectMutation = useConnectDevice();
  const pollMutation = usePollDevice();

  if (isDeviceLoading) return <div className="p-8"><Skeleton className="h-12 w-64 mb-4" /><Skeleton className="h-64 w-full" /></div>;
  if (!device) return <div className="p-8 text-center text-muted-foreground">Device not found</div>;

  const handleConnect = () => connectMutation.mutate(deviceId);
  const handlePoll = () => pollMutation.mutate(deviceId);

  // Group registers by type/intent
  const controls = registers?.filter(r => (r.type === 'coil' || r.isWritable));
  const sensors = registers?.filter(r => (r.type === 'input' || r.type === 'discrete' || (!r.isWritable && r.type === 'holding')));

  // Group controls by category
  const systemControls = controls?.filter(r => r.name.includes('System') || r.name.includes('Standby'));
  const ventilationControls = controls?.filter(r => r.name.includes('Fan') || r.name.includes('Operation') || r.name.includes('Bypass'));
  const timerControls = controls?.filter(r => r.name.includes('Boost') || r.name.includes('Timer'));
  const otherControls = controls?.filter(r => !systemControls?.includes(r) && !ventilationControls?.includes(r) && !timerControls?.includes(r));

  // Group sensors by category
  const tempSensors = sensors?.filter(r => r.name.includes('Temperature'));
  const airQualitySensors = sensors?.filter(r => r.name.includes('Humidity') || r.name.includes('CO2'));
  const statusSensors = sensors?.filter(r => r.name.includes('Filter') || r.name.includes('Timer'));
  const otherSensors = sensors?.filter(r => !tempSensors?.includes(r) && !airQualitySensors?.includes(r) && !statusSensors?.includes(r));

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-lg sticky top-0 z-20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
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
                {timerControls && timerControls.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Timer</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {timerControls.map(register => (
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
          </TabsContent>

          <TabsContent value="automation">
            <AutomationPanel deviceId={deviceId} />
          </TabsContent>

          <TabsContent value="einstellungen" className="space-y-8">
            {/* Sensoren */}
            <div className="space-y-4">
              <h3 className="text-base font-semibold">Sensoren</h3>
              {isRegistersLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}
                </div>
              ) : sensors && sensors.length > 0 ? (
                <div className="space-y-6">
                  {tempSensors && tempSensors.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Temperaturen</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {tempSensors.map(register => (
                          <RegisterCard key={register.id} register={register} deviceId={deviceId} />
                        ))}
                      </div>
                    </div>
                  )}
                  {airQualitySensors && airQualitySensors.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Luftqualität</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {airQualitySensors.map(register => (
                          <RegisterCard key={register.id} register={register} deviceId={deviceId} />
                        ))}
                      </div>
                    </div>
                  )}
                  {statusSensors && statusSensors.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Status</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {statusSensors.map(register => (
                          <RegisterCard key={register.id} register={register} deviceId={deviceId} />
                        ))}
                      </div>
                    </div>
                  )}
                  {otherSensors && otherSensors.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Sonstige</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {otherSensors.map(register => (
                          <RegisterCard key={register.id} register={register} deviceId={deviceId} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-10 border border-dashed rounded-xl opacity-60">
                  <p>Keine Sensor-Register definiert.</p>
                  <p className="text-sm">Fügen Sie Register hinzu, um Temperaturen, Feuchtigkeit oder Status zu überwachen.</p>
                </div>
              )}
            </div>

            <Separator />

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
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
