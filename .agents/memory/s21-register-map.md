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
- Fan stages are **1–5**, never 0. "Off" is the System State **power coil @0**, never fan=0.
- There is **no Standby** register.
- Boost is a coil, not a timer: **Boost Switch coil@13** (writable), **Boost Active coil@3** (read-only).
- Holding: Fan Speed@2, Operation Mode@43, Temperature Setpoint@44, Bypass Control@74.
- Input (read-only): temps Outdoor@1/Supply@2/Extract@3/Exhaust@4 (int16, scale 10),
  Humidity@10, CO2@12, Filter Status@31 (enum).
