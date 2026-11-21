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
  returnPending: z.boolean().default(false),
});
type Saved = z.infer<typeof savedSchema>;
export interface OverrideEvent {
  controlType: "manual_override" | "boost" | "automation_return";
  actionTaken: string;
  message: string;
  timestamp: Date;
}
const sourceNames = { app: "App", mqtt: "Home Assistant / MQTT", console: "Gerätekonsole" };
const deadline = (until: number) => new Date(until).toLocaleString("de-DE");
type State = Saved & {
  lastFan: number | null;
  boostActive: boolean;
  boostObservedAt: number | null;
  ruleBoost: boolean;
  ruleSource: string | null;
  revision: number;
  suppressNextFan: boolean;
};

// State is per device. Persist the manual deadline, not a fresh 30 minutes on restart.
export class ManualOverrideController {
  private states = new Map<number, State>();
  constructor(
    private save: (id: number, state: Saved) => Promise<void> = async () => {},
    private log: (id: number, event: OverrideEvent) => Promise<void> = async () => {},
  ) {}
  private async event(id: number, controlType: OverrideEvent["controlType"],
    actionTaken: string, message: string, now: number) {
    this.state(id).returnPending = true;
    await this.log(id, { controlType, actionTaken, message, timestamp: new Date(now) });
  }
  private state(id: number) {
    let state = this.states.get(id);
    if (!state) {
      state = { ...savedSchema.parse({}), lastFan: null, boostActive: false,
        boostObservedAt: null, ruleBoost: false, ruleSource: null,
        revision: 0, suppressNextFan: false };
      this.states.set(id, state);
    }
    return state;
  }
  restore(id: number, saved: unknown) { Object.assign(this.state(id), savedSchema.parse(saved)); }
  private async persist(id: number) {
    const { durationMinutes, manualUntil, manualStage, source, appBoostUntil, returnPending } = this.state(id);
    await this.save(id, { durationMinutes, manualUntil, manualStage, source, appBoostUntil, returnPending });
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
    await this.expire(id, now);
    const s = this.state(id);
    const renewed = s.manualUntil !== null;
    s.revision++;
    s.lastFan = stage;
    s.manualStage = stage;
    s.manualUntil = now + s.durationMinutes * 60_000;
    s.source = source;
    s.returnPending = true;
    await this.persist(id);
    await this.event(id, "manual_override", renewed ? "Manueller Vorrang verlängert" : "Manueller Vorrang begonnen",
      `Quelle: ${source ? sourceNames[source] : "Unbekannt"}. Stufe ${stage}; Vorrang bis ${deadline(s.manualUntil)} (${s.durationMinutes} Min.).${this.status(id, now).boost ? " Boost hat weiterhin Vorrang." : ""}`, now);
  }
  // Call only after a successful OWN write, never on an intended/failed command.
  ownFan(id: number, stage: number) {
    const s = this.state(id);
    s.lastFan = stage;
    s.revision++;
  }
  async ruleBoost(id: number, wanted: boolean, rules = "Automationsregel", now = Date.now(),
    endReason = "Keine Boost-Regel fordert mehr Boost an.") {
    const s = this.state(id);
    if (s.ruleBoost === wanted) {
      if (wanted && s.ruleSource !== rules) {
        s.ruleSource = rules;
        await this.event(id, "boost", "Regel-Boost aktualisiert",
          `Quelle: ${rules}. Aktive Boost-Regeln geändert; Boost bleibt angefordert.`, now);
      }
      return;
    }
    const source = wanted ? rules : s.ruleSource ?? rules;
    if (s.ruleBoost && !wanted) s.suppressNextFan = true;
    s.ruleBoost = wanted;
    s.ruleSource = wanted ? rules : null;
    await this.event(id, "boost", wanted ? "Regel-Boost begonnen" : "Regel-Boost beendet",
      `Quelle: ${source}. ${wanted ? "Boost angefordert." : `${endReason}${this.remainingPriority(id, now)}`}`, now);
    await this.persist(id);
  }
  async startBoost(id: number, now = Date.now()) {
    await this.expire(id, now);
    const s = this.state(id);
    const renewed = s.appBoostUntil !== null;
    s.appBoostUntil = now + s.durationMinutes * 60_000;
    s.lastFan = 3;
    s.revision++;
    s.returnPending = true;
    await this.persist(id);
    await this.event(id, "boost", renewed ? "App-Boost verlängert" : "App-Boost begonnen",
      `Quelle: App. Stufe 3 bis ${deadline(s.appBoostUntil)} (${s.durationMinutes} Min.).`, now);
  }
  async stopBoost(id: number, now = Date.now()) {
    await this.expire(id, now);
    const s = this.state(id);
    if (s.appBoostUntil === null) return;
    s.appBoostUntil = null;
    s.suppressNextFan = true;
    await this.persist(id);
    await this.event(id, "boost", "App-Boost beendet",
      `Quelle: App. Boost manuell beendet.${this.remainingPriority(id, now)}`, now);
  }
  private remainingPriority(id: number, now: number) {
    const status = this.status(id, now);
    return status.boost ? " Ein anderer Boost bleibt aktiv."
      : status.manualUntil ? ` Manueller Vorrang für Stufe ${status.manualStage} bleibt bis ${deadline(status.manualUntil)} aktiv.`
      : " Automatik-Rückkehr steht aus.";
  }
  // Explicit lifecycle processing: reading status never writes logs or renews a timer.
  async expire(id: number, now = Date.now()) {
    const s = this.state(id);
    if (s.manualUntil !== null && s.manualUntil <= now) {
      const until = s.manualUntil;
      const source = s.source;
      const stage = s.manualStage;
      s.manualUntil = null;
      s.manualStage = null;
      s.source = null;
      s.returnPending = true;
      await this.persist(id);
      await this.event(id, "manual_override", "Manueller Vorrang abgelaufen",
        `Quelle: ${source ? sourceNames[source] : "Unbekannt"}. Vorrang für Stufe ${stage} abgelaufen.${this.remainingPriority(id, now)}`, until);
    }
    if (s.appBoostUntil !== null && s.appBoostUntil <= now) {
      const until = s.appBoostUntil;
      s.appBoostUntil = null;
      s.suppressNextFan = true;
      s.returnPending = true;
      await this.persist(id);
      await this.event(id, "boost", "App-Boost abgelaufen",
        `Quelle: App. Boost-Timer abgelaufen.${this.remainingPriority(id, now)}`, until);
    }
  }
  async automationReturned(id: number, profile: string, detail: string, now = Date.now()) {
    const s = this.state(id);
    if (!s.returnPending || this.status(id, now).active) return;
    await this.log(id, { controlType: "automation_return", actionTaken: "Automatik wieder aktiv",
      message: `Quelle: Grundprofil „${profile}“. ${detail}`, timestamp: new Date(now) });
    s.returnPending = false;
    await this.persist(id);
  }
  async observe(id: number, name: string, value: unknown, revision: number, now = Date.now()) {
    const s = this.state(id);
    if (revision !== s.revision) return; // read started before a concurrent command
    if (name === "Boost Active") {
      const key = "boostActive";
      const on = value === true || value === 1 || value === "1" || value === "true";
      if (s[key] && !on) s.suppressNextFan = true;
      const changed = s[key] !== on;
      s[key] = on;
      s.boostObservedAt = now;
      if (changed) {
        await this.event(id, "boost", on ? "Geräte-Boost erkannt" : "Geräte-Boost beendet",
          `Quelle: Gerät (Boost Active). ${on ? "Aktiven Boost am Gerät erkannt; tatsächlicher Startzeitpunkt nicht bekannt." : `Boost am Gerät nicht mehr aktiv.${this.remainingPriority(id, now)}`}`, now);
        await this.persist(id);
      }
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
  async resume(id: number, now = Date.now()) {
    await this.expire(id, now);
    const s = this.state(id);
    const hadManual = s.manualUntil !== null;
    const source = s.source;
    const stage = s.manualStage;
    s.manualUntil = null;
    s.manualStage = null;
    s.source = null;
    s.revision++;
    await this.persist(id);
    if (hadManual) await this.event(id, "manual_override", "Manueller Vorrang beendet",
      `Quelle: App („Automatik fortsetzen“). Bisheriger Vorrang: ${source ? sourceNames[source] : "Unbekannt"}, Stufe ${stage}.${this.remainingPriority(id, now)}`, now);
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
}, async (deviceId, event) => {
  const { storage } = await import("../storage");
  const { clearControlDecision } = await import("./control-decision");
  // Lifecycle events describe priority, never an old profile's regulation reason.
  if (event.controlType !== "automation_return") clearControlDecision(deviceId);
  await storage.createControlLog({ profileId: 0, deviceId, ...event, success: true });
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
