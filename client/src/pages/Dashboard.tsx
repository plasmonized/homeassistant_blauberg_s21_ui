import { useDevices, useDeleteDevice, useCreateDevice } from "@/hooks/use-devices";
import { AddDeviceDialog } from "@/components/AddDeviceDialog";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, Trash2, ArrowRight, Activity, Wifi, WifiOff, Cpu } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";

function useSimulatorStatus() {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    fetch("/api/simulator/status")
      .then(r => r.json())
      .then(d => setRunning(d.running))
      .catch(() => setRunning(false));
  }, []);
  return running;
}

export default function Dashboard() {
  const { data: devices, isLoading } = useDevices();
  const deleteDevice = useDeleteDevice();
  const createDevice = useCreateDevice();
  const simulatorRunning = useSimulatorStatus();

  const hasSimulatedDevice = devices?.some(d => d.ip === "127.0.0.1" && d.port === 5502);

  const handleCreateSimulated = () => {
    createDevice.mutate({
      name: "S21 Simulator",
      ip: "127.0.0.1",
      port: 5502,
      slaveId: 1,
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-8 space-y-8">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/30 backdrop-blur-md sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">S21 Controller</h1>
              <p className="text-xs text-muted-foreground">Modbus Automation Dashboard</p>
            </div>
          </div>
          <AddDeviceDialog />
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-2">Connected Devices</h2>
          <p className="text-muted-foreground">Manage your Blauberg ventilation units.</p>
        </div>

        {devices?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-xl bg-card/20">
            <Server className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium">No Devices Found</h3>
            <p className="text-sm text-muted-foreground mb-6">Add your first S21 controller or try the simulator.</p>
            <div className="flex gap-3">
              <AddDeviceDialog />
              {simulatorRunning && !hasSimulatedDevice && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateSimulated}
                  disabled={createDevice.isPending}
                  className="gap-2 border-dashed"
                  data-testid="button-add-simulator"
                >
                  <Cpu className="w-4 h-4" />
                  {createDevice.isPending ? "Adding..." : "Add Simulated Device"}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {devices?.map((device) => (
              <Card key={device.id} className="group relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{device.name}</CardTitle>
                    <Badge variant={device.isConnected ? "success" : "secondary"} className="gap-1">
                      {device.isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {device.isConnected ? "Online" : "Offline"}
                    </Badge>
                  </div>
                  <CardDescription className="font-mono text-xs mt-1">
                    {device.ip}:{device.port} <span className="text-muted-foreground/50 mx-1">|</span> Slave #{device.slaveId}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="pb-4">
                  <div className="text-xs text-muted-foreground">
                    Last seen: {device.lastSeen ? formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true }) : "Never"}
                  </div>
                </CardContent>
                
                <CardFooter className="flex justify-between pt-2 border-t border-border/50 bg-muted/20">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 -ml-2"
                    onClick={() => {
                      if (confirm("Delete this device?")) deleteDevice.mutate(device.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  
                  <Link href={`/devices/${device.id}`}>
                    <Button size="sm" className="gap-2 group-hover:bg-primary group-hover:text-primary-foreground">
                      Control Panel <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
