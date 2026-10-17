import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isIP } from "node:net";
import { z } from "zod";

export const mqttSettingsSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(253).refine(
    v => v === "" || isIP(v) === 6 || /^[a-zA-Z0-9._-]+$/.test(v),
    "Broker bitte als Hostname oder IP ohne mqtt:// eingeben.",
  ),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(256),
  tls: z.boolean(),
  password: z.string().max(4096).optional(),
  clearPassword: z.boolean().optional(),
}).refine(v => !v.enabled || v.host.length > 0, { message: "Für MQTT fehlt der Broker-Hostname.", path: ["host"] });

export type MqttSettings = Omit<z.infer<typeof mqttSettingsSchema>, "clearPassword"> & { password: string };
let override: MqttSettings | null = null;
let loaded: Promise<void> | undefined;
const settingsDir = path.join(process.env.DATA_DIR || ".local", "s21-settings");
const settingsPath = path.join(settingsDir, "mqtt.json");

function addonSettings(): MqttSettings {
  return {
    enabled: Boolean(process.env.MQTT_HOST),
    host: process.env.MQTT_HOST || "",
    port: Number(process.env.MQTT_PORT) || 1883,
    username: process.env.MQTT_USER || "",
    password: process.env.MQTT_PASSWORD || "",
    tls: false,
  };
}

export async function loadMqttSettings(): Promise<void> {
  loaded ??= (async () => {
    try {
      const stored = mqttSettingsSchema.parse(JSON.parse(await readFile(settingsPath, "utf8")));
      override = { ...stored, password: stored.password || "" };
    } catch (error: any) {
      // Never silently replace corrupt settings with a different broker.
      if (error.code !== "ENOENT") throw new Error("Gespeicherte MQTT-Konfiguration ist ungültig oder nicht lesbar.");
    }
  })();
  await loaded;
}

export function getEffectiveMqttSettings(): MqttSettings {
  return { ...(override || addonSettings()) };
}

export function getPublicMqttSettings() {
  const { password, ...settings } = getEffectiveMqttSettings();
  return { ...settings, hasPassword: Boolean(password), source: override ? "ui" : "addon" };
}

export async function saveMqttSettings(input: unknown): Promise<void> {
  const parsed = mqttSettingsSchema.parse(input);
  const { clearPassword, ...values } = parsed;
  const next: MqttSettings = {
    ...values,
    password: clearPassword ? "" : parsed.password ?? getEffectiveMqttSettings().password,
  };
  await mkdir(settingsDir, { recursive: true, mode: 0o700 });
  await writeFile(`${settingsPath}.tmp`, JSON.stringify(next), { mode: 0o600 });
  await rename(`${settingsPath}.tmp`, settingsPath);
  override = next;
}

export async function resetMqttSettings(): Promise<void> {
  try { await unlink(settingsPath); }
  catch (error: any) { if (error.code !== "ENOENT") throw error; }
  override = null;
}
