# Blauberg S21 Ventilation Controller

Home Assistant Add-on zur Steuerung und Automation von Blauberg S21 Lüftungsgeräten über Modbus TCP.

## Funktionen

- **Modbus TCP Steuerung**: Direkte Kommunikation mit S21 Lüftungsgeräten
- **Web-Dashboard**: Eingebettetes UI über Home Assistant Ingress
- **Automatisierung**: Regelbasierte Steuerung (z.B. bei CO2, Temperatur, Luftfeuchtigkeit)
- **Home Assistant Integration**: Automatische Sensor-Erkennung und Steuerung über MQTT Discovery
- **Externe Sensoren**: Nutzung von Home Assistant Sensoren für Automation
- **Saisonale Steuerung**: Sommer-/Winter-Profile für automatische Umstellung

## Voraussetzungen

- Home Assistant mit Supervisor
- MQTT Broker (empfohlen: Mosquitto Add-on) - wird automatisch erkannt

## Konfiguration

| Option | Beschreibung | Standard |
|--------|-------------|----------|
| `s21_ip` | IP-Adresse des S21 Geräts | `192.168.1.100` |
| `s21_port` | Modbus TCP Port | `502` |
| `s21_slave_id` | Modbus Slave ID | `1` |
| `mqtt_host` | MQTT Broker (optional, auto-detected) | - |
| `mqtt_port` | MQTT Port | `1883` |
| `mqtt_user` | MQTT Benutzer | - |
| `mqtt_password` | MQTT Passwort | - |
| `ha_token` | Long-Lived Token (optional, Supervisor wird auto-detected) | - |
| `poll_interval` | Abfrageintervall in Sekunden | `30` |

## Home Assistant Integration

Das Add-on stellt automatisch folgende Entities bereit (via MQTT Discovery):

### Sensoren
- Temperaturen (Outdoor, Supply, Extract, Exhaust)
- Luftfeuchtigkeit
- CO2 Level
- Filter Status

### Schalter
- System Ein/Aus
- Boost Schalter

### Zahlen (Slider)
- Fan Speed (Stufe 1-5)
- Temperatur-Sollwert

### Auswahl
- Operation Mode (Lüftung, Heizung, Kühlung, Auto)
- Bypass Control (Geschlossen, Offen, Auto)

## Support

Bei Problemen oder Feature-Requests: [GitHub Issues](https://github.com/plasmonized/blauberg-ventilation-addon/issues)
