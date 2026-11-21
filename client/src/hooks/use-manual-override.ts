import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ManualOverrideStatus } from "@shared/manual-override";
import { apiRequest } from "@/lib/queryClient";
import { fetchHistoryJson, historyQueryPolicy } from "@/lib/history-query";

export function useManualOverride(deviceId: number) {
  const client = useQueryClient();
  const path = `/api/devices/${deviceId}/manual-override`;
  const key = [path];
  const query = useQuery<ManualOverrideStatus>({
    queryKey: key,
    queryFn: ({ signal }) => fetchHistoryJson(path, signal),
    ...historyQueryPolicy,
    refetchInterval: 5000,
    staleTime: 0,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: ["/api/devices", deviceId, "control-decision"] }),
      client.invalidateQueries({ queryKey: ["/api/devices", deviceId, "control-logs"] }),
    ]);
  };
  const configure = useMutation({
    mutationFn: async (durationMinutes: number) => {
      await apiRequest("PUT", path, { durationMinutes });
    },
    onSuccess: refresh,
  });
  const resume = useMutation({
    mutationFn: async () => { await apiRequest("POST", `${path}/resume`); },
    onSuccess: refresh,
  });
  const boost = useMutation({
    mutationFn: async () => { await apiRequest("POST", `${path}/boost`); },
    onSuccess: refresh,
  });
  const stopBoost = useMutation({
    mutationFn: async () => { await apiRequest("POST", `${path}/stop-boost`); },
    onSuccess: refresh,
  });
  return { query, configure, resume, boost, stopBoost };
}
