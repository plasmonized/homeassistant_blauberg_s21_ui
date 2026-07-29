import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type InsertControlProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useControlProfiles(deviceId: number) {
  return useQuery({
    queryKey: ["/api/devices", deviceId, "control-profiles"],
    queryFn: async () => {
      const res = await fetch(`/api/devices/${deviceId}/control-profiles`);
      if (!res.ok) throw new Error("Failed to fetch control profiles");
      return res.json();
    },
  });
}

export function useControlLogs(deviceId: number, page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ["/api/devices", deviceId, "control-logs", page, pageSize],
    queryFn: async () => {
      const res = await fetch(
        `/api/devices/${deviceId}/control-logs?page=${page}&pageSize=${pageSize}`
      );
      if (!res.ok) throw new Error("Failed to fetch control logs");
      return res.json() as Promise<{
        logs: any[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }>;
    },
    refetchInterval: 30_000,
  });
}

export function useControlProfileTemplates() {
  return useQuery({
    queryKey: ["/api/control-profiles/templates"],
    queryFn: async () => {
      const res = await fetch("/api/control-profiles/templates");
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });
}

export function useCreateControlProfile(deviceId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertControlProfile) => {
      const res = await fetch(`/api/devices/${deviceId}/control-profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create profile");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId, "control-profiles"] });
      toast({ title: "Regelschema erstellt", description: "Kontrollprofil wurde gespeichert" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    },
  });
}

export function useUpdateControlProfile(deviceId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertControlProfile> }) => {
      const res = await fetch(`/api/control-profiles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId, "control-profiles"] });
      toast({ title: "Regelschema aktualisiert" });
    },
  });
}

export function useDeleteControlProfile(deviceId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/control-profiles/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete profile");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId, "control-profiles"] });
      toast({ title: "Regelschema gelöscht" });
    },
  });
}
