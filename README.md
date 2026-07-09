# Blauberg S21 Ventilation Controller

Home Assistant Add-on zur Steuerung und Automation von Blauberg S21 Lüftungsgeräten über Modbus TCP — inklusive eigenem Web-Dashboard, professioneller Regelungs-Engine, einfachen Automatisierungsregeln und vollständiger Home Assistant Integration (MQTT Discovery oder native Integration).

## Funktionen

- **Modbus TCP Steuerung**: Direkte Kommunikation mit dem S21 (Temperaturen, Feuchtigkeit, CO2, Lüfterstufe, Betriebsmodus, Bypass, Boost, Filterstatus u.a.), automatischer Reconnect nach Verbindungsverlust.
- **Web-Dashboard**: Eigenständiges, deutschsprachiges UI, eingebettet über Home Assistant Ingress oder per Direktzugriff über IP:Port.
- **Live-Anzeige & manuelle Steuerung**: Alle Register auf einen Blick, inkl. tatsächlicher Bypass-Klappenstellung (Ist-Wert in %) getrennt von der eingestellten Bypass-Betriebsart (Soll-Wert).
- **Regelungsprofile (professionelle Regelung)**: PID-basierte Temperatur-, Feuchtigkeits- und CO2-Regelung, Sommer/Winter-Umschaltung, Nachtabsenkung und eine wetterkompensierte Regelung, die Innen- und Außentemperatur gegeneinander abwägt (inkl. optionaler Ansteuerung eines Elektro-Heizregisters).
- **Automatisierungsregeln (einfach)**: Wenn-Dann-Regeln auf Basis von Innen-/Außentemperatur, Luftfeuchtigkeit, CO2, Wettervorhersage oder beliebigen Home-Assistant-Sensoren, mit Hysterese gegen Flattern, Zeitfenstern und saisonaler Einschränkung. Boost-Aktionen können zeitgesteuert automatisch wieder abschalten (z.B. "Boost 20 Minuten nach Fenster-Öffnung").
- **Externe Sensoren**: Automatische Erkennung und Einbindung von Home-Assistant-Sensoren (inkl. Binärsensoren) für Automatisierung und Regelung, mit Suchfeld bei der Sensor-Erkennung.
- **Home Assistant Integration**: Automatische Entity-Erkennung und Steuerung über MQTT Discovery — alternativ steht eine native Python-Integration (`custom_components/blauberg_s21`) zur Verfügung.
- **Hardware-genaue Grenzwerte**: Lüfterstufen sind durchgängig (UI, Home Assistant, Regelungsprofile, Automatisierungsregeln, manuelle Eingaben) auf den tatsächlich unterstützten Bereich 1–3 begrenzt.
- **Nachvollziehbares Protokoll**: Jede Regelungs- und Automatisierungsaktion wird mit Zeitstempel, Messwert und Begründung protokolliert.

## Voraussetzungen

- Home Assistant mit Supervisor
- MQTT Broker (empfohlen: Mosquitto Add-on) — wird automatisch erkannt; alternativ die native Integration verwenden (siehe unten), dann ist kein MQTT-Broker erforderlich

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
| `poll_interval` | Abfrageintervall in Sekunden | `10` |

## Home Assistant Integration (MQTT Discovery)

Das Add-on stellt automatisch folgende Entities bereit (via MQTT Discovery):

### Sensoren
- Temperaturen (Outdoor, Supply, Extract, Exhaust)
- Luftfeuchtigkeit (Innen/Außen)
- CO2 Level
- Filter Status
- **Bypass Status** — tatsächliche physische Klappenstellung in % (schreibgeschützt), unabhängig von der eingestellten Betriebsart

### Schalter
- System Ein/Aus
- Boost Schalter

### Zahlen (Slider)
- Fan Speed (Stufe 1-3)
- Temperatur-Sollwert

### Auswahl
- Operation Mode (Lüftung, Heizung, Kühlung, Auto)
- Bypass Control (Geschlossen, Offen, Auto)

### Native Home-Assistant-Integration (Alternative zu MQTT)
Unter `custom_components/blauberg_s21` liegt eine eigenständige Python-Integration, die dieselben Werte und Steuerelemente direkt per Modbus bereitstellt (Sensoren, Binärsensoren, Schalter, Zahlenfelder, Auswahlfelder) — nützlich, falls kein MQTT-Broker eingesetzt werden soll. Installation manuell über HACS oder Kopieren des Ordners nach `config/custom_components/`.

## Regelungsprofile

Im Bereich "Regelungsprofile" eines Geräts lassen sich professionelle Regelungsschemen anlegen, die der Hintergrund-Automatisierungszyklus laufend auswertet:

| Profil | Funktionsweise |
|--------|-----------------|
| **Temperaturregelung** | PID-Regelung der Lüfterstufe anhand eines Raumtemperatur-Sollwerts |
| **Feuchtigkeitsregelung** | PID-Regelung der Lüfterstufe anhand eines Luftfeuchtigkeits-Sollwerts |
| **CO2-Regelung** | Bedarfsgesteuerte Lüftung mit Notfall-Boost bei Überschreiten eines CO2-Schwellwerts |
| **Sommer/Winter** | Automatische Umschaltung des Betriebsmodus anhand der Außentemperatur |
| **Nachtabsenkung** | Zeitgesteuerte Absenkung von Sollwert/Lüfterstufe in der Nacht, mit Abweichungs-Boost |
| **Wetterkompensiert** | Vergleicht Innen- und Außentemperatur und lüftet nur dann aktiv, wenn es tatsächlich hilft (z.B. kühlere Außenluft im Sommer, wärmere Außenluft im Winter); kann optional ein Elektro-Heizregister mitregeln |

Jede Regelungsaktion wird im Regelungs-Log mit Messwert, Sollwert und Begründung protokolliert.

## Automatisierungsregeln

Für einfachere Fälle stehen klassische Wenn-Dann-Regeln zur Verfügung: Sensor (Innen-/Außentemperatur, Luftfeuchtigkeit, CO2, Wettervorhersage oder ein beliebiger Home-Assistant-Sensor) + Vergleichsoperator + Schwellwert → Aktion (Lüfterstufe, Bypass, Betriebsmodus oder Boost). Optional mit Hysterese, Zeitfenster, Saison-Einschränkung und automatisch befristetem Boost (z.B. für Fenster- oder Bewegungssensoren).

## Support

Bei Problemen oder Feature-Requests: [GitHub Issues](https://github.com/plasmonized/blauberg-ventilation-addon/issues)

Änderungshistorie: siehe [CHANGELOG.md](CHANGELOG.md)
