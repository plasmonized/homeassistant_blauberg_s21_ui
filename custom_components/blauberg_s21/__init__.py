"""The Blauberg S21 integration."""
from __future__ import annotations

import logging
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

# Register all platforms we implemented
PLATFORMS: list[Platform] = [
    Platform.SENSOR, 
    Platform.SWITCH, 
    Platform.NUMBER, 
    Platform.SELECT
]

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Blauberg S21 from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    
    # In a full implementation, we'd initialize the modbus client here
    # and poll the device to verify connectivity.
    
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if unload_ok := await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        hass.data[DOMAIN].pop(entry.entry_id)

    return unload_ok
