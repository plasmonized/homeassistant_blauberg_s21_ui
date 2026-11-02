import { useQuery } from "@tanstack/react-query";
import { fetchHistoryJson, historyQueryPolicy } from "@/lib/history-query";

export interface BaseProfileSource {
  label: string;
  source: string;
}

export interface BaseProfileHistoryPoint {
  t: string;
  indoorTemp: number | null;
  outdoorTemp: number | null;
  co2: number | null;
  humidity: number | null;
  fanSpeed: number | null;
}

export interface BaseProfileHistory {
  profile: { id: number; name: string; enabled: boolean } | null;
  sources: {
    indoorTemp: BaseProfileSource;
    outdoorTemp: BaseProfileSource;
    co2: BaseProfileSource;
    humidity: BaseProfileSource;
  };
  points: BaseProfileHistoryPoint[];
  recordingIntervalMinutes: number;
}

export function useBaseProfileHistory(deviceId: number, hours = 48) {
  return useQuery<BaseProfileHistory>({
    queryKey: ["/api/devices", deviceId, "base-profile-history", hours],
    queryFn: ({ signal }) =>
      fetchHistoryJson<BaseProfileHistory>(`/api/devices/${deviceId}/base-profile-history?hours=${hours}`, signal),
    ...historyQueryPolicy,
    enabled: Number.isFinite(deviceId) && deviceId > 0,
  });
}
