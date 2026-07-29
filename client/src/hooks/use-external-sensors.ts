import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type InsertExternalSensor } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { resolveUrl } from "@/lib/queryClient";

function sensorQK(deviceId: number) {
  return ["/api/devices", deviceId, "external-sensors"];
}

export function useExternalSensors(deviceId: number) {
  return useQuery({
    queryKey: sensorQK(deviceId),
    queryFn: async () => {
      const res = await fetch(resolveUrl(`/api/devices/${deviceId}/external-sensors`));
      if (!res.ok) throw new Error("Failed to fetch external sensors");
      return res.json();
    },
    // Re-fetch every 60 s so stale badges appear/disappear without a page reload.
    refetchInterval: 60_000,
  });
}

export function useCreateExternalSensor(deviceId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertExternalSensor) => {
      const res = await fetch(resolveUrl(`/api/devices/${deviceId}/external-sensors`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create sensor");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sensorQK(deviceId) });
      toast({ title: "Sensor hinzugefügt", description: "Externer Sensor wurde gespeichert" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    },
  });
}

export function useUpdateExternalSensor(deviceId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertExternalSensor>) => {
      const res = await fetch(resolveUrl(`/api/external-sensors/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error((error as any).message || "Failed to update sensor");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sensorQK(deviceId) });
      toast({ title: "Sensor aktualisiert" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    },
  });
}

export function useDeleteExternalSensor(deviceId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(resolveUrl(`/api/external-sensors/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete sensor");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sensorQK(deviceId) });
      toast({ title: "Sensor gelöscht" });
    },
  });
}

export function useUpdateExternalSensorValue() {
  return useMutation({
    mutationFn: async ({ id, value }: { id: number; value: number }) => {
      const res = await fetch(resolveUrl(`/api/external-sensors/${id}/value`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error("Failed to update sensor value");
      return res.json();
    },
  });
}

export function useHomeAssistantStatus() {
  return useQuery({
    queryKey: ["/api/ha/status"],
    queryFn: async () => {
      const res = await fetch(resolveUrl("/api/ha/status"));
      if (!res.ok) throw new Error("Failed to check HA status");
      return res.json();
    },
  });
}

export function useHomeAssistantSensors() {
  return useQuery({
    queryKey: ["/api/ha/sensors"],
    queryFn: async () => {
      const res = await fetch(resolveUrl("/api/ha/sensors"));
      if (!res.ok) throw new Error("Failed to discover HA sensors");
      return res.json();
    },
    enabled: false,
  });
}

export function useImportHomeAssistantSensor(deviceId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { entityId: string; sensorType: string; name: string }) => {
      const res = await fetch(resolveUrl(`/api/devices/${deviceId}/external-sensors/ha-import`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to import sensor");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sensorQK(deviceId) });
      toast({ title: "Sensor importiert", description: "Home Assistant Sensor wurde hinzugefügt" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    },
  });
}

export function useSyncHomeAssistantSensors(deviceId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(resolveUrl(`/api/devices/${deviceId}/external-sensors/sync`), {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to sync sensors");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: sensorQK(deviceId) });
      toast({ title: "Synchronisiert", description: `${data.synced} Sensoren aktualisiert` });
    },
  });
}
