"""Config flow for Blauberg S21 integration."""
from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_NAME
from .const import DOMAIN, CONF_IP_ADDRESS, CONF_PORT, CONF_SLAVE_ID

class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Blauberg S21."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        errors = {}
        if user_input is not None:
            return self.async_create_entry(title=user_input[CONF_NAME], data=user_input)

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_NAME, default="Blauberg S21"): str,
                    vol.Required(CONF_IP_ADDRESS): str,
                    vol.Required(CONF_PORT, default=502): int,
                    vol.Required(CONF_SLAVE_ID, default=1): int,
                }
            ),
            errors=errors,
        )
