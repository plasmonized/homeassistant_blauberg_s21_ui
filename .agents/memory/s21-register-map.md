---
name: S21 Modbus register map sync
description: The S21 register set is encoded in three independent places that must be kept in lockstep.
---

# Blauberg S21 register map — three encodings must stay in sync

The canonical Modbus register set for the Blauberg S21 is defined once in
`server/lib/s21-register-map.ts` (`S21_REGISTERS`, with `legacyNames` aliases and a
`reconcile*` migration that updates rows in place by name/legacy-name, preserving DB ids,
and deletes only names in `OBSOLETE_REGISTER_NAMES`).

But the same register set is ALSO independently encoded in two other places:
1. MQTT auto-discovery for Home Assistant — `server/lib/mqtt-discovery.ts`.
2. A **native HA custom component** (Python) — `custom_components/blauberg_s21/*.py`
   (`sensor.py`, `binary_sensor.py`, `switch.py`, `number.py`, `select.py`; platforms
   listed in `__init__.py`).

**Why:** A register correction that only touches the canonical map + MQTT silently leaves
the Python custom component shipping stale entities (wrong addresses, removed registers like
Standby, old Fan Speed enums). This was caught only in architect review, not by tsc (Python
isn't type-checked here, and there's no Python runtime in this Node repl).

**How to apply:** When adding, removing, renaming, or re-addressing ANY S21 register,
update all three encodings together. After editing, grep the whole repo (excluding
`attached_assets/manual.txt`, which is the official manual / source-of-truth reference and
must never be edited) for the old name/address.

## Real S21 hardware facts (per official manual)
- Fan stages are **1–3** on this unit (confirmed as the actual hardware limit). Any max/clamp
  for Fan Speed anywhere in the stack (UI, MQTT discovery, native HA component, control-engine
  defaults/clamps, automation rule actionValue) must use 3, never a higher number. Never 0 —
  "Off" is the System State **power coil @0**, never fan=0.
- There is **no Standby** register.
- Boost is a coil, not a timer: **Boost Switch coil@13** (writable), **Boost Active coil@3** (read-only).
- Holding: Fan Speed@2, Operation Mode@43, Temperature Setpoint@44, Bypass Control@74
  (the requested bypass mode: 0=Geschlossen/1=Offen/2=Auto — this is NOT the physical position).
- Input (read-only): temps Outdoor@1/Supply@2/Extract@3/Exhaust@4 (int16, scale 10),
  Humidity@10, CO2@12, Bypass Status@51 (0-100%, actual physical bypass/rotor position —
  manual's `IR_StatusBpsRotor`, 100% = fully open/rotor stopped; use this to see the real
  state when Bypass Control@74 is set to Auto), Filter Status@31 (enum).
- Software never actively drives the bypass register from temperature/regulation logic —
  see `control-engine.ts`. It's left to the device's own firmware "Auto" logic unless a
  legacy `automation_rules` entry (actionType 'bypass') is configured.

## Frontend gotcha: name-substring checks in RegisterCard.tsx
`RegisterCard.tsx`'s `is*` helpers (e.g. `isBypass`) match by substring on `register.name`,
not by tag. Adding a new read-only register whose name shares a keyword with an existing
writable control (e.g. "Bypass Status" vs "Bypass Control") will silently fall into the
wrong render branch (a toggle/enum control) unless a more specific predicate — combining the
keyword with `isWritable`/`dataType` — is added and checked *before* the generic one.
**How to apply:** when adding a read-only sibling of an existing writable register, add a
dedicated `isXStatus = (reg) => isX(reg) && !reg.isWritable` predicate and its own render
branch ahead of the writable one's fallback branch.
