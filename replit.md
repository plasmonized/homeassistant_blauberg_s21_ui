# Blauberg S21 – Home Assistant Add-on UI

Web-based dashboard and automation engine for the Blauberg S21 heat-recovery ventilation unit, packaged as a Home Assistant add-on.

## Architecture

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + Tailwind + shadcn/ui |
| Backend | Express (TypeScript, tsx) |
| Database | PostgreSQL via Drizzle ORM |
| Hardware | Modbus TCP (jsmodbus) |
| HA integration | Supervisor REST API + MQTT |

## Running locally

```bash
npm run dev        # starts the Express server + Vite dev server on :5000
```

The simulator (Blauberg S21 stub on port 5502) starts automatically in development.

## Running tests

```bash
npm test           # runs ALL test:* suites in sequence, fails fast on first failure
npm run test:badge   # unit tests for getHeatProtectionStatus badge logic
npm run test:wakeup  # simulation tests for Hitzeschutz standby / wake-up flow
```

Add a new suite by creating `scripts/test-<name>.ts` and registering it in `package.json` as `"test:<name>": "tsx scripts/test-<name>.ts"`. It will be picked up automatically by `npm test`.

## Key files

| File | Purpose |
|------|---------|
| `server/lib/automation.ts` | Main automation loop, profile evaluation, hold-time, standby logic |
| `server/lib/control-engine.ts` | Pure control functions (PID, weather-compensated, Hitzeschutz) |
| `server/lib/modbus.ts` | Modbus TCP client pool, reconnect, coil/register writes |
| `server/lib/poll.ts` | Per-register polling with 5 s per-request timeout |
| `server/lib/s21-register-map.ts` | Canonical S21 register definitions (single source of truth) |
| `client/src/lib/heat-protection.ts` | Pure helper for Hitzeschutz badge detection (unit-tested) |
| `scripts/test.ts` | Unified test runner (auto-discovers all `test:*` scripts) |

## User preferences

- Changelog and version bump on every release pushed to GitHub
- German UI language throughout
- Log format: `[Control] Profile X (type): outdoor=Y, indoor=Z, co2=W, humidity=V, result=actionType=value, last=prev`

## Grundprofil and MQTT

- `base_profile` combines weather regulation with independent CO₂ and indoor-humidity demand. Highest requested fan stage wins, including over heat standby. Each measurement has its own internal/external source; missing or stale required sensors prevent standby.
- An enabled base profile exclusively owns fan/mode control. Other profiles and simple fan/mode rules pause without deletion; explicit boost/bypass rules remain independent. Existing installations are not automatically converted.
- UI MQTT settings override add-on/service defaults and persist under `$DATA_DIR/s21-settings` (`/data` in HA); development uses `.local/s21-settings`. The settings file contains broker credentials, is owner-only, and must never be logged, committed, or sent back through the settings API.
- `npm run test:base-profile` tests arbitration and source selection. `npm run test:mqtt` uses a private test broker and Modbus server, never the user's broker. `npm run test:log-retention` checks the 750-entry per-device limit with isolated temporary log IDs.
