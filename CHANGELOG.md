# Changelog

## 0.1.4

- Fix: `chown -R postgres /var/lib/postgresql/` — Parent-Ordner gehört jetzt postgres (Log-Datei konnte nicht erstellt werden)
- Fix: PostgreSQL Log-Datei direkt im Data-Verzeichnis (`$PG_DATA/server.log`)

## 0.1.3

- Fix: PostgreSQL Log-Pfad auf `/var/lib/postgresql/postgresql.log` (kein Permission-Fehler mehr)
- Fix: initdb läuft nur beim ersten Start (Check auf `PG_VERSION` statt Ordner)
- Fix: pg_hba.conf Eintrag idempotent (kein Duplikat bei Restart)
- Fix: Supervisor-Token via `$SUPERVISOR_TOKEN` Env-Var (korrekte HA-Methode)

## 0.1.2

- armv7 entfernt (deprecated), nur noch aarch64 + amd64
- Build-Fix: package-lock.json aus Repo entfernt (Replit-Registry-Konflikt)
- Base-Image auf Alpine 3.21 (Node.js 22.x für Vite 7 Kompatibilität)

## 0.1.1

- Korrekte S21 Register-Map nach offiziellem Handbuch (Lüfterstufen 1–5, Bypass Auto/Offen/Geschlossen)
- Dashboard: Auto-Redirect zum einzelnen Gerät, Setup-Screen wenn kein Gerät vorhanden
- Bypass-Konfiguration: 3-Tasten-Layout (Icon + Label) ohne Darstellungsfehler
- Heizregister-Schalter in Steuerungsprofilen mit Flammen-Toggle
- Polling-Intervall auf 10 Sekunden reduziert (war 30 s)
- Gerät gelöscht → Weiterleitung zum Setup-Screen statt "not found"
- Korrekte Addon-Dateistruktur für Home Assistant Build-Prozess

## 1.0.0

- Erstveröffentlichung
- Modbus TCP Steuerung für Blauberg S21
- Web-Dashboard mit Ingress-Support
- Automatisierung mit Regeln und Hysterese
- Home Assistant MQTT Discovery
- Auto-Erkennung von Supervisor API und MQTT Broker
- Unterstützung externer HA-Sensoren in Automatisierung
- Saisonale Profile (Sommer/Winter)
