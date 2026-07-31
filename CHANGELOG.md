# Changelog

## 0.3.6.2

- **Hotfix: Anlage blieb dauerhaft im Hitzeschutz-Standby** — Der S21-Coil an Adresse 0 (System State) beantwortet Lesevorgänge zuverlässig mit einem Timeout (231 Timeouts in einem Session-Log). Nach einem Wakeup-Schreibvorgang (`coil=true`) wurde der DB-Wert auf 1 gesetzt, anschließende Lesevorgänge timten jedoch immer aus — der DB-Wert blieb daher dauerhaft auf 1 stehen, selbst wenn das Gerät physisch noch im Standby war. `unitCurrentlyOff` las diesen veralteten DB-Wert und kam zum Schluss, die Anlage laufe — weitere Wakeup-Versuche wurden unterdrückt. Fix: Standby-Zustand wird jetzt in einer In-Memory-Map (`hitzeschutzStandby`) getrackt, die ausschließlich durch eigene Schreibvorgänge (Standby-Befehl setzt `true`, Wakeup-Befehl löscht auf `false`) gesteuert wird. Coil-Lesetimeouts haben darauf keinen Einfluss mehr.

## 0.3.6.1

- **Hotfix: Anlage blieb nach Schwellwert-Erhöhung ausgeschaltet** — Drei zusammenwirkende Fehler verhinderten den Wiederanlauf nach Hitzeschutz-Standby: (1) Fan-Speed-Register zeigte bereits den Zielwert → Automation wertete das als „nichts zu tun" und prüfte den Coil nie; (2) `isStandbyTransition`-Erkennung schlug fehl, sobald `profileLastAction.value` durch einen früheren Teil-Wakeup auf 1 gesetzt wurde; (3) Polling-Loop speichert Coil-Werte als String `"false"` — `Number("false")` ergibt `NaN`, nicht `0`, wodurch der Wake-up-Coil-Schreibvorgang stets still übersprungen wurde. Fix: eingeschaltete Anlage mit ausgeschaltetem Coil wird jetzt als „Drift" erkannt, was alle drei Schutzmechanismen (Redundanz-Skip, Haltezeit, Coil-Check) korrekt überbrückt.

## 0.3.6

- **Fix: Hitzeschutz-Sektion fehlte im Profil-Dialog** — `heatProtectionEnabled` war in `defaultParams` eingetragen aber fehlte in `paramLabels`. Da der Dialog nur Parameter rendert, die in `paramLabels` stehen, wurde die gesamte Hitzeschutz-Sektion (Toggle, Abschalten-Schwellenwert, CO₂-Override, Feuchte-Override) für neue und bestehende Profile nicht angezeigt.

- **Feature: Hitzeschutz-Parameter im Dialog gruppiert** — CO₂-Override und Feuchte-Override-Schwellenwerte erscheinen jetzt direkt unterhalb des Abschalten-Schwellenwerts im Hitzeschutz-Abschnitt des Profil-Dialogs. Beide Felder werden ausgegraut wenn der Hitzeschutz-Toggle ausgeschaltet ist. Zuvor lagen sie im Erweitert-Bereich ohne erkennbaren Bezug zum Hitzeschutz.

- **Feature: Hitzeschutz bleibt nach Serverneustart dauerhaft deaktiviert** — Wenn `heatProtectionEnabled` auf `false` gesetzt ist, wird der Standby-Pfad jetzt auch nach einem Serverneustart zuverlässig übersprungen. Zuvor konnte ein Neustart dazu führen, dass der gespeicherte `heatProtectionEnabled: false`-Wert ignoriert wurde.

- **Feature: Hitzeschutz-Badge aktualisiert sich automatisch** — Die Profil-Karten fragen den Regelungsverlauf jetzt regelmäßig ab, sodass das Hitzeschutz-Badge (aktiv / Override) ohne Seitenreload erscheint oder verschwindet, sobald sich der Zustand ändert.

- **Infrastruktur: Einheitlicher Test-Runner** — `npm test` führt alle `test:*`-Skripte automatisch in alphabetischer Reihenfolge aus und bricht bei der ersten Fehler ab. Neue Testsuiten werden durch Eintragen in `package.json` als `"test:<name>"` automatisch aufgenommen.

## 0.3.5

- **Feature: Hitzeschutz-Standby mit selektivem Wiederanlauf** — Das Wetterkompensiert-Profil kann die Anlage jetzt automatisch auf Standby schalten, wenn die Außentemperatur einen konfigurierbaren Schwellenwert überschreitet (Standard: 32°C). Da bei Hitze ein Wärmeeintrag durch die Lüftung kontraproduktiv ist – selbst mit Wärmetauscher kann der Tauscher die Zuluft nur auf Innentemperatur kühlen, nie darunter – stoppt der Hitzeschutz die Anlage vollständig über den System-State-Coil. Zwei Sicherheits-Overrides verhindern eine zu lange Unterbrechung: Übersteigt der CO₂-Wert einen konfigurierbaren Grenzwert (Standard: 1000 ppm) oder die Luftfeuchte einen Grenzwert (Standard: 65%), wird die Anlage automatisch auf Stufe 1 gezwungen um Frischluft sicherzustellen – auch bei Hitze. Sinkt die Außentemperatur wieder unter den Schwellenwert, schaltet die Anlage selbstständig wieder ein und setzt die normale Wetterkompensierung fort. Standby-Übergänge umgehen die Mindesthaltedauer (hold-time), um sofort zu reagieren. Der Schwellenwert kann im Profil-Dialog unter "Hitzeschutz: Abschalten ab (°C)" konfiguriert werden; bei 0 ist der Hitzeschutz deaktiviert.

## 0.3.4

- **Fix (kritisch): Falscher externer Sensor blockierte Lüftungsregelung** — war ein externer Sensor ursprünglich als Typ "Außentemperatur" konfiguriert und wurde danach (z.B. weil das HA-Gerät seit Tagen offline ist, aber weiterhin einen eingefroren Wert liefert) auf "Temperatur allgemein" umgetypt, griff ein zu großzügiger Fallback: `findExt("outdoor_temp") || findExt("temperature")` — der umbenannte Sensor wurde trotzdem als Außentemperaturquelle verwendet. Da HA weiterhin den alten Wert zurückliefert, wird `updatedAt` bei jedem Zyklus aktualisiert; der Stale-Check aus v0.3.3 greift damit nie. Die Folge: die Automation rechnete z.B. mit 21,7 °C (Stundenwert von vor 2 Tagen) statt den 27,5 °C vom S21-Register — das Profil berechnete permanent "Kühlen: Stufe 3", Skip feuerte (Stufe 3 = Letzter Wert), und der Lüfter blieb stundenlang auf Stufe 3 ohne einen einzigen Logeintrag. Der `"temperature"`-Fallback wurde entfernt: Nur noch Sensoren mit explizitem Typ `outdoor_temp` gelten als externe Außentemperaturquelle. Das respektiert direkt die Nutzeraktion "Typ ändern, um einen Sensor aus der Außentemperatur-Erkennung herauszunehmen".

- **Feature: Veraltete externe Sensoren werden im Dashboard markiert** — im Bereich "Externe Sensoren" zeigt jede Sensorkarte jetzt ein orangenes Warnung-Badge, wenn der Sensor seit mehr als 30 Minuten keinen neuen Wert von Home Assistant erhalten hat (konfigurierbar via `SENSOR_STALE_MINUTES`). Das Badge verschwindet automatisch, sobald der Sensor wieder frische Daten liefert. Zusätzlich aktualisiert sich die Sensorübersicht alle 60 Sekunden selbstständig, sodass neu veraltete oder wieder aktive Sensoren ohne Seitenreload sichtbar werden.

## 0.3.3

- **Fix (kritisch): Regelungs-Engine konnte stundenlang einfrieren** — jsmodbus wartet bei einem TCP-Request ohne Antwort (S21-Firmware hängt, Paket verloren) unbegrenzt. Mit dem in v0.3.1 eingeführten `setTimeout`-Kettenansatz (kein Überlappen mehr) bedeutete ein einziger solcher hängender Register-Read, dass kein weiterer Automatisierungs-Zyklus mehr anlief — keine Lüftungsregelung, keine Logeinträge, bis zum nächsten Neustart. Ein harter 60-Sekunden-Cycle-Timeout beendet jetzt jeden feststeckenden Zyklus, schließt alle Modbus-Verbindungen um ausstehende Requests sofort zu entleeren, und plant den nächsten Zyklus zuverlässig 10 Sekunden später.

- **Fix: Socket-Timeout zerstörte Verbindung mitten im Poll** — `socket.setTimeout(5000)` wurde zur Verbindungsphase gesetzt, blieb aber danach aktiv. Bei 16 Registern in Serie konnte eine kurze Pause (Serialisierungs-Lock, langsame S21-Antwort) dazu führen, dass der Timeout mitten im Poll feuerte — der Socket wurde zerstört, alle verbleibenden Register scheiterten mit „Offline", der Zyklus galt als Totalausfall und die Profile wurden übersprungen. `socket.setTimeout(0)` wird jetzt unmittelbar nach erfolgreichem Connect gesetzt, sodass der Timeout nur noch während der Verbindungsphase gilt.

- **Fix: Einzelne Register-Reads können jetzt maximal 5 Sekunden hängen** — jeder Modbus-Lesezugriff in `poll.ts` läuft jetzt in einem `Promise.race` mit einem 5-Sekunden-Timeout. Ein eingefrorener Read gilt nach 5 Sekunden als Fehler (failedCount++), der Poll läuft mit den restlichen Registern weiter. Im Worst-Case (alle 16 Register hängen) dauert ein Zyklus maximal ~80 Sekunden statt unbegrenzt; in der Praxis sind fehlerhafte Reads in Millisekunden erledigt (jsmodbus meldet „Offline" sofort).

- **Fix: Veralteter HA-Sensor hielt Lüfterstufe stundenlang falsch** — wenn ein Regelungsprofil mit `Externe Sensoren` konfiguriert ist und der HA-Sensor ausfällt oder längere Zeit keine neuen Werte liefert (HA-Neustart, Sensor offline), blieb der letzte bekannte Wert (z.B. 21 °C vom Vorjabend) in der Datenbank stehen. Die Regelungslogik verwendete diesen veralteten Wert, berechnete die falsche Lüfterstufe, der Skip-Check feuerte (Ergebnis = Letzter Wert) und der Lüfter blieb stehen — ohne jeden Hinweis im Log. Sensoren die seit mehr als 30 Minuten nicht aktualisiert wurden (konfigurierbar via Umgebungsvariable `SENSOR_STALE_MINUTES`) werden jetzt ignoriert; stattdessen wird automatisch auf das direkt vom Gerät gelesene Register zurückgefallen. Bei jedem Fallback erscheint eine Warnung im Add-on-Log.

- **Feature: Regelverlauf zeigt jetzt mehrere Tage** — bisher waren maximal 20 Einträge sichtbar (und durch den Burst-Bug aus früheren Versionen oft vollständig mit gleichartigen Einträgen gefüllt). Der Verlauf zeigt jetzt 25 Einträge pro Seite mit Vor-/Zurück-Navigation und einem Zähler „Seite X von Y (N Einträge gesamt)". Das Backend speichert unbegrenzt viele Einträge und liefert sie paginiert aus.

- **Diagnose-Log pro Zyklus** — im Add-on-Log erscheint jetzt bei jedem Regelungs-Zyklus eine Zeile der Form `[Control] Profile 12 (weather_compensated): outdoor=25.5, indoor=26.1, result=1, last=3`. Damit ist sofort erkennbar ob die Regelung läuft, welche Temperaturen verwendet werden, was berechnet wird und warum Skip/Hold feuert oder ein Schreibzugriff ausgelöst wird.

## 0.2.12

- Fix: **Farben und Namen im 48h-Verlaufsdiagramm angeglichen** — die Linien im Temperatur-Verlaufsdiagramm verwenden jetzt exakt dieselben deutschen Bezeichnungen (Außenluft, Zuluft, Abluft, Fortluft) und Farben (blau/grün/rot/orange) wie die Systemübersicht-Grafik direkt darüber.

## 0.2.11

- Feature: **Virtuelle Mittelwert-Sensoren** — im Bereich "Externe Sensoren" kann jetzt ein neuer Sensor-Typ "Mittelwert-Sensor" angelegt werden. Dieser berechnet automatisch den Durchschnitt mehrerer vorhandener Sensoren (z.B. Innen-Temperaturen aus verschiedenen Räumen) und stellt das Ergebnis als normalen Sensor für Regelungsprofile zur Verfügung. Name, Sensor-Typ (z.B. Innen-Temperatur) und Einheit sind frei wählbar; die Einheit wird nach Sensor-Typ vorgeschlagen. Die Quell-Sensoren werden per Checkbox ausgewählt; der Mittelwert wird bei jedem Automatisierungs-Zyklus nach dem Home-Assistant-Sync berechnet und auf eine Dezimalstelle gerundet gespeichert. Virtuelle Sensoren stehen unmittelbar in den Regelungs-Profil-Dropdowns zur Verfügung.
- Feature: **Sensor-Auswahl pro Messtyp in Regelungs-Profilen** — beim Bearbeiten eines Regelungs-Profils kann jetzt pro benötigtem Messtyp (Innentemperatur, Außentemperatur, Luftfeuchtigkeit, CO₂) ein spezifischer externer Sensor ausgewählt werden. Die Dropdowns zeigen nur kompatible Sensoren an (z.B. erscheint ein Feuchte-Sensor nicht unter Innentemperatur) und berücksichtigen auch virtuelle Mittelwert-Sensoren. Die Auswahl wird als `sensorMappings` in den Profil-Parametern gespeichert und vom Automatisierungs-Engine direkt ausgewertet.
- Feature: **48h Sensor-Verlauf** — die Übersicht-Seite zeigt jetzt Verlaufsdiagramme (Recharts) für alle numerischen Register der letzten 48 Stunden. Werte werden alle 5 Minuten in der Tabelle `sensor_readings` aufgezeichnet und automatisch nach 50 Stunden bereinigt. Neuer API-Endpunkt `/api/devices/:id/sensor-history` liefert die Daten als 30-Minuten-Buckets.
- Feature: **MQTT-Status-Badge** — in der Geräte-Kopfzeile wird der aktuelle MQTT-Verbindungsstatus als Badge angezeigt ("MQTT verbunden" / "MQTT getrennt"). Status wird über den neuen Endpunkt `/api/status` abgefragt.
- Fix: **Fehler beim Öffnen des Sensor-Auswahlmenüs in Regelungs-Profilen** — ein Radix-UI-Fehler trat auf, wenn ein `<SelectItem>` einen leeren String als Wert hatte. Der "Automatisch"-Eintrag verwendet jetzt den Sentinel-Wert `"none"` statt `""`, was den Fehler behebt.

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
