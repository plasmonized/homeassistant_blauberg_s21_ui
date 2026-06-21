import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { getModbusClient } from "./lib/modbus";
import { startSimulator, stopSimulator, getSimulatorStatus } from "./lib/simulator";
import { startAutomationEngine, stopAutomationEngine } from "./lib/automation";
import { discoverHomeAssistantSensors, getHomeAssistantState, isHomeAssistantAvailable } from "./lib/ha-client";
import { reconcileS21Registers, reconcileAllS21Devices } from "./lib/s21-register-map";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Bring every device's register map in line with the real S21 hardware
  // BEFORE the automation engine starts polling/writing.
  await reconcileAllS21Devices();

  // Start automation engine on server start
  startAutomationEngine();

  // Devices
  app.get(api.devices.list.path, async (req, res) => {
    const devices = await storage.getDevices();
    res.json(devices);
  });

  app.post(api.devices.create.path, async (req, res) => {
    try {
      const input = api.devices.create.input.parse(req.body);
      const device = await storage.createDevice(input);
      
      // Seed the canonical S21 register map (single source of truth).
      await reconcileS21Registers(device.id);

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
            const body = resp.response.body as any;
            value = body.values?.[0] ? 1 : 0;
          }

          if (reg.dataType === 'bool') {
            value = !!value;
          } else if (reg.scale && reg.scale !== 1) {
            value = value / reg.scale;
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
      let value = req.body.value;

      if (register.type === 'holding') {
        let valToPush = Number(value);
        if (Number.isNaN(valToPush)) {
          return res.status(400).json({ message: "Value must be a number" });
        }
        if (register.name === 'Fan Speed') {
          valToPush = Math.max(1, Math.min(5, Math.round(valToPush)));
          value = valToPush;
        }
        if (register.scale && register.scale !== 1) {
            valToPush = valToPush * register.scale;
        }
        await client.writeSingleRegister(register.address, valToPush);
      } else if (register.type === 'coil') {
        const val = value === true || value === 1 || value === '1' || value === 'true';
        value = val;
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

  // Simulator routes
  app.post('/api/simulator/start', async (req, res) => {
    try {
      const port = await startSimulator(req.body?.port ?? 5502);
      res.json({ success: true, port, message: 'Simulator started' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/simulator/stop', async (req, res) => {
    try {
      stopSimulator();
      res.json({ success: true, message: 'Simulator stopped' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/simulator/status', async (req, res) => {
    res.json({ running: getSimulatorStatus() });
  });

  // Automation Rules
  app.get('/api/devices/:id/rules', async (req, res) => {
    const rules = await storage.getAutomationRules(Number(req.params.id));
    res.json(rules);
  });

  app.post('/api/devices/:id/rules', async (req, res) => {
    try {
      const rule = await storage.createAutomationRule({
        ...req.body,
        deviceId: Number(req.params.id),
      });
      res.status(201).json(rule);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put('/api/rules/:id', async (req, res) => {
    const rule = await storage.updateAutomationRule(Number(req.params.id), req.body);
    res.json(rule);
  });

  app.delete('/api/rules/:id', async (req, res) => {
    await storage.deleteAutomationRule(Number(req.params.id));
    res.status(204).send();
  });

  // Automation Logs
  app.get('/api/devices/:id/logs', async (req, res) => {
    const logs = await storage.getAutomationLogs(Number(req.params.id), 50);
    res.json(logs);
  });

  // External Sensors
  app.get('/api/devices/:id/external-sensors', async (req, res) => {
    const sensors = await storage.getExternalSensors(Number(req.params.id));
    res.json(sensors);
  });

  app.post('/api/devices/:id/external-sensors', async (req, res) => {
    try {
      const sensor = await storage.createExternalSensor({
        ...req.body,
        deviceId: Number(req.params.id),
      });
      res.status(201).json(sensor);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put('/api/external-sensors/:id', async (req, res) => {
    const sensor = await storage.updateExternalSensor(Number(req.params.id), req.body);
    res.json(sensor);
  });

  app.delete('/api/external-sensors/:id', async (req, res) => {
    await storage.deleteExternalSensor(Number(req.params.id));
    res.status(204).send();
  });

  app.post('/api/external-sensors/:id/value', async (req, res) => {
    const sensor = await storage.getExternalSensor(Number(req.params.id));
    if (!sensor) return res.status(404).json({ message: 'Sensor not found' });
    await storage.updateExternalSensorValue(Number(req.params.id), req.body.value);
    res.json({ success: true });
  });

  // === Home Assistant Integration ===
  // Check if HA is available
  app.get('/api/ha/status', async (req, res) => {
    const available = await isHomeAssistantAvailable();
    res.json({ available, mode: process.env.SUPERVISOR_TOKEN ? 'supervisor' : 'standalone' });
  });

  // Discover HA sensors
  app.get('/api/ha/sensors', async (req, res) => {
    const discovered = await discoverHomeAssistantSensors();
    res.json(discovered);
  });

  // Auto-import HA sensor into external_sensors
  app.post('/api/devices/:id/external-sensors/ha-import', async (req, res) => {
    try {
      const { entityId, sensorType, name } = req.body;
      const deviceId = Number(req.params.id);

      // Get current value from HA
      const haState = await getHomeAssistantState(entityId);
      const lastValue = haState?.state || null;
      const unit = haState?.attributes?.unit_of_measurement || "";

      const sensor = await storage.createExternalSensor({
        name: name || entityId,
        sourceType: "homeassistant",
        entityId,
        sensorType,
        deviceId,
        unit,
        lastValue: lastValue ? String(lastValue) : null,
      });

      res.status(201).json(sensor);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Sync all HA-linked sensors with current values
  app.post('/api/devices/:id/external-sensors/sync', async (req, res) => {
    const sensors = await storage.getExternalSensors(Number(req.params.id));
    let updated = 0;

    for (const sensor of sensors) {
      if (sensor.sourceType !== 'homeassistant' || !sensor.entityId) continue;
      const haState = await getHomeAssistantState(sensor.entityId);
      if (haState && haState.state) {
        await storage.updateExternalSensorValue(sensor.id, haState.state);
        updated++;
      }
    }

    res.json({ synced: updated });
  });

  // === Control Profiles (Regulation Schemas) ===
  // List control profiles for a device
  app.get('/api/devices/:id/control-profiles', async (req, res) => {
    const profiles = await storage.getControlProfiles(Number(req.params.id));
    res.json(profiles);
  });

  // Create a control profile
  app.post('/api/devices/:id/control-profiles', async (req, res) => {
    try {
      const body = req.body;
      // Derive schemaType from controlType if not provided
      const schemaType = body.schemaType || body.controlType || "temperature_control";
      const profile = await storage.createControlProfile({
        ...body,
        schemaType,
        deviceId: Number(req.params.id),
      });
      res.status(201).json(profile);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Update a control profile
  app.put('/api/control-profiles/:id', async (req, res) => {
    const profile = await storage.updateControlProfile(Number(req.params.id), req.body);
    res.json(profile);
  });

  // Delete a control profile
  app.delete('/api/control-profiles/:id', async (req, res) => {
    await storage.deleteControlProfile(Number(req.params.id));
    res.status(204).send();
  });

  // Control profile templates (pre-built schemas)
  app.get('/api/control-profiles/templates', async (req, res) => {
    const templates = {
      temperature_control: {
        name: "Temperaturregelung",
        description: "PID-Regelung der Raumtemperatur über Lüfterstufe",
        defaultParams: {
          setpoint: 22,
          kp: 2.0,
          ki: 0.1,
          kd: 0.5,
          outputMin: 1,
          outputMax: 5,
          useExternalSensors: false,
        },
        paramLabels: {
          setpoint: "Sollwert (°C)",
          kp: "Kp (Proportional)",
          ki: "Ki (Integral)",
          kd: "Kd (Differential)",
          outputMin: "Min. Lüfterstufe",
          outputMax: "Max. Lüfterstufe",
          useExternalSensors: "Externe Sensoren nutzen",
        },
      },
      humidity_control: {
        name: "Feuchtigkeitsregelung",
        description: "PID-Regelung der Luftfeuchtigkeit über Lüfterstufe",
        defaultParams: {
          setpoint: 50,
          kp: 1.0,
          ki: 0.05,
          kd: 0.2,
          outputMin: 1,
          outputMax: 5,
          useExternalSensors: false,
        },
        paramLabels: {
          setpoint: "Sollwert (%)",
          kp: "Kp (Proportional)",
          ki: "Ki (Integral)",
          kd: "Kd (Differential)",
          outputMin: "Min. Lüfterstufe",
          outputMax: "Max. Lüfterstufe",
          useExternalSensors: "Externe Sensoren nutzen",
        },
      },
      co2_control: {
        name: "CO2-Regelung",
        description: "Bedarfsgesteuerte Lüftung bei hohem CO2-Wert",
        defaultParams: {
          setpoint: 800,
          kp: 0.005,
          ki: 0.0001,
          kd: 0.001,
          outputMin: 1,
          outputMax: 5,
          emergencyThreshold: 1200,
          useExternalSensors: false,
        },
        paramLabels: {
          setpoint: "CO2-Sollwert (ppm)",
          kp: "Kp (Proportional)",
          ki: "Ki (Integral)",
          kd: "Kd (Differential)",
          outputMin: "Min. Lüfterstufe",
          outputMax: "Max. Lüfterstufe",
          emergencyThreshold: "Notfalldrehwert (ppm)",
          useExternalSensors: "Externe Sensoren nutzen",
        },
      },
      summer_winter: {
        name: "Sommer/Winter-Umschaltung",
        description: "Automatische Umschaltung zwischen Heizen und Kühlen",
        defaultParams: {
          summerSetpoint: 24,
          winterSetpoint: 20,
          switchTemp: 18,
          summerHysteresis: 1,
          useExternalSensors: false,
        },
        paramLabels: {
          summerSetpoint: "Sommer-Sollwert (°C)",
          winterSetpoint: "Winter-Sollwert (°C)",
          switchTemp: "Umschalttemperatur (°C)",
          summerHysteresis: "Hysterese (°C)",
          useExternalSensors: "Externe Sensoren nutzen",
        },
      },
      night_setback: {
        name: "Nachtabsenkung",
        description: "Reduzierte Temperatur und Lüftung in der Nacht",
        defaultParams: {
          daySetpoint: 22,
          nightSetpoint: 18,
          nightStart: "22:00",
          nightEnd: "06:00",
          fanSpeedDay: 1,
          fanSpeedNight: 1,
          useExternalSensors: false,
        },
        paramLabels: {
          daySetpoint: "Tages-Sollwert (°C)",
          nightSetpoint: "Nacht-Sollwert (°C)",
          nightStart: "Nachtbeginn",
          nightEnd: "Nachtende",
          fanSpeedDay: "Lüfterstufe Tag",
          fanSpeedNight: "Lüfterstufe Nacht",
          useExternalSensors: "Externe Sensoren nutzen",
        },
      },
      weather_compensated: {
        name: "Wetterkompensiert",
        description: "Lüftet nur, wenn die Außenluft hilft den Sollwert zu erreichen – sonst aus",
        defaultParams: {
          roomSetpoint: 21,
          comfortBand: 0.5,
          minOutdoorDelta: 1.0,
          boostThreshold: 2.0,
          baseFanSpeed: 1,
          activeFanSpeed: 2,
          maxFanSpeed: 5,
          useExternalSensors: false,
          useHeater: false,
          heaterFanSpeed: 2,
        },
        paramLabels: {
          roomSetpoint: "Raum-Sollwert (°C)",
          comfortBand: "Toleranzband um Sollwert (±°C)",
          minOutdoorDelta: "Min. Differenz Außen/Innen (°C)",
          boostThreshold: "Abweichung für max. Lüftung (°C)",
          baseFanSpeed: "Grundlüftung (Stufe 1–5)",
          activeFanSpeed: "Lüftung beim Regeln (Stufe 1–5)",
          maxFanSpeed: "Max. Lüftung (Stufe 1–5)",
          useExternalSensors: "Externe Sensoren nutzen",
          useHeater: "Heizregister nutzen (bei Kälte heizen)",
          heaterFanSpeed: "Lüfterstufe beim Heizen (Stufe 1–5)",
        },
      },
    };
    res.json(templates);
  });

  // Control Logs
  app.get('/api/devices/:id/control-logs', async (req, res) => {
    const logs = await storage.getControlLogs(Number(req.params.id), 50);
    res.json(logs);
  });

  return httpServer;
}
