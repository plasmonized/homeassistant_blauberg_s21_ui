import { useQuery } from "@tanstack/react-query";
import type { ControlDecisionResponse } from "@shared/control-decision";
import { fetchHistoryJson, historyQueryPolicy } from "@/lib/history-query";

export function useControlDecision(deviceId: number) {
  return useQuery<ControlDecisionResponse>({
    queryKey: ["/api/devices", deviceId, "control-decision"],
    queryFn: ({ signal }) => fetchHistoryJson<ControlDecisionResponse>(
      `/api/devices/${deviceId}/control-decision`, signal,
    ),
    ...historyQueryPolicy,
    enabled: Number.isFinite(deviceId) && deviceId > 0,
    staleTime: 0,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}
