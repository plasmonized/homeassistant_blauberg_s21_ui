import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type InsertExternalSensor } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useExternalSensors(deviceId: number) {
  return useQuery({
    queryKey: ["/api/devices", deviceId, "external-sensors"],
    queryFn: async () => {
      const res = await fetch(`/api/devices/${deviceId}/external-sensors`);
      if (!res.ok) throw new Error("Failed to fetch external sensors");
      return res.json();
    },
  });
}

export function useCreateExternalSensor(deviceId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertExternalSensor) => {
      const res = await fetch(`/api/devices/${deviceId}/external-sensors`, {
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
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId, "external-sensors"] });
      toast({ title: "Sensor hinzugef\u00fcgt", description: "Externer Sensor wurde gespeichert" });
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
      const res = await fetch(`/api/external-sensors/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete sensor");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId, "external-sensors"] });
      toast({ title: "Sensor gel\u00f6scht" });
    },
  });
}

export function useUpdateExternalSensorValue() {
  return useMutation({
    mutationFn: async ({ id, value }: { id: number; value: number }) => {
      const res = await fetch(`/api/external-sensors/${id}/value`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error("Failed to update sensor value");
      return res.json();
    },
  });
}
