import { db } from "./db";
import {
  devices,
  registers,
  automationRules,
  automationLogs,
  externalSensors,
  controlProfiles,
  controlLogs,
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
  type InsertAutomationLog,
  type ExternalSensor,
  type InsertExternalSensor,
  type UpdateExternalSensorRequest,
  type ControlProfile,
  type InsertControlProfile,
  type UpdateControlProfileRequest,
  type ControlLog,
  type InsertControlLog
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

  // External Sensors
  getExternalSensors(deviceId: number): Promise<ExternalSensor[]>;
  getExternalSensor(id: number): Promise<ExternalSensor | undefined>;
  createExternalSensor(sensor: InsertExternalSensor): Promise<ExternalSensor>;
  updateExternalSensor(id: number, updates: UpdateExternalSensorRequest): Promise<ExternalSensor>;
  deleteExternalSensor(id: number): Promise<void>;
  updateExternalSensorValue(id: number, value: any): Promise<void>;

  // Control Profiles
  getControlProfiles(deviceId: number): Promise<ControlProfile[]>;
  getControlProfile(id: number): Promise<ControlProfile | undefined>;
  createControlProfile(profile: InsertControlProfile): Promise<ControlProfile>;
  updateControlProfile(id: number, updates: UpdateControlProfileRequest): Promise<ControlProfile>;
  deleteControlProfile(id: number): Promise<void>;

  // Control Logs
  getControlLogs(deviceId: number, limit?: number): Promise<ControlLog[]>;
  createControlLog(log: InsertControlLog): Promise<ControlLog>;
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

  // External Sensors
  async getExternalSensors(deviceId: number): Promise<ExternalSensor[]> {
    return await db.select().from(externalSensors).where(eq(externalSensors.deviceId, deviceId)).orderBy(externalSensors.createdAt);
  }

  async getExternalSensor(id: number): Promise<ExternalSensor | undefined> {
    const [sensor] = await db.select().from(externalSensors).where(eq(externalSensors.id, id));
    return sensor;
  }

  async createExternalSensor(sensor: InsertExternalSensor): Promise<ExternalSensor> {
    const [newSensor] = await db.insert(externalSensors).values(sensor).returning();
    return newSensor;
  }

  async updateExternalSensor(id: number, updates: UpdateExternalSensorRequest): Promise<ExternalSensor> {
    const [updated] = await db.update(externalSensors)
      .set(updates)
      .where(eq(externalSensors.id, id))
      .returning();
    return updated;
  }

  async deleteExternalSensor(id: number): Promise<void> {
    await db.delete(externalSensors).where(eq(externalSensors.id, id));
  }

  async updateExternalSensorValue(id: number, value: any): Promise<void> {
    await db.update(externalSensors)
      .set({ lastValue: String(value), updatedAt: new Date() })
      .where(eq(externalSensors.id, id));
  }

  // Control Profiles
  async getControlProfiles(deviceId: number): Promise<ControlProfile[]> {
    return await db.select().from(controlProfiles).where(eq(controlProfiles.deviceId, deviceId)).orderBy(controlProfiles.createdAt);
  }

  async getControlProfile(id: number): Promise<ControlProfile | undefined> {
    const [profile] = await db.select().from(controlProfiles).where(eq(controlProfiles.id, id));
    return profile;
  }

  async createControlProfile(profile: InsertControlProfile): Promise<ControlProfile> {
    const [newProfile] = await db.insert(controlProfiles).values(profile).returning();
    return newProfile;
  }

  async updateControlProfile(id: number, updates: UpdateControlProfileRequest): Promise<ControlProfile> {
    const [updated] = await db.update(controlProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(controlProfiles.id, id))
      .returning();
    return updated;
  }

  async deleteControlProfile(id: number): Promise<void> {
    await db.delete(controlProfiles).where(eq(controlProfiles.id, id));
  }

  // Control Logs
  async getControlLogs(deviceId: number, limit = 50): Promise<ControlLog[]> {
    return await db.select().from(controlLogs)
      .where(eq(controlLogs.deviceId, deviceId))
      .orderBy(desc(controlLogs.timestamp))
      .limit(limit);
  }

  async createControlLog(log: InsertControlLog): Promise<ControlLog> {
    const [newLog] = await db.insert(controlLogs).values(log).returning();
    return newLog;
  }
}

export const storage = new DatabaseStorage();
