import { pgTable, text, serial, integer, real, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===
export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ip: text("ip").notNull(),
  port: integer("port").default(502).notNull(),
  slaveId: integer("slave_id").default(1).notNull(),
  isConnected: boolean("is_connected").default(false),
  lastSeen: timestamp("last_seen"),
});

export const registers = pgTable("registers", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  name: text("name").notNull(),
  address: integer("address").notNull(),
  type: text("type", { enum: ["holding", "input", "coil", "discrete"] }).notNull(),
  dataType: text("data_type", { enum: ["uint16", "int16", "bool", "enum"] }).default("uint16").notNull(),
  unit: text("unit"),
  scale: integer("scale").default(1),
  isWritable: boolean("is_writable").default(false),
  lastValue: text("last_value"),
  updatedAt: timestamp("updated_at"),
  options: jsonb("options"), // For enum types: { "0": "Heat", "1": "Auto", ... }
  tags: text("tags").array(), // e.g. ["outdoor", "temperature", "sensor"]
});

// === SCHEMAS ===
export const insertDeviceSchema = createInsertSchema(devices).omit({ 
  id: true 
});

export const insertRegisterSchema = createInsertSchema(registers).omit({ 
  id: true, 
  lastValue: true, 
  updatedAt: true 
});

// === TYPES ===
export type Device = typeof devices.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Register = typeof registers.$inferSelect;
export type InsertRegister = z.infer<typeof insertRegisterSchema>;

export type RegisterType = "holding" | "input" | "coil" | "discrete";
export type RegisterDataType = "uint16" | "int16" | "bool" | "enum";

export type CreateDeviceRequest = InsertDevice;
export type UpdateDeviceRequest = Partial<InsertDevice>;

export type CreateRegisterRequest = InsertRegister;
export type UpdateRegisterRequest = Partial<InsertRegister>;

export const modbusCommandSchema = z.object({
  registerId: z.number(),
  value: z.union([z.number(), z.boolean(), z.string()]),
});

export type ModbusCommand = z.infer<typeof modbusCommandSchema>;

// === REGISTER TAG TAXONOMY ===
// Location tags
export const LOCATION_TAGS = ["outdoor", "indoor", "supply", "extract", "exhaust"] as const;
// Function tags
export const FUNCTION_TAGS = ["temperature", "humidity", "co2", "filter", "fan", "mode", "bypass", "boost", "power", "setpoint"] as const;
// Role tags
export const ROLE_TAGS = ["sensor", "control", "status"] as const;

export const ALL_TAGS = [...LOCATION_TAGS, ...FUNCTION_TAGS, ...ROLE_TAGS] as const;
export type RegisterTag = typeof ALL_TAGS[number];

export const TAG_LABELS: Record<string, string> = {
  outdoor: "Außen",
  indoor: "Innen",
  supply: "Zuluft",
  extract: "Abluft",
  exhaust: "Fortluft",
  temperature: "Temperatur",
  humidity: "Feuchtigkeit",
  co2: "CO₂",
  filter: "Filter",
  fan: "Lüfter",
  mode: "Modus",
  bypass: "Bypass",
  boost: "Boost",
  power: "Strom",
  setpoint: "Sollwert",
  sensor: "Sensor",
  control: "Steuerung",
  status: "Status",
};

export const TAG_COLORS: Record<string, string> = {
  outdoor: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  indoor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  supply: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  extract: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  exhaust: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  temperature: "bg-red-500/15 text-red-700 dark:text-red-400",
  humidity: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  co2: "bg-green-500/15 text-green-700 dark:text-green-400",
  filter: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  fan: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  mode: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  bypass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  boost: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  power: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  setpoint: "bg-pink-500/15 text-pink-700 dark:text-pink-400",
  sensor: "bg-muted text-muted-foreground",
  control: "bg-muted text-muted-foreground",
  status: "bg-muted text-muted-foreground",
};

// === AUTOMATION RULES (legacy simple if-else) ===
export const automationRules = pgTable("automation_rules", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  name: text("name").notNull(),
  enabled: boolean("enabled").default(true),
  season: text("season", { enum: ["summer", "winter", "all"] }).default("all").notNull(),
  sensorType: text("sensor_type", { enum: ["outdoor_temp", "indoor_temp", "humidity", "outdoor_humidity", "indoor_humidity", "co2", "forecast_temp"] }).notNull(),
  operator: text("operator", { enum: ["gt", "lt", "gte", "lte", "eq"] }).notNull(),
  threshold: integer("threshold").notNull(),
  actionType: text("action_type", { enum: ["fan_speed", "bypass", "mode", "boost"] }).notNull(),
  actionValue: integer("action_value").notNull(),
  timeFrom: text("time_from"),
  timeTo: text("time_to"),
  externalSensorId: integer("external_sensor_id"),
  hysteresis: integer("hysteresis").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// === CONTROL PROFILES (professional control schemas) ===
export const controlProfiles = pgTable("control_profiles", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  name: text("name").notNull(),
  enabled: boolean("enabled").default(true),
  schemaType: text("schema_type", { enum: [
    "temperature_control",
    "humidity_control",
    "co2_control",
    "summer_winter",
    "night_setback",
    "weather_compensated"
  ] }).notNull(),
  parameters: jsonb("parameters").notNull(),
  externalSensorId: integer("external_sensor_id"),
  timeFrom: text("time_from"),
  timeTo: text("time_to"),
  season: text("season", { enum: ["summer", "winter", "all"] }).default("all").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// === CONTROL LOGS (regulation history) ===
export const controlLogs = pgTable("control_logs", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull(),
  deviceId: integer("device_id").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  controlType: text("control_type", { enum: [
    "temperature_control",
    "humidity_control",
    "co2_control",
    "summer_winter",
    "night_setback",
    "weather_compensated"
  ] }),
  measuredValue: real("measured_value"),
  setpointValue: real("setpoint_value"),
  deviation: real("deviation"),
  controlOutput: real("control_output"),
  actionTaken: text("action_taken"),
  message: text("message"),
  success: boolean("success").default(true),
});

export const externalSensors = pgTable("external_sensors", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  name: text("name").notNull(),
  sourceType: text("source_type", { enum: ["homeassistant", "openweather", "manual"] }).default("homeassistant").notNull(),
  entityId: text("entity_id"),
  sensorType: text("sensor_type", { enum: ["temperature", "indoor_temp", "outdoor_temp", "humidity", "indoor_humidity", "outdoor_humidity", "co2", "forecast_temp", "pressure", "wind_speed"] }).notNull(),
  lastValue: text("last_value"),
  unit: text("unit"),
  updatedAt: timestamp("updated_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const automationLogs = pgTable("automation_logs", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull(),
  deviceId: integer("device_id").notNull(),
  triggeredAt: timestamp("triggered_at").defaultNow(),
  sensorValue: integer("sensor_value"),
  actionTaken: text("action_taken"),
  success: boolean("success").default(true),
  message: text("message"),
});

export const insertAutomationRuleSchema = createInsertSchema(automationRules).omit({
  id: true,
  createdAt: true,
});

export const insertAutomationLogSchema = createInsertSchema(automationLogs).omit({
  id: true,
  triggeredAt: true,
});

export type AutomationRule = typeof automationRules.$inferSelect;
export type InsertAutomationRule = z.infer<typeof insertAutomationRuleSchema>;
export type AutomationLog = typeof automationLogs.$inferSelect;
export type InsertAutomationLog = z.infer<typeof insertAutomationLogSchema>;

export const insertExternalSensorSchema = createInsertSchema(externalSensors).omit({
  id: true,
  updatedAt: true,
  createdAt: true,
});

export const insertControlProfileSchema = createInsertSchema(controlProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertControlLogSchema = createInsertSchema(controlLogs).omit({
  id: true,
  timestamp: true,
});

export type ExternalSensor = typeof externalSensors.$inferSelect;
export type InsertExternalSensor = z.infer<typeof insertExternalSensorSchema>;

export type ControlProfile = typeof controlProfiles.$inferSelect;
export type InsertControlProfile = z.infer<typeof insertControlProfileSchema>;
export type ControlLog = typeof controlLogs.$inferSelect;
export type InsertControlLog = z.infer<typeof insertControlLogSchema>;

export type CreateAutomationRuleRequest = InsertAutomationRule;
export type UpdateAutomationRuleRequest = Partial<InsertAutomationRule>;

export type CreateExternalSensorRequest = InsertExternalSensor;
export type UpdateExternalSensorRequest = Partial<InsertExternalSensor>;

export type CreateControlProfileRequest = InsertControlProfile;
export type UpdateControlProfileRequest = Partial<InsertControlProfile>;
export type CreateControlLogRequest = InsertControlLog;
