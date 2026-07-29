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
