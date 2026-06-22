# Changelog

## 0.2.0

- Fix: **Globaler `window.fetch`-Override** — alle fetch-Aufrufe (auch ohne `resolveUrl()`) werden automatisch mit dem HA-Ingress-Pfad geprefixed; verhindert stille Fehler bei neu hinzugefügten Hooks
- Fix: `use-devices.ts` — alle fetch-Aufrufe nutzen jetzt `resolveUrl()`; das war der Root-Cause für den Ingress-Fehler (erster API-Call der App war ungepatched)
- Fix: `server/static.ts` — Ingress-Skript-Injection robuster: verwendet `JSON.stringify` für sicheres Escaping und separiertes `basePath`-Format

## 0.1.9

- Feature: Register-Tags — jeder Sensor/Aktor bekommt Tags (Außen, Innen, Zuluft, Temperatur, etc.)
- Feature: Register bearbeiten — Name, Einheit und Tags per Dialog editierbar (Zahnrad-Icon beim Hover)
- Feature: Externe Sensoren bearbeiten — Stift-Icon öffnet Dialog für Name, Typ, Entity-ID, Einheit
- Fix: Alle API-Calls in Hooks nutzen jetzt `resolveUrl()` für korrektes HA-Ingress-Routing
- Fix: Tags werden bei Reconciliation nur auf neuen Registern gesetzt — Nutzer-Edits bleiben erhalten

## 0.1.8

- Fix: API-Calls unter HA Ingress — `resolveUrl()` im Query-Client prefixed alle `/api/*`-Requests mit dem Ingress-Basispfad
- Fix: CORS und No-Cache-Header für Ingress iframe-Einbettung
- Fix: OPTIONS-Preflight-Requests werden korrekt mit 204 beantwortet

## 0.1.7

- Fix: 404-Seite unter HA Ingress — wouter Router erhält den Ingress-Basispfad via `window.__BASE_PATH__`
- Fix: Server injiziert `X-Ingress-Path` als `<script>` in `index.html` für korrekte SPA-Navigation

## 0.1.6

- Fix: Weißes UI unter HA Ingress — Vite baut jetzt mit relativen Asset-Pfaden (`./`) statt absoluten (`/`)

## 0.1.5

- Fix: `/run/postgresql/` Socket-Verzeichnis wird erstellt und an postgres übergeben
- Fix: PostgreSQL-Fehlerlog wird bei Startfehler direkt im HA-Log ausgegeben
- Fix: Web-UI Port von 5000 auf 8099 (Port 5000 oft belegt)

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
