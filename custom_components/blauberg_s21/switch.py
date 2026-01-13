"""Switch platform for Blauberg S21."""
from __future__ import annotations

from homeassistant.components.switch import SwitchEntity, SwitchDeviceClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Blauberg S21 switches."""
    async_add_entities([
        BlaubergSwitch("System Power", 1, SwitchDeviceClass.SWITCH),
        BlaubergSwitch("Standby Mode", 5, SwitchDeviceClass.SWITCH),
    ])

class BlaubergSwitch(SwitchEntity):
    """Representation of a Blauberg Switch."""

    def __init__(self, name, address, device_class):
        self._attr_name = f"Blauberg {name}"
        self._address = address
        self._attr_device_class = device_class
        self._attr_is_on = False

    async def async_turn_on(self, **kwargs):
        """Turn the entity on."""
        self._attr_is_on = True
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs):
        """Turn the entity off."""
        self._attr_is_on = False
        self.async_write_ha_state()
