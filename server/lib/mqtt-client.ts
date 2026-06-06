/**
 * MQTT Client for Home Assistant MQTT Discovery
 * Publishes S21 sensor data and control entities as HA-compatible MQTT topics
 */

import mqtt from "mqtt";

const MQTT_HOST = process.env.MQTT_HOST || "";
const MQTT_PORT = process.env.MQTT_PORT || "1883";
const MQTT_USER = process.env.MQTT_USER || "";
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || "";
const DEVICE_ID = process.env.S21_DEVICE_ID || "s21_ventilation";

let client: mqtt.MqttClient | null = null;
let isConnected = false;

export function getMqttClient(): mqtt.MqttClient | null {
  return client;
}

export function isMqttConnected(): boolean {
  return isConnected;
}

export async function connectMqtt(): Promise<boolean> {
  if (!MQTT_HOST) {
    console.log("[MQTT] No MQTT host configured, skipping MQTT connection");
    return false;
  }

  if (client && isConnected) {
    return true;
  }

  const url = `mqtt://${MQTT_HOST}:${MQTT_PORT}`;
  const options: mqtt.IClientOptions = {
    clientId: `blauberg_s21_${Date.now()}`,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  };

  if (MQTT_USER && MQTT_PASSWORD) {
    options.username = MQTT_USER;
    options.password = MQTT_PASSWORD;
  }

  return new Promise((resolve) => {
    client = mqtt.connect(url, options);

    client.on("connect", () => {
      isConnected = true;
      console.log("[MQTT] Connected to broker at", url);
      resolve(true);
    });

    client.on("error", (err) => {
      console.error("[MQTT] Connection error:", err.message);
      isConnected = false;
      resolve(false);
    });

    client.on("close", () => {
      isConnected = false;
    });
  });
}

export function disconnectMqtt(): void {
  if (client) {
    client.end();
    client = null;
    isConnected = false;
  }
}

export function publish(topic: string, message: string | object, retain = false): void {
  if (!client || !isConnected) return;
  const payload = typeof message === "string" ? message : JSON.stringify(message);
  client.publish(topic, payload, { retain, qos: 1 });
}

export function subscribe(topic: string, callback: (topic: string, message: Buffer) => void): void {
  if (!client || !isConnected) return;
  client.subscribe(topic, { qos: 1 });
  client.on("message", (receivedTopic, message) => {
    if (receivedTopic === topic || receivedTopic.startsWith(topic.replace("#", ""))) {
      callback(receivedTopic, message);
    }
  });
}
