import { useParams, Link } from "wouter";
import { useDevice, useConnectDevice, usePollDevice } from "@/hooks/use-devices";
import { useRegisters } from "@/hooks/use-registers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, RefreshCw, Power, AlertCircle, Settings2, Sliders, Activity } from "lucide-react";
import { AddRegisterDialog } from "@/components/AddRegisterDialog";
import { RegisterCard } from "@/components/RegisterCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDistanceToNow } from "date-fns";

export default function DeviceDetail() {
  const { id } = useParams();
  const deviceId = Number(id);
  
  const { data: device, isLoading: isDeviceLoading } = useDevice(deviceId);
  const { data: registers, isLoading: isRegistersLoading } = useRegisters(deviceId);
  
  const connectMutation = useConnectDevice();
  const pollMutation = usePollDevice();

  if (isDeviceLoading) return <div className="p-8"><Skeleton className="h-12 w-64 mb-4" /><Skeleton className="h-64 w-full" /></div>;
  if (!device) return <div className="p-8 text-center text-muted-foreground">Device not found</div>;

  const handleConnect = () => connectMutation.mutate(deviceId);
  const handlePoll = () => pollMutation.mutate(deviceId);

  // Group registers by type/intent
  const controls = registers?.filter(r => (r.type === 'coil' || r.isWritable));
  const sensors = registers?.filter(r => (r.type === 'input' || r.type === 'discrete' || (!r.isWritable && r.type === 'holding')));

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
                disabled={connectMutation.isPending || device.isConnected}
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

        <Tabs defaultValue="controls" className="space-y-6">
          <div className="flex justify-between items-center">
            <TabsList className="bg-muted/40 p-1">
              <TabsTrigger value="controls" className="gap-2">
                <Sliders className="w-4 h-4" /> Controls
              </TabsTrigger>
              <TabsTrigger value="sensors" className="gap-2">
                <Activity className="w-4 h-4" /> Sensors
              </TabsTrigger>
              <TabsTrigger value="config" className="gap-2">
                <Settings2 className="w-4 h-4" /> Configuration
              </TabsTrigger>
            </TabsList>
            
            <AddRegisterDialog deviceId={deviceId} />
          </div>

          <TabsContent value="controls" className="space-y-4">
            {isRegistersLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}
              </div>
            ) : controls && controls.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {controls.map(register => (
                  <RegisterCard key={register.id} register={register} deviceId={deviceId} />
                ))}
              </div>
            ) : (
              <div className="text-center py-20 border border-dashed rounded-xl opacity-60">
                <p>No controllable registers defined.</p>
                <p className="text-sm">Add registers to control fan speed, mode, or relays.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="sensors" className="space-y-4">
            {isRegistersLoading ? (
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}
              </div>
            ) : sensors && sensors.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sensors.map(register => (
                  <RegisterCard key={register.id} register={register} deviceId={deviceId} />
                ))}
              </div>
            ) : (
              <div className="text-center py-20 border border-dashed rounded-xl opacity-60">
                <p>No sensor registers defined.</p>
                <p className="text-sm">Add registers to monitor temperatures, humidity, or status flags.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="config">
             <div className="bg-card rounded-xl border p-6">
                <h3 className="text-lg font-medium mb-4">Device Configuration</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                   <div>
                      <span className="text-muted-foreground">IP Address:</span>
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
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
