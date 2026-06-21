import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
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

// === AUTOMATION RULES (legacy simple if-else) ===
export const automationRules = pgTable("automation_rules", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  name: text("name").notNull(),
  enabled: boolean("enabled").default(true),
  season: text("season", { enum: ["summer", "winter", "all"] }).default("all").notNull(),
  sensorType: text("sensor_type", { enum: ["outdoor_temp", "indoor_temp", "humidity", "co2", "forecast_temp"] }).notNull(),
  operator: text("operator", { enum: ["gt", "lt", "gte", "lte", "eq"] }).notNull(),
  threshold: integer("threshold").notNull(),
  actionType: text("action_type", { enum: ["fan_speed", "bypass", "mode", "boost", "standby"] }).notNull(),
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
  // Schema type: temperature_control, humidity_control, co2_control, summer_winter, night_setback, weather_compensated
  schemaType: text("schema_type", { enum: [
    "temperature_control",
    "humidity_control",
    "co2_control",
    "summer_winter",
    "night_setback",
    "weather_compensated"
  ] }).notNull(),
  // Parameters as JSON - each schema has its own parameter set
  parameters: jsonb("parameters").notNull(),
  // Override: external sensor to use instead of device-internal
  externalSensorId: integer("external_sensor_id"),
  // Time range when active
  timeFrom: text("time_from"),
  timeTo: text("time_to"),
  // Season restriction
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
  // Control type / schema
  controlType: text("control_type", { enum: [
    "temperature_control",
    "humidity_control",
    "co2_control",
    "summer_winter",
    "night_setback",
    "weather_compensated"
  ] }),
  // Measured value
  measuredValue: integer("measured_value"),
  // Setpoint
  setpointValue: integer("setpoint_value"),
  // Control deviation (measured - setpoint)
  deviation: integer("deviation"),
  // Control output (0-100% or raw value)
  controlOutput: integer("control_output"),
  // Action taken
  actionTaken: text("action_taken"),
  // Message (reason + result)
  message: text("message"),
  success: boolean("success").default(true),
});

export const externalSensors = pgTable("external_sensors", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  name: text("name").notNull(),
  sourceType: text("source_type", { enum: ["homeassistant", "openweather", "manual"] }).default("homeassistant").notNull(),
  entityId: text("entity_id"), // e.g. "sensor.outdoor_temp" for HA
  sensorType: text("sensor_type", { enum: ["temperature", "indoor_temp", "outdoor_temp", "humidity", "co2", "forecast_temp", "pressure", "wind_speed"] }).notNull(),
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
