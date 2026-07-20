import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertDevice, type Device } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { resolveUrl } from "@/lib/queryClient";

export function useDevices() {
  return useQuery({
    queryKey: [api.devices.list.path],
    queryFn: async () => {
      const res = await fetch(resolveUrl(api.devices.list.path));
      if (!res.ok) throw new Error("Failed to fetch devices");
      return api.devices.list.responses[200].parse(await res.json());
    },
  });
}

export function useDevice(id: number) {
  return useQuery({
    queryKey: [api.devices.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.devices.get.path, { id });
      const res = await fetch(resolveUrl(url));
      if (!res.ok) throw new Error("Failed to fetch device");
      return api.devices.get.responses[200].parse(await res.json());
    },
    refetchInterval: 5000,
  });
}

export function useCreateDevice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertDevice) => {
      const res = await fetch(resolveUrl(api.devices.create.path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create device");
      }
      return api.devices.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.devices.list.path] });
      toast({ title: "Device created", description: "New controller added successfully" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Error", description: err.message });
    },
  });
}

export function useDeleteDevice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.devices.delete.path, { id });
      const res = await fetch(resolveUrl(url), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete device");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.devices.list.path] });
      toast({ title: "Device deleted", description: "Controller removed from dashboard" });
    },
  });
}

export function useConnectDevice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.devices.connect.path, { id });
      const res = await fetch(resolveUrl(url), { method: "POST" });
      if (!res.ok) throw new Error("Connection failed");
      return res.json();
    },
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: [api.devices.get.path, id] });
      toast({ title: "Connection Attempted", description: data.message });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Connection Error", description: err.message });
    },
  });
}

export function usePollDevice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.devices.poll.path, { id });
      const res = await fetch(resolveUrl(url), { method: "POST" });
      if (!res.ok) throw new Error("Polling failed");
      return res.json();
    },
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: [api.registers.list.path.replace(":id", String(id))] });
      toast({ title: "Polled Successfully", description: "Registers updated" });
    },
  });
}

export function useReconnectDevice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(resolveUrl(`/api/devices/${id}/reconnect`), { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Reconnect fehlgeschlagen");
      return data;
    },
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: [api.devices.get.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.registers.list.path.replace(":id", String(id))] });
      toast({ title: "Verbunden", description: data.message });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Reconnect fehlgeschlagen", description: err.message });
    },
  });
}
