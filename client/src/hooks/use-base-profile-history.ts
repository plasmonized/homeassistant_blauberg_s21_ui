import { useQuery } from "@tanstack/react-query";

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
    queryFn: async () => {
      const response = await fetch(`/api/devices/${deviceId}/base-profile-history?hours=${hours}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Verlauf konnte nicht geladen werden (${response.status})`);
      }
      return response.json() as Promise<BaseProfileHistory>;
    },
    refetchInterval: 60_000,
    enabled: Number.isFinite(deviceId) && deviceId > 0,
  });
}
