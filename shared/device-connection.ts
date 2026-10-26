import { z } from "zod";
import type { Device } from "./schema";

const hostname = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.?$/i;
export const deviceConnectionSchema = z.object({
  ip: z.string().trim().min(1, "IP-Adresse oder Hostname fehlt").max(253)
    .refine(value => z.string().ip().safeParse(value).success ||
      (!/^[\d.]+$/.test(value) && hostname.test(value)),
    "Bitte eine gültige IP-Adresse oder einen Hostnamen ohne http:// und ohne Port eingeben"),
  port: z.number().int("Port muss ganzzahlig sein").min(1).max(65535),
  slaveId: z.number().int("Slave-ID muss ganzzahlig sein").min(0).max(247),
}).strict();

export type DeviceConnection = z.infer<typeof deviceConnectionSchema>;
export type DeviceConnectionResult = {
  device: Device;
  connection: { success: boolean; message: string };
};
