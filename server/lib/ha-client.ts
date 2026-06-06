/**
 * Home Assistant API Client
 * Integriert sich mit dem Home Assistant Supervisor oder Core API
 * um automatisch Sensoren zu entdecken und Werte zu lesen.
 */

const HA_API_URL = process.env.HA_API_URL || "http://supervisor/core/api";
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN || "";
const HA_TOKEN = process.env.HA_TOKEN || "";

function getHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (SUPERVISOR_TOKEN) {
    headers["Authorization"] = `Bearer ${SUPERVISOR_TOKEN}`;
  } else if (HA_TOKEN) {
    headers["Authorization"] = `Bearer ${HA_TOKEN}`;
  }
  return headers;
}

export async function getHomeAssistantStates(): Promise<any[]> {
  try {
    const res = await fetch(`${HA_API_URL}/states`, {
      headers: getHeaders(),
    });
    if (!res.ok) {
      console.error("[HA-Client] Failed to fetch states:", res.status);
      return [];
    }
    return await res.json();
  } catch (err) {
    console.error("[HA-Client] Error fetching states:", err);
    return [];
  }
}

export async function getHomeAssistantState(entityId: string): Promise<any | null> {
  try {
    const res = await fetch(`${HA_API_URL}/states/${entityId}`, {
      headers: getHeaders(),
    });
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("[HA-Client] Error fetching state:", err);
    return null;
  }
}

/**
 * Automatically discover relevant sensors from Home Assistant
 * based on sensor type patterns.
 */
export async function discoverHomeAssistantSensors(
  sensorTypes: string[] = ["temperature", "humidity", "co2", "pressure"]
): Promise<any[]> {
  const states = await getHomeAssistantStates();
  const discovered: any[] = [];

  for (const state of states) {
    const entityId = state.entity_id;
    const domain = entityId.split(".")[0];
    const name = state.attributes?.friendly_name || state.entity_id;
    const unit = state.attributes?.unit_of_measurement || "";

    // Only consider sensor domain
    if (domain !== "sensor") continue;

    // Detect sensor type based on unit and name
    let detectedType: string | null = null;

    const nameLower = name.toLowerCase();
    const unitLower = unit.toLowerCase();

    if (unitLower.includes("°c") || unitLower.includes("°f") || unitLower.includes("k")) {
      if (nameLower.includes("forecast") || nameLower.includes("vorhersage")) {
        detectedType = "forecast_temp";
      } else {
        detectedType = "temperature";
      }
    } else if (unitLower.includes("%") && nameLower.includes("humidity")) {
      detectedType = "humidity";
    } else if (unitLower.includes("ppm")) {
      detectedType = "co2";
    } else if (unitLower.includes("hpa") || unitLower.includes("mbar")) {
      detectedType = "pressure";
    } else if (unitLower.includes("m/s") || unitLower.includes("km/h") || unitLower.includes("mph")) {
      detectedType = "wind_speed";
    }

    if (detectedType && sensorTypes.includes(detectedType)) {
      discovered.push({
        entity_id: entityId,
        name: name,
        sensor_type: detectedType,
        unit: unit,
        last_value: state.state,
      });
    }
  }

  return discovered;
}

/**
 * Check if Home Assistant API is accessible
 */
export async function isHomeAssistantAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${HA_API_URL}/config`, {
      headers: getHeaders(),
      timeout: 5000,
    } as any);
    return res.ok;
  } catch {
    return false;
  }
}

export function getHomeAssistantApiUrl(): string {
  return HA_API_URL;
}

export function getHomeAssistantToken(): string {
  return SUPERVISOR_TOKEN || HA_TOKEN;
}
