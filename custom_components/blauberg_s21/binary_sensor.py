"""Binary sensor platform for Blauberg S21."""
from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Blauberg S21 binary sensors."""
    async_add_entities([
        BlaubergBinarySensor("Boost Active", 3),
    ])

class BlaubergBinarySensor(BinarySensorEntity):
    """Representation of a Blauberg read-only coil."""

    def __init__(self, name, address):
        self._attr_name = f"Blauberg {name}"
        self._address = address
        self._attr_is_on = False
