import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DeviceConnection, DeviceConnectionResult } from "@shared/device-connection";
import { api } from "@shared/routes";
import { resolveUrl } from "@/lib/queryClient";

type ConnectionTestResult = DeviceConnectionResult["connection"];

async function requestConnection<T>(url: string, method: "POST" | "PUT", payload: DeviceConnection): Promise<T> {
  const response = await fetch(resolveUrl(url), {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = result as { message?: string; field?: string };
    throw new Error(details.field ? `${details.message ?? "Ungültige Eingabe"} (${details.field})` : details.message ?? "Verbindungsdaten konnten nicht verarbeitet werden.");
  }
  return result as T;
}

export function useTestDeviceConnection(deviceId: number) {
  return useMutation({
    mutationFn: (connection: DeviceConnection) =>
      requestConnection<ConnectionTestResult>(`/api/devices/${deviceId}/connection-test`, "POST", connection),
  });
}

export function useSaveDeviceConnection(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connection: DeviceConnection) =>
      requestConnection<DeviceConnectionResult>(`/api/devices/${deviceId}/connection`, "PUT", connection),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [api.devices.get.path, deviceId] }),
        queryClient.invalidateQueries({ queryKey: [api.devices.list.path] }),
        queryClient.invalidateQueries({ queryKey: [api.registers.list.path.replace(":id", String(deviceId))] }),
      ]);
    },
  });
}
