"""Sensor platform for Blauberg S21."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Blauberg S21 sensors."""
    # Example sensors based on the Modbus registers we defined in the web app
    sensors = [
        BlaubergSensor("Temperature", "°C", 3),
        BlaubergSensor("Humidity", "%", 6),
        BlaubergSensor("CO2", "ppm", 7),
    ]
    async_add_entities(sensors)

class BlaubergSensor(SensorEntity):
    """Representation of a Blauberg Sensor."""

    def __init__(self, name, unit, address):
        self._attr_name = f"Blauberg {name}"
        self._attr_native_unit_of_measurement = unit
        self._address = address
        self._attr_native_value = 0 # Placeholder for polled value
