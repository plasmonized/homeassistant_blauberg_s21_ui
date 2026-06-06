import { db } from "./db";
import {
  devices,
  registers,
  automationRules,
  automationLogs,
  type Device,
  type InsertDevice,
  type Register,
  type InsertRegister,
  type UpdateDeviceRequest,
  type UpdateRegisterRequest,
  type AutomationRule,
  type InsertAutomationRule,
  type UpdateAutomationRuleRequest,
  type AutomationLog,
  type InsertAutomationLog
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  // Devices
  getDevices(): Promise<Device[]>;
  getDevice(id: number): Promise<Device | undefined>;
  createDevice(device: InsertDevice): Promise<Device>;
  updateDevice(id: number, updates: UpdateDeviceRequest): Promise<Device>;
  deleteDevice(id: number): Promise<void>;

  // Registers
  getRegisters(deviceId: number): Promise<Register[]>;
  getRegister(id: number): Promise<Register | undefined>;
  createRegister(register: InsertRegister): Promise<Register>;
  updateRegister(id: number, updates: UpdateRegisterRequest): Promise<Register>;
  deleteRegister(id: number): Promise<void>;
  updateRegisterValue(id: number, value: any): Promise<void>;

  // Automation Rules
  getAutomationRules(deviceId: number): Promise<AutomationRule[]>;
  getAutomationRule(id: number): Promise<AutomationRule | undefined>;
  createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule>;
  updateAutomationRule(id: number, updates: UpdateAutomationRuleRequest): Promise<AutomationRule>;
  deleteAutomationRule(id: number): Promise<void>;

  // Automation Logs
  getAutomationLogs(deviceId: number, limit?: number): Promise<AutomationLog[]>;
  createAutomationLog(log: InsertAutomationLog): Promise<AutomationLog>;
}

export class DatabaseStorage implements IStorage {
  async getDevices(): Promise<Device[]> {
    return await db.select().from(devices);
  }

  async getDevice(id: number): Promise<Device | undefined> {
    const [device] = await db.select().from(devices).where(eq(devices.id, id));
    return device;
  }

  async createDevice(device: InsertDevice): Promise<Device> {
    const [newDevice] = await db.insert(devices).values(device).returning();
    return newDevice;
  }

  async updateDevice(id: number, updates: UpdateDeviceRequest): Promise<Device> {
    const [updated] = await db.update(devices)
      .set(updates)
      .where(eq(devices.id, id))
      .returning();
    return updated;
  }

  async deleteDevice(id: number): Promise<void> {
    await db.delete(devices).where(eq(devices.id, id));
  }

  async getRegisters(deviceId: number): Promise<Register[]> {
    return await db.select().from(registers).where(eq(registers.deviceId, deviceId)).orderBy(registers.address);
  }

  async getRegister(id: number): Promise<Register | undefined> {
    const [register] = await db.select().from(registers).where(eq(registers.id, id));
    return register;
  }

  async createRegister(register: InsertRegister): Promise<Register> {
    const [newRegister] = await db.insert(registers).values(register).returning();
    return newRegister;
  }

  async updateRegister(id: number, updates: UpdateRegisterRequest): Promise<Register> {
    const [updated] = await db.update(registers)
      .set(updates)
      .where(eq(registers.id, id))
      .returning();
    return updated;
  }

  async deleteRegister(id: number): Promise<void> {
    await db.delete(registers).where(eq(registers.id, id));
  }

  async updateRegisterValue(id: number, value: any): Promise<void> {
    await db.update(registers)
      .set({ lastValue: String(value), updatedAt: new Date() })
      .where(eq(registers.id, id));
  }

  // Automation Rules
  async getAutomationRules(deviceId: number): Promise<AutomationRule[]> {
    return await db.select().from(automationRules).where(eq(automationRules.deviceId, deviceId)).orderBy(automationRules.createdAt);
  }

  async getAutomationRule(id: number): Promise<AutomationRule | undefined> {
    const [rule] = await db.select().from(automationRules).where(eq(automationRules.id, id));
    return rule;
  }

  async createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule> {
    const [newRule] = await db.insert(automationRules).values(rule).returning();
    return newRule;
  }

  async updateAutomationRule(id: number, updates: UpdateAutomationRuleRequest): Promise<AutomationRule> {
    const [updated] = await db.update(automationRules)
      .set(updates)
      .where(eq(automationRules.id, id))
      .returning();
    return updated;
  }

  async deleteAutomationRule(id: number): Promise<void> {
    await db.delete(automationRules).where(eq(automationRules.id, id));
  }

  // Automation Logs
  async getAutomationLogs(deviceId: number, limit = 50): Promise<AutomationLog[]> {
    return await db.select().from(automationLogs)
      .where(eq(automationLogs.deviceId, deviceId))
      .orderBy(desc(automationLogs.triggeredAt))
      .limit(limit);
  }

  async createAutomationLog(log: InsertAutomationLog): Promise<AutomationLog> {
    const [newLog] = await db.insert(automationLogs).values(log).returning();
    return newLog;
  }
}

export const storage = new DatabaseStorage();
