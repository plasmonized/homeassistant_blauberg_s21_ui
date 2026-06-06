import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type InsertAutomationRule } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useAutomationRules(deviceId: number) {
  return useQuery({
    queryKey: ["/api/devices", deviceId, "rules"],
    queryFn: async () => {
      const res = await fetch(`/api/devices/${deviceId}/rules`);
      if (!res.ok) throw new Error("Failed to fetch rules");
      return res.json();
    },
  });
}

export function useAutomationLogs(deviceId: number) {
  return useQuery({
    queryKey: ["/api/devices", deviceId, "logs"],
    queryFn: async () => {
      const res = await fetch(`/api/devices/${deviceId}/logs`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
  });
}

export function useCreateRule(deviceId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertAutomationRule) => {
      const res = await fetch(`/api/devices/${deviceId}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create rule");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId, "rules"] });
      toast({ title: "Regel erstellt", description: "Automatisierungsregel wurde gespeichert" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    },
  });
}

export function useUpdateRule(deviceId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertAutomationRule> }) => {
      const res = await fetch(`/api/rules/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update rule");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId, "rules"] });
      toast({ title: "Regel aktualisiert" });
    },
  });
}

export function useDeleteRule(deviceId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete rule");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId, "rules"] });
      toast({ title: "Regel gelöscht" });
    },
  });
}
