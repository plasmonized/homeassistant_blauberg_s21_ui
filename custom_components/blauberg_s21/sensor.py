"""Sensor platform for Blauberg S21."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorDeviceClass, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.const import UnitOfTemperature, PERCENTAGE, CONCENTRATION_PARTS_PER_MILLION

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Blauberg S21 sensors."""
    sensors = [
        BlaubergSensor("Outdoor Temperature", UnitOfTemperature.CELSIUS, 1, SensorDeviceClass.TEMPERATURE),
        BlaubergSensor("Supply Temperature", UnitOfTemperature.CELSIUS, 2, SensorDeviceClass.TEMPERATURE),
        BlaubergSensor("Extract Temperature", UnitOfTemperature.CELSIUS, 3, SensorDeviceClass.TEMPERATURE),
        BlaubergSensor("Exhaust Temperature", UnitOfTemperature.CELSIUS, 4, SensorDeviceClass.TEMPERATURE),
        BlaubergSensor("Humidity", PERCENTAGE, 10, SensorDeviceClass.HUMIDITY),
        BlaubergSensor("CO2 Level", CONCENTRATION_PARTS_PER_MILLION, 12, SensorDeviceClass.CO2),
        BlaubergSensor("Bypass Status", PERCENTAGE, 51, None),
        BlaubergSensor("Filter Status", None, 31, None),
    ]
    async_add_entities(sensors)

class BlaubergSensor(SensorEntity):
    """Representation of a Blauberg read-only input register."""

    def __init__(self, name, unit, address, device_class):
        self._attr_name = f"Blauberg {name}"
        self._attr_native_unit_of_measurement = unit
        self._address = address
        self._attr_device_class = device_class
        self._attr_state_class = SensorStateClass.MEASUREMENT if device_class is not None else None
        self._attr_native_value = None
