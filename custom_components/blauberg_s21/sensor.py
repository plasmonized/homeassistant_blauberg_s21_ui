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
        BlaubergSensor("Intake Temperature", UnitOfTemperature.CELSIUS, 10, SensorDeviceClass.TEMPERATURE),
        BlaubergSensor("Extract Temperature", UnitOfTemperature.CELSIUS, 11, SensorDeviceClass.TEMPERATURE),
        BlaubergSensor("Humidity", PERCENTAGE, 12, SensorDeviceClass.HUMIDITY),
        BlaubergSensor("CO2 Level", CONCENTRATION_PARTS_PER_MILLION, 13, SensorDeviceClass.CO2),
        BlaubergSensor("Filter Remaining", "h", 20, None),
    ]
    async_add_entities(sensors)

class BlaubergSensor(SensorEntity):
    """Representation of a Blauberg Sensor."""

    def __init__(self, name, unit, address, device_class):
        self._attr_name = f"Blauberg {name}"
        self._attr_native_unit_of_measurement = unit
        self._address = address
        self._attr_device_class = device_class
        self._attr_state_class = SensorStateClass.MEASUREMENT
        self._attr_native_value = None
