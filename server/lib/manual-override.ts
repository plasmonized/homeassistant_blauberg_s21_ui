import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ManualOverrideStatus } from "../../shared/manual-override";

const savedSchema = z.object({
  durationMinutes: z.number().int().min(1).max(240).default(30),
  manualUntil: z.number().finite().nullable().default(null),
  manualStage: z.number().int().min(1).max(3).nullable().default(null),
  source: z.enum(["app", "mqtt", "console"]).nullable().default(null),
  appBoostUntil: z.number().finite().nullable().default(null),
});
type Saved = z.infer<typeof savedSchema>;
type State = Saved & {
  lastFan: number | null;
  boostActive: boolean;
  boostObservedAt: number | null;
  ruleBoost: boolean;
  revision: number;
  suppressNextFan: boolean;
};

// State is per device. Persist the manual deadline, not a fresh 30 minutes on restart.
export class ManualOverrideController {
  private states = new Map<number, State>();
  constructor(private save: (id: number, state: Saved) => Promise<void> = async () => {}) {}
  private state(id: number) {
    let state = this.states.get(id);
    if (!state) {
      state = { ...savedSchema.parse({}), lastFan: null, boostActive: false,
        boostObservedAt: null, ruleBoost: false,
        revision: 0, suppressNextFan: false };
      this.states.set(id, state);
    }
    return state;
  }
  restore(id: number, saved: unknown) { Object.assign(this.state(id), savedSchema.parse(saved)); }
  private async persist(id: number) {
    const { durationMinutes, manualUntil, manualStage, source, appBoostUntil } = this.state(id);
    await this.save(id, { durationMinutes, manualUntil, manualStage, source, appBoostUntil });
  }
  status(id: number, now = Date.now()): ManualOverrideStatus {
    const s = this.state(id);
    const manualUntil = s.manualUntil !== null && s.manualUntil > now ? s.manualUntil : null;
    const appBoost = s.appBoostUntil !== null && s.appBoostUntil > now;
    const boost = s.boostActive || appBoost || s.ruleBoost;
    return { durationMinutes: s.durationMinutes, manualUntil,
      manualStage: manualUntil ? s.manualStage : null,
      source: manualUntil ? s.source : null, boost, boostObservedAt: s.boostObservedAt,
      boostSource: s.boostActive ? "hardware" : s.ruleBoost ? "rule" : appBoost ? "app" : null,
      boostUntil: appBoost ? s.appBoostUntil : null,
      active: boost || manualUntil !== null };
  }
  revision(id: number) { return this.state(id).revision; }
  async configure(id: number, minutes: number) {
    this.state(id).durationMinutes = savedSchema.shape.durationMinutes.parse(minutes);
    await this.persist(id);
  }
  async manual(id: number, stage: number, source: Saved["source"], now = Date.now()) {
    if (![1, 2, 3].includes(stage)) throw new Error("Ungültige Lüfterstufe");
    const s = this.state(id);
    s.revision++;
    s.lastFan = stage;
    s.manualStage = stage;
    s.manualUntil = now + s.durationMinutes * 60_000;
    s.source = source;
    await this.persist(id);
  }
  // Call only after a successful OWN write, never on an intended/failed command.
  ownFan(id: number, stage: number) {
    const s = this.state(id);
    s.lastFan = stage;
    s.revision++;
  }
  ruleBoost(id: number, wanted: boolean) {
    const s = this.state(id);
    if (s.ruleBoost && !wanted) s.suppressNextFan = true;
    s.ruleBoost = wanted;
  }
  async startBoost(id: number, now = Date.now()) {
    const s = this.state(id);
    s.appBoostUntil = now + s.durationMinutes * 60_000;
    s.lastFan = 3;
    s.revision++;
    await this.persist(id);
  }
  async stopBoost(id: number) {
    this.state(id).appBoostUntil = null;
    this.state(id).suppressNextFan = true;
    await this.persist(id);
  }
  async observe(id: number, name: string, value: unknown, revision: number, now = Date.now()) {
    const s = this.state(id);
    if (revision !== s.revision) return; // read started before a concurrent command
    if (name === "Boost Active") {
      const key = "boostActive";
      const on = value === true || value === 1 || value === "1" || value === "true";
      if (s[key] && !on) s.suppressNextFan = true;
      s[key] = on;
      s.boostObservedAt = now;
      return;
    }
    if (name !== "Fan Speed") return;
    const stage = Number(value);
    if (![1, 2, 3].includes(stage)) return;
    const previous = s.lastFan;
    s.lastFan = stage;
    if (this.status(id, now).boost) {
      s.suppressNextFan = true;
      return;
    }
    if (s.suppressNextFan) { s.suppressNextFan = false; return; }
    // First live sample is a baseline, not proof of a manual intervention.
    if (previous !== null && previous !== stage) await this.manual(id, stage, "console", now);
  }
  async resume(id: number) {
    const s = this.state(id);
    s.manualUntil = null;
    s.manualStage = null;
    s.source = null;
    s.revision++;
    await this.persist(id);
  }
}

const directory = path.join(process.env.DATA_DIR || ".local", "s21-settings");
let saveQueue = Promise.resolve();
const savedStates: Record<string, Saved> = {};
export const manualOverrides = new ManualOverrideController(async (id, state) => {
  savedStates[id] = state;
  const snapshot = JSON.stringify(savedStates);
  const write = saveQueue.then(async () => {
    await mkdir(directory, { recursive: true });
    const target = path.join(directory, "manual-overrides.json");
    await writeFile(`${target}.tmp`, snapshot);
    await rename(`${target}.tmp`, target);
  });
  saveQueue = write.catch(() => {});
  await write;
});
export async function loadManualOverrides() {
  try {
    const saved = z.record(savedSchema).parse(JSON.parse(
      await readFile(path.join(directory, "manual-overrides.json"), "utf8"),
    ));
    for (const [id, state] of Object.entries(saved)) {
      if (!/^[1-9]\d*$/.test(id)) throw new Error("Ungültige Geräte-ID");
      savedStates[id] = state;
      manualOverrides.restore(Number(id), state);
    }
  } catch (error: any) {
    if (error.code !== "ENOENT") throw new Error("Manueller Vorrang konnte nicht geladen werden.", { cause: error });
  }
}
