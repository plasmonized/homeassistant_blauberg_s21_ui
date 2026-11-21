# Fertige Home-Assistant-Images veröffentlichen

## Was sich ändert

Bisher baut Home Assistant das gesamte Add-on auf dem eigenen Gerät.
Der Workflow **Build and release Home Assistant images** übernimmt das auf GitHub:

1. Release-Version aus `package.json` und `package-lock.json` lesen, Changelog prüfen.
2. AMD64 und ARM64 parallel auf nativen GitHub-Runnern bauen und Laufzeitwerkzeuge prüfen.
3. Beide getesteten Varianten als ein versioniertes Image in GHCR veröffentlichen.
4. **Ohne Anmeldung** prüfen, ob beide Plattformen und ihre Home-Assistant-Labels abrufbar sind.
5. Erst danach `image` und `version` in `config.yaml` mit einem automatischen Commit aktualisieren.

Registry: `ghcr.io/<GitHub-Eigentümer>/<Repository>`, automatisch aus dem jeweiligen Repository ermittelt.
Home Assistant verwendet den Tag aus `config.yaml` und wählt die passende Architektur.
Add-on-Slug, Repository-Adresse und `/data` bleiben unverändert; keine Neueinrichtung nötig.
PostgreSQL bleibt in derselben Alpine-3.21-/PostgreSQL-17-Generation. Kein Datenbank-Upgrade.

## Einmalige Einrichtung

1. Änderungen einschließlich **package-lock.json**, `.dockerignore`, `scripts/addon-release.py`
   und `.github/workflows/addon-images.yml` nach GitHub pushen.
2. Unter **Actions** den Workflow öffnen. Er startet bei relevanten Änderungen auf `main`
   automatisch oder lässt sich über **Run workflow → main** starten.
3. Der Workflow nutzt ausschließlich den automatisch bereitgestellten `GITHUB_TOKEN`.
   Seine Berechtigungen werden in der Workflow-Datei angefordert: Pakete schreiben und
   im abschließenden Job den Freigabe-Commit schreiben. Kein eigener Zugangsschlüssel nötig.
4. **Beim ersten Upload** kann das Container-Paket zunächst privat sein. Dann blockiert
   die öffentliche Prüfung absichtlich, während `config.yaml` unverändert bleibt.
   Auf der GitHub-Repository-Seite unter **Packages** das Paket öffnen:
   **Package settings → Change visibility → Public**.
   Dabei wird das gebaute Programm öffentlich herunterladbar, nicht die Nutzerdaten
   aus Home Assistant. Diese sind nicht Teil des Build-Kontexts.
5. Anschließend den Workflow **erneut über Run workflow auf dem aktuellen main** starten.
   Bereits veröffentlichte Images mit identischen Quellen werden wiederverwendet,
   nicht unter derselben Versionsnummer ersetzt.
6. Nach erfolgreichem Freigabe-Commit in Home Assistant nach Updates suchen.
   Der Workflow schreibt diesen Commit auf `main`. Vor weiteren lokalen Änderungen
   den neuen Stand aus GitHub synchronisieren, damit keine veraltete Konfiguration
   zurückgeschrieben wird.

Wenn GitHub-Richtlinien das Schreiben durch Actions verbieten oder `main` geschützt ist,
bleibt der Freigabe-Commit aus. Nicht den Schutz abschalten oder mit Force-Push umgehen.
Stattdessen auf dem aktuellen Stand lokal die öffentliche Prüfung und Änderung ausführen:

```sh
python3 scripts/addon-release.py activate --repository plasmonized/homeassistant_blauberg_s21_ui
```

Danach **nur die geprüfte Änderung an `config.yaml`** über den üblichen Review-/Push-Weg übernehmen.
Das Skript prüft selbst nochmals anonym beide Plattformen. Nicht von Hand vorab `image` eintragen.

## Nächste Versionen

- In `package.json`, den beiden Root-Versionsfeldern in `package-lock.json` und
  `CHANGELOG.md` die nächste Version vorbereiten.
- **`config.yaml` noch nicht hochsetzen.** Es enthält die zuletzt freigegebene Version.
- Nach dem Push baut und veröffentlicht GitHub. Erst die erfolgreiche Prüfung schaltet
  die neue Version für Home Assistant frei.
- Zwischen Build und Freigabe darf `main` nicht weitergelaufen sein. Andernfalls den
  Workflow vom aktuellen `main` erneut starten. Bei geänderten Image-Quellen eine neue
  Versionsnummer verwenden; veröffentlichte Tags werden nicht überschrieben.
- Keine Registry-Pakete oder Versionstags löschen, die noch installiert sein könnten.

**Vor der ersten erfolgreichen Veröffentlichung ist die Umstellung noch nicht aktiv.**
Die absichtliche Versionsdifferenz zwischen `package.json` (vorbereitet) und `config.yaml`
(freigegeben) verhindert nicht herunterladbare Update-Angebote.

## Geschwindigkeit und Fortschritt

Das Installationsgerät lädt und entpackt künftig fertige Image-Schichten, statt npm,
TypeScript und Vite selbst auszuführen. Wie lange das dauert, hängt von Netzwerk,
Datenträger und vorhandenen Image-Schichten ab.
Die Fortschrittsanzeige liefert weiterhin Home Assistant/Supervisor. Download-Fortschritt
kann angezeigt werden; keine erfundenen Prozentwerte und keine Garantie für jede Phase.

Der Docker-Build hat einen separaten Bau- und Laufzeitabschnitt. Compiler und Python
landen nicht im Laufzeit-Image. Die Node-Werkzeuge für `db:push` bleiben bewusst erhalten,
weil der bisherige Startablauf sie benötigt. Keine Änderungen an Datenbank-Migrationen
oder Regelung.

Prüfung ohne Veröffentlichung:

```sh
npm run test:addon-release
python3 scripts/addon-release.py metadata --repository plasmonized/homeassistant_blauberg_s21_ui
```
