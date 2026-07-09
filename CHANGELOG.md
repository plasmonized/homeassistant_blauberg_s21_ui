# Changelog

## 0.2.10

- **Fix (wichtig): Lüfterstufen auf 1-3 begrenzt** — die S21-Hardware unterstützt nur die Lüfterstufen 1-3, die App erlaubte/berechnete bisher aber überall bis zu Stufe 5 (Buttons in der Oberfläche, Home-Assistant-Integration, Regelungsprofile und Automatisierungsregeln). Betroffen waren die Bedienelemente, die MQTT-/Home-Assistant-Entitäten, alle Regelungsprofile (Temperatur-, Feuchtigkeits-, CO2-Regelung, Nachtabsenkung, Wetterkompensiert) sowie manuelle Register-Schreibzugriffe und Automatisierungsregeln. Werte über 3 werden jetzt an jeder Stelle auf 1-3 begrenzt — beim Speichern eines Profils/einer Regel ebenso wie unmittelbar vor dem Schreiben auf das Gerät. Bereits gespeicherte Profile/Register mit veralteten Werten über 3 wurden einmalig korrigiert.

## 0.2.9

- Feature: **Tatsächlicher Bypass-Zustand sichtbar** — bisher zeigte die Karte "Bypass Control" nur die eingestellte Betriebsart (Geschlossen/Offen/Auto), aber nicht, was die Klappe gerade tatsächlich macht. Besonders im Modus "Auto" (z.B. sommerliche Nachtauskühlung) war dadurch nicht erkennbar, ob der Bypass gerade offen oder geschlossen ist. Eine neue, schreibgeschützte Karte "Bypass Status" zeigt direkt daneben die reale Klappenstellung in Prozent (0% = geschlossen, 100% = offen) an — ausgelesen aus dem Register `IR_StatusBpsRotor` des Geräts. Zur Klarstellung: Die Temperaturregelung der App steuert den Bypass nicht aktiv; das bleibt der eigenen Auto-Logik der Anlage (bzw. einer manuell konfigurierten Automatisierungsregel) überlassen — die neue Anzeige macht nur sichtbar, was das Gerät selbst entschieden hat.

## 0.2.8

- **Fix: Automatischer Reconnect nach Verbindungsverlust** — bisher übersprang der Hintergrund-Automatisierungszyklus ein Gerät komplett, sobald es einmal als "getrennt" markiert war, und wartete auf einen manuellen Klick auf "Connect". Dadurch stand die Anlage nach einem kurzen Netzwerkaussetzer, einem Neustart des Add-ons oder einem Reboot des S21 dauerhaft auf "Getrennt", bis man die Oberfläche öffnete und manuell neu verband. Der Zyklus versucht jetzt bei jedem Durchlauf (Standard: alle 10s) automatisch erneut zu verbinden, auch wenn das Gerät gerade als getrennt gilt — die Verbindung stellt sich damit von selbst wieder her, ohne dass ein manuelles Eingreifen nötig ist.

## 0.2.7

- Feature: **Boost-Automatisierung per Home-Assistant-Sensor** — im Bereich "Automatisierung" kann jetzt ein neuer Trigger-Typ konfiguriert werden: Sobald ein beliebiger Home-Assistant-Sensor vom Typ "Binär" (z.B. Fenster-, Bewegungs- oder Präsenzsensor) auf "ein" wechselt, aktiviert das Addon automatisch für eine frei wählbare Dauer (in Minuten) die Boost-Funktion des S21 und schaltet sie danach selbstständig wieder ab. Der Trigger läuft als ganz normale Automatisierungsregel und kann daher beliebig oft parallel zu bestehenden Regeln (auch mehreren Boost-Triggern gleichzeitig) verwendet werden, ohne dass sie sich gegenseitig abschalten — Boost bleibt so lange aktiv, wie mindestens ein Trigger es anfordert.
- Home-Assistant-Sensor-Erkennung berücksichtigt jetzt neben `sensor`-Entitäten auch `binary_sensor`-Entitäten (Sensor-Typ "Binär") — sowohl bei der automatischen Erkennung als auch beim manuellen Anlegen externer Sensoren.

## 0.2.6

- Feature: **Suchfeld für entdeckte Home Assistant Sensoren** — bei "Sensoren entdecken" im Bereich Externe Sensoren kann die Liste jetzt live nach Name, Entity ID oder Sensor-Typ gefiltert werden. Zeigt zusätzlich einen Zähler ("X von Y") an und eine Hinweismeldung, wenn die Suche keine Treffer ergibt.

## 0.2.5

- **Fix: "Last seen" aktualisierte sich nicht automatisch** — der Hintergrund-Automatisierungszyklus (alle `poll_interval` Sekunden) hat MQTT-Werte publiziert und Regeln ausgewertet, aber **nie neue Register-Werte vom Gerät gelesen** und `lastSeen` nie aktualisiert. Beides passierte bisher ausschließlich beim manuellen "Poll Now"-Klick oder beim initialen Verbinden. Dadurch blieben nicht nur die Zeitstempel stehen, sondern Automatisierungsregeln und Regelungsprofile arbeiteten unbemerkt mit veralteten (teils stunden-/tagealten) Sensorwerten. Der Automatisierungszyklus liest jetzt bei jedem Durchlauf frische Register-Werte vom Gerät und aktualisiert `lastSeen`/Verbindungsstatus, bevor Regeln ausgewertet werden.
- Fix: Das konfigurierte `poll_interval` (Sekunden) wurde vom Server bisher komplett ignoriert — der Zyklus lief immer fest alle 10s. Der Wert aus den Addon-Einstellungen wird jetzt tatsächlich verwendet.

## 0.2.4

- **Fix (kritisch): 404-Seite der App selbst unter Ingress** — `express.static()` lieferte bei Verzeichnis-Anfragen (z.B. `/`) automatisch die unveränderte `index.html` direkt aus dem Build-Ordner aus, noch bevor der eigentliche Handler zum Zug kam, der das Skript zum Setzen des Ingress-Basispfads (`window.__BASE_PATH__`) einfügt. Dadurch dachte der Router, die App liefe auf `/` statt im Ingress-Unterpfad, fand keine passende Route und zeigte seine eigene "Seite nicht gefunden"-Meldung — sichtbar am charakteristischen "Did you forget to add the page to the router?"-Text. `express.static()` läuft jetzt mit `{ index: false }`, sodass jede Seitenanfrage zuverlässig durch den Handler läuft, der den Basispfad korrekt einfügt. Dieser Bug bestand vermutlich schon länger, wurde aber erst nach den vorherigen Netzwerk-Fixes sichtbar, da Anfragen davor den Container gar nicht erst erreichten.

## 0.2.3

- **Fix (kritisch): Ingress lieferte 404 Not Found** — `ports: 8099/tcp: 8099` und `ingress_port: 8099` zeigten auf denselben Port. Supervisor's Ingress-Proxy und die feste externe Portfreigabe konkurrieren um denselben Listener, wenn beide aktiv auf den gleichen Port zeigen — das führt zu 404/502/503-Fehlern beim Öffnen des Ingress-Panels. `ports` steht jetzt auf `null` (nicht standardmäßig freigegeben); Direktzugriff per IP bleibt weiterhin möglich, muss aber einmalig unter Addon → Konfiguration → **Netzwerk** mit einem Port belegt werden (z.B. wieder 8099).

## 0.2.2

- **Fix (kritisch): Oberfläche komplett unerreichbar** — Der interne Web-Server band an den frei konfigurierbaren `web_port` (bei betroffenen Installationen z.B. 8089), während `ingress_port`/`ports` in `config.yaml` fest auf 8099 verdrahtet sind. Sobald `web_port` vom Standard abwich, liefen weder Ingress noch der Direktzugriff per IP:Port mehr auf den tatsächlich lauschenden Server. Der Port ist jetzt fest auf 8099 verdrahtet; eine abweichende `web_port`-Einstellung wird geloggt, aber ignoriert.
- Fix: `services: - mqtt:want` in `config.yaml` ergänzt — behebt einen "Unable to access the API, forbidden"-Fehler beim automatischen MQTT-Service-Erkennungsversuch.

## 0.2.1

- **Fix (kritisch): Datenverlust nach Update/Neustart** — PostgreSQL-Datenverzeichnis lag unter `/var/lib/postgresql` (Container-Dateisystem, wird bei jedem Update/Neuerstellen des Containers gelöscht). Liegt jetzt unter `/data/postgresql` — dem einzigen Verzeichnis, das Home Assistant addon-übergreifend persistiert. Geräte, Register, externe Sensoren und Automatisierungen bleiben jetzt über Updates und Neustarts hinweg erhalten.
- **Fix (kritisch): Ingress-Einbettung funktionierte nie** — `host_network: true` und HA Ingress sind grundsätzlich inkompatibel (Supervisor kann den Container im Host-Netzwerk-Modus nicht über sein internes Docker-Netz erreichen). `host_network` entfernt; Modbus/MQTT-Verbindungen benötigen es nicht (reine ausgehende TCP-Verbindungen funktionieren im normalen Bridge-Netzwerk). Direktzugriff per IP:Port bleibt zusätzlich über `ports:` verfügbar.

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
