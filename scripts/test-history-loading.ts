import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fetchHistoryJson, historyQueryPolicy, HistoryRequestError, retryHistoryRequest } from "../client/src/lib/history-query";
import type { BaseProfileHistory } from "../client/src/hooks/use-base-profile-history";

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalReact = Object.getOwnPropertyDescriptor(globalThis, "React");
Object.defineProperty(globalThis, "window", { configurable: true, value: { __BASE_PATH__: "/api/hassio_ingress/test-session/" } });
Object.defineProperty(globalThis, "React", { configurable: true, value: React });
const clients: QueryClient[] = [];
const makeClient = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return client;
};
const now = Date.now();
const payload: BaseProfileHistory = {
  profile: { id: 42, name: "Grundprofil", enabled: true },
  sources: Object.fromEntries(["indoorTemp", "outdoorTemp", "co2", "humidity"].map(key =>
    [key, { label: key, source: "internal:1" }])) as BaseProfileHistory["sources"],
  points: [{ t: new Date(now).toISOString(), indoorTemp: 23, outdoorTemp: 12, co2: 765, humidity: 53, fanSpeed: 1 }],
  recordingIntervalMinutes: 5,
};
const path = "/api/devices/42/base-profile-history?hours=48";
const queryKey = ["/api/devices", 42, "base-profile-history", 48];
const options = {
  queryKey,
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchHistoryJson<BaseProfileHistory>(path, signal),
  ...historyQueryPolicy,
  retryDelay: 0,
};
try {
  const client = makeClient();
  let requests = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/hassio_ingress/test-session/api/devices/42/base-profile-history?hours=48");
    assert.equal(init?.credentials, "include");
    assert.ok(init?.signal, "requests are cancellable");
    requests++;
    if (requests === 1) throw new TypeError("Temporary network failure");
    if (requests === 2) return new Response("temporarily unavailable", { status: 503 });
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  assert.deepEqual(await client.fetchQuery(options), payload);
  assert.equal(requests, 3, "network and 503 recover automatically without a manual click");

  // A failed refresh must not discard a successful query's existing data.
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  await assert.rejects(client.fetchQuery({ ...options, staleTime: 0 }), HistoryRequestError);
  assert.deepEqual(client.getQueryData(queryKey), payload);
  assert.equal(client.getQueryState(queryKey)?.status, "error");
  const { BaseProfileHistoryChart } = await import("../client/src/components/BaseProfileHistoryChart");
  const chart = renderToStaticMarkup(React.createElement(QueryClientProvider, { client },
    React.createElement(BaseProfileHistoryChart, {
      deviceId: 42, windowEnd: now, comparisonTime: now, onComparisonTimeChange: () => {},
    })));
  assert.match(chart, /data-testid="base-profile-history-chart"/, "cached chart stays mounted after failed refresh");
  assert.match(chart, /Aktualisierung fehlgeschlagen/, "stale data is explicitly marked");
  assert.match(chart, /zuletzt geladene Daten bleiben sichtbar/);
  assert.match(chart, /data-testid="history-comparison-readout"/, "comparison remains visible with cached history");
  assert.match(chart, /765 ppm/, "comparison shows actual recorded CO₂ with its unit");

  const emptyClient = makeClient();
  requests = 0;
  globalThis.fetch = async () => { requests++; return new Response("not found", { status: 404 }); };
  await assert.rejects(emptyClient.fetchQuery(options), error => error instanceof HistoryRequestError && error.status === 404);
  assert.equal(requests, 1, "permanent 4xx is not retried");
  assert.equal(emptyClient.getQueryState(queryKey)?.status, "error", "permanent first-load error is not converted to success");
  assert.equal(emptyClient.getQueryData(queryKey), undefined, "no fabricated data after first-load error");
  assert.equal(historyQueryPolicy.retryOnMount, true, "opening again retries failed initial loads");

  globalThis.fetch = async () => new Response("<html>not JSON</html>", { status: 200 });
  await assert.rejects(fetchHistoryJson(path), error => error instanceof HistoryRequestError && !error.retryable);
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  await assert.rejects(fetchHistoryJson(path, undefined, 5),
    error => error instanceof HistoryRequestError && error.status === 408);
  assert.equal(retryHistoryRequest(1, new HistoryRequestError("503", 503)), true);
  assert.equal(retryHistoryRequest(2, new HistoryRequestError("503", 503)), false, "retry count is bounded");
  assert.equal(retryHistoryRequest(0, new Error("unknown error")), false);
  console.log("Verlauf-Laden: Ingress, Netzwerk-/503-Wiederholung, Cache-Erhalt, Fehlerhinweis, 404, ungültige Antwort und Timeout bestanden.");
} finally {
  for (const client of clients) client.clear();
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (originalReact) Object.defineProperty(globalThis, "React", originalReact);
  else Reflect.deleteProperty(globalThis, "React");
}
