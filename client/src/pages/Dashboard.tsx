import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useDevices, useCreateDevice } from "@/hooks/use-devices";
import { AddDeviceDialog } from "@/components/AddDeviceDialog";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Server, Cpu, Activity, Wifi, WifiOff, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
  const createDevice = useCreateDevice();
  const simulatorRunning = useSimulatorStatus();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (devices && devices.length === 1) {
      navigate(`/devices/${devices[0].id}`);
    }
  }, [devices]);

  if (isLoading || (devices && devices.length === 1)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Activity className="w-10 h-10 text-muted-foreground animate-pulse" />
      </div>
    );
  }

  const hasSimulatedDevice = devices?.some(d => d.ip === "127.0.0.1" && d.port === 5502);

  if (!devices || devices.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b border-border/40 bg-card/30 backdrop-blur-md">
          <div className="container mx-auto px-4 py-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">S21 Controller</h1>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-sm w-full">
            <div className="p-8 bg-card rounded-2xl border border-dashed border-border text-center">
              <Server className="w-14 h-14 text-muted-foreground mx-auto mb-4 opacity-40" />
              <h2 className="text-xl font-semibold mb-2">Anlage einrichten</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Verbinde deine Blauberg S21 Lüftungsanlage um sie zu steuern und zu überwachen.
              </p>
              <div className="flex flex-col gap-3">
                <AddDeviceDialog />
                {simulatorRunning && !hasSimulatedDevice && (
                  <Button
                    variant="outline"
                    onClick={() => createDevice.mutate({ name: "S21 Simulator", ip: "127.0.0.1", port: 5502, slaveId: 1 })}
                    disabled={createDevice.isPending}
                    className="gap-2 border-dashed"
                    data-testid="button-add-simulator"
                  >
                    <Cpu className="w-4 h-4" />
                    {createDevice.isPending ? "Wird hinzugefügt..." : "Simulator hinzufügen"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 bg-card/30 backdrop-blur-md sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">S21 Controller</h1>
              <p className="text-xs text-muted-foreground">Anlage auswählen</p>
            </div>
          </div>
          <AddDeviceDialog />
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device) => (
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
                  {device.ip}:{device.port}
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="text-xs text-muted-foreground">
                  Zuletzt gesehen: {device.lastSeen ? formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true }) : "Nie"}
                </div>
              </CardContent>
              <CardFooter className="pt-2 border-t border-border/50 bg-muted/20">
                <Link href={`/devices/${device.id}`} className="w-full">
                  <Button size="sm" className="gap-2 w-full group-hover:bg-primary group-hover:text-primary-foreground">
                    Auswählen <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
