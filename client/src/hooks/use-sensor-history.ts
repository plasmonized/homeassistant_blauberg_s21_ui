import { useQuery } from "@tanstack/react-query";
import { fetchHistoryJson, historyQueryPolicy } from "@/lib/history-query";

export interface SensorHistoryPoint {
  t: string;
  registerId: number;
  value: number;
}

export function useSensorHistory(deviceId: number, hours = 48) {
  return useQuery<SensorHistoryPoint[]>({
    queryKey: ["/api/devices", deviceId, "sensor-history", hours],
    queryFn: ({ signal }) =>
      fetchHistoryJson<SensorHistoryPoint[]>(`/api/devices/${deviceId}/sensor-history?hours=${hours}`, signal),
    ...historyQueryPolicy,
    enabled: !!deviceId,
  });
}

export function useAppStatus() {
  return useQuery<{ mqtt: boolean }>({
    queryKey: ["/api/status"],
    refetchInterval: 15_000,
  });
}
