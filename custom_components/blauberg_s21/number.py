"""Number platform for Blauberg S21."""
from __future__ import annotations

from homeassistant.components.number import NumberEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Blauberg S21 numbers."""
    async_add_entities([
        BlaubergNumber("Boost Timer", 21, 0, 60, "min"),
    ])

class BlaubergNumber(NumberEntity):
    """Representation of a Blauberg Number entity."""

    def __init__(self, name, address, min_val, max_val, unit):
        self._attr_name = f"Blauberg {name}"
        self._address = address
        self._attr_native_min_value = min_val
        self._attr_native_max_value = max_val
        self._attr_native_unit_of_measurement = unit
        self._attr_native_value = 0

    async def async_set_native_value(self, value: float) -> None:
        """Update the current value."""
        self._attr_native_value = value
        self.async_write_ha_state()
