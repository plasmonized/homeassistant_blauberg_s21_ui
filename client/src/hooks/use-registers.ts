import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertRegister } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { resolveUrl, apiRequest } from "@/lib/queryClient";

function getRegistersQueryKey(deviceId: number) {
  return [api.registers.list.path.replace(":id", String(deviceId))];
}

export function useRegisters(deviceId: number) {
  return useQuery({
    queryKey: [api.registers.list.path.replace(":id", String(deviceId))],
    queryFn: async () => {
      const url = buildUrl(api.registers.list.path, { id: deviceId });
      const res = await fetch(resolveUrl(url));
      if (!res.ok) throw new Error("Failed to fetch registers");
      return api.registers.list.responses[200].parse(await res.json());
    },
    refetchInterval: 2000,
  });
}

export function useCreateRegister() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ deviceId, ...data }: InsertRegister) => {
      const url = buildUrl(api.registers.create.path, { id: deviceId });
      const res = await fetch(resolveUrl(url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add register");
      }
      return api.registers.create.responses[201].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: getRegistersQueryKey(data.deviceId) });
      toast({ title: "Register Added", description: "New parameter tracking enabled" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Error", description: err.message });
    },
  });
}

export function useUpdateRegister() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, deviceId, ...updates }: { id: number; deviceId: number } & Partial<InsertRegister>) => {
      const url = buildUrl(api.registers.update.path, { id });
      const res = await fetch(resolveUrl(url), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error((error as any).message || "Failed to update register");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: getRegistersQueryKey(variables.deviceId) });
      toast({ title: "Register aktualisiert" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    },
  });
}

export function useDeleteRegister() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, deviceId }: { id: number; deviceId: number }) => {
      const url = buildUrl(api.registers.delete.path, { id });
      const res = await fetch(resolveUrl(url), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete register");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: getRegistersQueryKey(variables.deviceId) });
      toast({ title: "Register Deleted" });
    },
  });
}

export function useWriteRegister() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, value, deviceId }: { id: number; value: number | boolean | string; deviceId: number }) => {
      const url = buildUrl(api.registers.write.path, { id });
      const res = await fetch(resolveUrl(url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error("Failed to write to register");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: getRegistersQueryKey(variables.deviceId) });
      toast({ title: "Value Written", description: "Command sent to device" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Write Failed", description: err.message });
    },
  });
}
