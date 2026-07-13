import { useQuery } from "@tanstack/react-query";

export interface SensorHistoryPoint {
  t: string;
  registerId: number;
  value: number;
}

export function useSensorHistory(deviceId: number, hours = 48) {
  return useQuery<SensorHistoryPoint[]>({
    queryKey: ["/api/devices", deviceId, "sensor-history", hours],
    queryFn: async () => {
      const res = await fetch(`/api/devices/${deviceId}/sensor-history?hours=${hours}`);
      if (!res.ok) throw new Error("Failed to fetch sensor history");
      return res.json();
    },
    refetchInterval: 60_000,
    enabled: !!deviceId,
  });
}

export function useAppStatus() {
  return useQuery<{ mqtt: boolean }>({
    queryKey: ["/api/status"],
    refetchInterval: 15_000,
  });
}
