import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { getModbusClient } from "./lib/modbus";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Devices
  app.get(api.devices.list.path, async (req, res) => {
    const devices = await storage.getDevices();
    res.json(devices);
  });

  app.post(api.devices.create.path, async (req, res) => {
    try {
      const input = api.devices.create.input.parse(req.body);
      const device = await storage.createDevice(input);
      
      // Add default registers for S21
      // Based on common Blauberg/Vents registers
      const defaultRegisters = [
        { name: "Unit On/Off", address: 1, type: "holding", dataType: "bool", isWritable: true },
        { name: "Speed (1-3)", address: 2, type: "holding", dataType: "uint16", isWritable: true },
        { name: "Current Temperature", address: 3, type: "input", dataType: "uint16", unit: "°C" },
        { name: "Filter Timer", address: 4, type: "holding", dataType: "uint16" },
        { name: "Errors", address: 5, type: "input", dataType: "uint16" },
        { name: "Humidity Sensor", address: 6, type: "input", dataType: "uint16", unit: "%" },
        { name: "CO2 Sensor", address: 7, type: "input", dataType: "uint16", unit: "ppm" },
      ] as const;

      for (const reg of defaultRegisters) {
        await storage.createRegister({
          deviceId: device.id,
          name: reg.name,
          address: reg.address,
          type: reg.type as any,
          dataType: reg.dataType as any,
          isWritable: reg.isWritable ?? false,
          unit: reg.unit,
        });
      }

      res.status(201).json(device);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.devices.get.path, async (req, res) => {
    const device = await storage.getDevice(Number(req.params.id));
    if (!device) return res.status(404).json({ message: 'Device not found' });
    res.json(device);
  });

  app.put(api.devices.update.path, async (req, res) => {
    const device = await storage.updateDevice(Number(req.params.id), req.body);
    res.json(device);
  });

  app.delete(api.devices.delete.path, async (req, res) => {
    await storage.deleteDevice(Number(req.params.id));
    res.status(204).send();
  });

  // Registers
  app.get(api.registers.list.path, async (req, res) => {
    const regs = await storage.getRegisters(Number(req.params.id));
    res.json(regs);
  });

  app.post(api.registers.create.path, async (req, res) => {
    const reg = await storage.createRegister({ ...req.body, deviceId: Number(req.params.id) });
    res.status(201).json(reg);
  });

  app.put(api.registers.update.path, async (req, res) => {
    const reg = await storage.updateRegister(Number(req.params.id), req.body);
    res.json(reg);
  });

  app.delete(api.registers.delete.path, async (req, res) => {
    await storage.deleteRegister(Number(req.params.id));
    res.status(204).send();
  });

  // Modbus Operations
  app.post(api.devices.connect.path, async (req, res) => {
    const device = await storage.getDevice(Number(req.params.id));
    if (!device) return res.status(404).json({ message: 'Device not found' });

    try {
      await getModbusClient(device.id, device.ip, device.port, device.slaveId);
      await storage.updateDevice(device.id, { isConnected: true, lastSeen: new Date() });
      res.json({ success: true, message: "Connected successfully" });
    } catch (error: any) {
      await storage.updateDevice(device.id, { isConnected: false });
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post(api.devices.poll.path, async (req, res) => {
    const device = await storage.getDevice(Number(req.params.id));
    if (!device) return res.status(404).json({ message: 'Device not found' });

    try {
      const client = await getModbusClient(device.id, device.ip, device.port, device.slaveId);
      const registers = await storage.getRegisters(device.id);

      for (const reg of registers) {
        let value: any = null;
        try {
          if (reg.type === 'holding') {
            const resp = await client.readHoldingRegisters(reg.address, 1);
            value = resp.response.body.values[0];
          } else if (reg.type === 'input') {
            const resp = await client.readInputRegisters(reg.address, 1);
            value = resp.response.body.values[0];
          } else if (reg.type === 'coil') {
            const resp = await client.readCoils(reg.address, 1);
            value = resp.response.body.values[0] ? 1 : 0;
          } else if (reg.type === 'discrete') {
            const resp = await client.readDiscreteInputs(reg.address, 1);
            value = resp.response.body.values[0] ? 1 : 0;
          }

          if (reg.dataType === 'bool') {
            value = !!value;
          }
          
          await storage.updateRegisterValue(reg.id, value);
        } catch (e) {
          console.error(`Failed to read register ${reg.name}:`, e);
        }
      }

      await storage.updateDevice(device.id, { isConnected: true, lastSeen: new Date() });
      res.json({ success: true, message: "Poll complete" });
    } catch (error: any) {
      await storage.updateDevice(device.id, { isConnected: false });
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post(api.registers.write.path, async (req, res) => {
    const regId = Number(req.params.id);
    const register = await storage.getRegister(regId);
    if (!register) return res.status(404).json({ message: 'Register not found' });

    const device = await storage.getDevice(register.deviceId);
    if (!device) return res.status(404).json({ message: 'Device not found' });

    try {
      const client = await getModbusClient(device.id, device.ip, device.port, device.slaveId);
      const value = req.body.value;

      if (register.type === 'holding') {
        const val = Number(value);
        await client.writeSingleRegister(register.address, val);
      } else if (register.type === 'coil') {
        const val = Boolean(value);
        await client.writeSingleCoil(register.address, val);
      } else {
        return res.status(400).json({ message: "Register type not writable" });
      }

      await storage.updateRegisterValue(regId, value);
      res.json({ success: true, value });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  return httpServer;
}
