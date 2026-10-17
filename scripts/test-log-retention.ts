import assert from "node:assert/strict";
import { db, pool } from "../server/db";
import { controlLogs, controlProfiles } from "../shared/schema";
import { storage } from "../server/storage";
import { inArray } from "drizzle-orm";

// No real device/profile touched; log tables have no device foreign key.
const id = -Math.floor(100000 + Math.random() * 1_000_000_000);
try {
  const rows = await db.insert(controlLogs).values(
    Array.from({ length: 752 }, (_, i) => ({
      profileId: id, deviceId: i === 751 ? id - 1 : id,
      timestamp: new Date(2020, 0, 1), actionTaken: "fan_speed=1",
    })),
  ).returning();
  await storage.createControlLog({ profileId: id, deviceId: id, actionTaken: "fan_speed=3" });
  assert.equal(await storage.countControlLogs(id), 750);
  assert.equal(await storage.countControlLogs(id - 1), 1, "other device untouched");
  const logs = await storage.getControlLogs(id, 750);
  assert.equal(logs[0].actionTaken, "fan_speed=3");
  assert.equal(logs.some(l => l.id === rows[0].id || l.id === rows[1].id), false, "oldest ID tie-breaker pruned");
  const base = await storage.createControlProfile({ deviceId: id, name: "Test base", schemaType: "base_profile", parameters: {} });
  assert.equal(base.enabled, true);
  assert.equal((await storage.updateControlProfile(base.id, { name: "Edited base" })).enabled, true, "editing must not disable itself");
  const other = await storage.createControlProfile({ deviceId: id, name: "Second base", schemaType: "base_profile", parameters: {} });
  assert.equal((await storage.getControlProfile(base.id))?.enabled, false);
  assert.equal(other.enabled, true);
  assert.equal((await storage.updateControlProfile(base.id, { enabled: true })).enabled, true);
  assert.equal((await storage.getControlProfile(other.id))?.enabled, false, "only one active base");
  assert.equal((await storage.updateControlProfile(base.id, { enabled: false })).enabled, false);
  console.log("Verlauf: 750-Limit, Reihenfolge und Geräteisolation bestanden.");
  console.log("Grundprofil: Speichern erhält Aktivierung, exklusives Aktivieren und Deaktivieren bestanden.");
} finally {
  await db.delete(controlLogs).where(inArray(controlLogs.deviceId, [id, id - 1]));
  await db.delete(controlProfiles).where(inArray(controlProfiles.deviceId, [id, id - 1]));
  await pool.end();
}
