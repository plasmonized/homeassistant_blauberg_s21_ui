---
name: Control engine sensor & ventilation rules
description: Non-obvious constraints for the Blauberg S21 addon's automation/control engine — sensor resolution and the smart ventilation principle the user requires.
---

# Sensor resolution must use substring matching on real register names
Device temperature registers are named `Temperature - Outdoor`, `Temperature - Supply`,
`Temperature - Extract`, `Temperature - Exhaust` (NOT `Outdoor Temperature` etc.). The
`getSensorValue` helper resolves them with `r.name.includes(...)`. Any other code path
that reads temps must use the same substring approach via that helper.

**Why:** A separate fallback once used exact names (`"Outdoor Temperature"`) that never
matched, silently falling back to hardcoded `outdoor=10 / indoor=20`. That fake data
defeated the whole outdoor-vs-indoor safeguard for any profile not opted into external
sensors.
**How to apply:** Always resolve sensor values through `getSensorValue`. If no real
value is available, return `null` and let the profile NOT act — never fabricate temps.
Indoor temp = average of Supply + Extract when no dedicated indoor sensor exists.

# External sensors override, they do not gate register lookup
`useExternalSensors` on a profile is opt-in: when true, pass the external sensors to
`getSensorValue` so they override; when false, pass `undefined` so device registers are
used. The flag must never disable correct register resolution.
External sensor `sensorType` enum includes dedicated `indoor_temp` / `outdoor_temp`
(plus legacy `temperature`); honor the dedicated type first, then fall back.

# Smart "no-harm" ventilation (weather_compensated)
The user's hard requirement: ventilation must NOT run when it would push the room
further past an already-met setpoint.
- Room too warm + outdoor NOT at least `minOutdoorDelta` cooler → fan 0 (off). Running
  would pull in warm air and heat the room (summer-deadly).
- Room too cold + outdoor NOT at least `minOutdoorDelta` warmer → fan 0 (off).
- Otherwise ventilate toward the setpoint; boost to max when deviation ≥ `boostThreshold`.
- Within ±`comfortBand` of setpoint → only `baseFanSpeed` (hygiene), set to 0 for pure
  no-harm mode.
**Why:** comparing only indoor-vs-setpoint (the old logic) ignored whether outside air
actually helps; the user repeatedly stressed this is the entire point of using weather data.
Fan speed range is 0–3; clamp at the Modbus write point (`executeControlAction`).
