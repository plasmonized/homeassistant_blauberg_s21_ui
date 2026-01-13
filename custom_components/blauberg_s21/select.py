"""Select platform for Blauberg S21."""
from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Blauberg S21 selects."""
    async_add_entities([
        BlaubergSelect("Fan Speed", 2, ["Low", "Medium", "High"]),
        BlaubergSelect("Operation Mode", 3, ["Ventilation", "Heating", "Cooling", "Auto"]),
        BlaubergSelect("Bypass Mode", 4, ["Auto", "Open", "Closed"]),
    ])

class BlaubergSelect(SelectEntity):
    """Representation of a Blauberg Select entity."""

    def __init__(self, name, address, options):
        self._attr_name = f"Blauberg {name}"
        self._address = address
        self._attr_options = options
        self._attr_current_option = options[0]

    async def async_select_option(self, option: str) -> None:
        """Change the selected option."""
        self._attr_current_option = option
        self.async_write_ha_state()
