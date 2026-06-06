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

// === AUTOMATION RULES ===
export const automationRules = pgTable("automation_rules", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  name: text("name").notNull(),
  enabled: boolean("enabled").default(true),
  season: text("season", { enum: ["summer", "winter", "all"] }).default("all").notNull(),
  // Condition: sensor to check (e.g. "outdoor_temp", "indoor_temp", "humidity", "co2")
  sensorType: text("sensor_type", { enum: ["outdoor_temp", "indoor_temp", "humidity", "co2", "forecast_temp"] }).notNull(),
  // Condition operator: gt, lt, gte, lte, eq
  operator: text("operator", { enum: ["gt", "lt", "gte", "lte", "eq"] }).notNull(),
  // Threshold value
  threshold: integer("threshold").notNull(),
  // Action: what to change
  actionType: text("action_type", { enum: ["fan_speed", "bypass", "mode", "boost", "standby"] }).notNull(),
  actionValue: integer("action_value").notNull(),
  // Optional: time range restriction (HH:MM)
  timeFrom: text("time_from"),
  timeTo: text("time_to"),
  // Optional: link to specific external sensor (overrides generic sensorType lookup)
  externalSensorId: integer("external_sensor_id"),
  // Optional: hysteresis to prevent flapping
  hysteresis: integer("hysteresis").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const externalSensors = pgTable("external_sensors", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  name: text("name").notNull(),
  sourceType: text("source_type", { enum: ["homeassistant", "openweather", "manual"] }).default("homeassistant").notNull(),
  entityId: text("entity_id"), // e.g. "sensor.outdoor_temp" for HA
  sensorType: text("sensor_type", { enum: ["temperature", "humidity", "co2", "forecast_temp", "pressure", "wind_speed"] }).notNull(),
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

export type ExternalSensor = typeof externalSensors.$inferSelect;
export type InsertExternalSensor = z.infer<typeof insertExternalSensorSchema>;

export type CreateAutomationRuleRequest = InsertAutomationRule;
export type UpdateAutomationRuleRequest = Partial<InsertAutomationRule>;

export type CreateExternalSensorRequest = InsertExternalSensor;
export type UpdateExternalSensorRequest = Partial<InsertExternalSensor>;
