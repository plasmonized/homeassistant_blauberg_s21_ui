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
  id: true, 
  isConnected: true, 
  lastSeen: true 
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
