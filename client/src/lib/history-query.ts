import { resolveUrl } from "./queryClient";

export class HistoryRequestError extends Error {
  constructor(message: string, public status?: number, public retryable = true) {
    super(message);
  }
}

export function retryHistoryRequest(failureCount: number, error: Error): boolean {
  return failureCount < 2 && error instanceof HistoryRequestError && error.retryable;
}

export async function fetchHistoryJson<T>(path: string, signal?: AbortSignal, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(resolveUrl(path), { credentials: "include", signal: controller.signal });
    if (!response.ok) {
      throw new HistoryRequestError(`Verlauf konnte nicht geladen werden (HTTP ${response.status})`,
        response.status, response.status >= 500 || [408, 429].includes(response.status));
    }
    try {
      return await response.json() as T;
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new HistoryRequestError("Der Server hat keine gültigen Verlaufsdaten geliefert.", response.status, false);
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw new HistoryRequestError("Zeitüberschreitung beim Laden des Verlaufs.", 408);
    if (error instanceof HistoryRequestError) throw error;
    throw new HistoryRequestError("Verbindung zum Server beim Laden des Verlaufs unterbrochen.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

export const historyQueryPolicy = {
  retry: retryHistoryRequest,
  retryDelay: (attempt: number) => Math.min(500 * 2 ** attempt, 3000),
  staleTime: 30_000,
  refetchInterval: 60_000,
  retryOnMount: true,
  refetchOnReconnect: true,
};
