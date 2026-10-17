/**
 * One MQTT client and one message dispatcher. Subscriptions survive reconnects
 * and configuration changes without accumulating handlers.
 */
import mqtt from "mqtt";
import { getEffectiveMqttSettings, loadMqttSettings } from "./mqtt-settings";

export const MQTT_AVAILABILITY_TOPIC = "blauberg/blauberg_s21_ventilation/availability";
let client: mqtt.MqttClient | null = null;
let isConnected = false;
let lastError: string | null = null;
let connecting: Promise<boolean> | null = null;
const subscriptions = new Map<string, (topic: string, message: Buffer) => void>();
let onConnected: (() => Promise<void>) | undefined;

export function onMqttConnected(callback: () => Promise<void>) { onConnected = callback; }
export function getMqttClient() { return client; }
export function isMqttConnected() { return isConnected; }
export function getMqttError() { return lastError; }

export function topicMatches(filter: string, topic: string): boolean {
  const f = filter.split("/");
  const t = topic.split("/");
  for (let i = 0; i < f.length; i++) {
    if (f[i] === "#") return i === f.length - 1;
    if (t[i] === undefined || (f[i] !== "+" && f[i] !== t[i])) return false;
  }
  return f.length === t.length;
}

export async function connectMqtt(): Promise<boolean> {
  await loadMqttSettings();
  const settings = getEffectiveMqttSettings();
  if (!settings.enabled || !settings.host) return false;
  if (client) return isConnected ? true : connecting ?? false;
  connecting = new Promise<boolean>(resolve => {
    const host = settings.host.includes(":") && !settings.host.startsWith("[")
      ? `[${settings.host}]` : settings.host;
    const current = mqtt.connect(`${settings.tls ? "mqtts" : "mqtt"}://${host}:${settings.port}`, {
      clientId: `blauberg_s21_${Date.now()}`,
      username: settings.username || undefined,
      password: settings.password || undefined,
      reconnectPeriod: 5000,
      connectTimeout: 8000,
      will: { topic: MQTT_AVAILABILITY_TOPIC, payload: Buffer.from("offline"), retain: true, qos: 1 },
    });
    client = current;
    const timer = setTimeout(() => {
      if (client === current && !isConnected) lastError = "MQTT-Verbindung nicht möglich. Broker, Port und Zugangsdaten prüfen.";
      resolve(false);
    }, 8500);
    const finish = (ok: boolean) => { clearTimeout(timer); resolve(ok); };
    current.on("connect", () => {
      if (client !== current) return;
      isConnected = true;
      lastError = null;
      for (const topic of subscriptions.keys()) current.subscribe(topic, { qos: 1 });
      console.log("[MQTT] Mit Broker verbunden");
      finish(true);
      void onConnected?.().catch(() => { lastError = "MQTT verbunden, Discovery fehlgeschlagen."; });
    });
    current.on("message", (topic, message, packet) => {
      if (client !== current) return;
      // Never replay a retained control instruction on every reconnect.
      if (packet.retain && topic.endsWith("/set")) return;
      for (const [filter, callback] of subscriptions) {
        if (topicMatches(filter, topic)) {
          Promise.resolve().then(() => callback(topic, message)).catch(() =>
            console.error("[MQTT] Verarbeitung einer Nachricht fehlgeschlagen"));
        }
      }
    });
    current.on("error", () => {
      if (client !== current) return;
      lastError = "MQTT-Verbindung fehlgeschlagen. Broker, Port, TLS und Zugangsdaten prüfen.";
      isConnected = false;
      finish(false);
    });
    current.on("close", () => {
      if (client !== current) return;
      isConnected = false;
      finish(false);
    });
  });
  return connecting;
}

export async function disconnectMqtt(): Promise<void> {
  const old = client;
  client = null;
  isConnected = false;
  connecting = null;
  if (old) {
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => { old.end(true); resolve(); }, 1000);
      if (old.connected) old.publish(MQTT_AVAILABILITY_TOPIC, "offline", { retain: true, qos: 1 });
      old.end(false, {}, () => { clearTimeout(timer); resolve(); });
    });
  }
}

export async function reconnectMqtt(): Promise<boolean> {
  await disconnectMqtt();
  lastError = null;
  return connectMqtt();
}

export function publish(topic: string, message: string | object, retain = false): void {
  if (!client || !isConnected) return;
  client.publish(topic, typeof message === "string" ? message : JSON.stringify(message), { retain, qos: 1 });
}

export function subscribe(topic: string, callback: (topic: string, message: Buffer) => void): void {
  subscriptions.set(topic, callback);
  if (client && isConnected) client.subscribe(topic, { qos: 1 });
}
