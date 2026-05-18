# Releases & Updates deployen

Die App hat einen eingebauten Auto-Updater. Installierte Apps prüfen beim
Start (und über *Einstellungen → Updates*), ob auf GitHub eine neuere
Version liegt, und installieren sie auf Knopfdruck.

## Eine neue Version veröffentlichen

```bash
./release.sh 0.2.0
```

Das Skript erledigt:

1. Versionsnummer in `tauri.conf.json`, `package.json` und `Cargo.toml` anheben
2. Commit + Git-Tag `v0.2.0` erstellen
3. Tag zu GitHub pushen

Der Tag löst den Workflow `.github/workflows/release.yml` aus. GitHub Actions
baut die App (macOS, universal) und legt ein **GitHub Release** an mit:

- `Finanz-Manager_0.2.0_universal.dmg` — Installer für Neuinstallationen
- `*.app.tar.gz` + `*.sig` — signierte Update-Pakete
- `latest.json` — das Manifest, das der Updater abfragt

Bereits installierte Apps sehen das Update beim nächsten Start automatisch.

## Einmalige Einrichtung (bereits erledigt)

- **Repo:** `NetworkHybrid/finanz-manager` (öffentlich — nötig, damit der
  Updater die Release-Dateien ohne Token laden kann)
- **Signaturschlüssel:** liegt unter `~/.tauri/finanz-manager-updater.key`
  (privat, **niemals committen**). Der öffentliche Schlüssel steht in
  `tauri.conf.json` unter `plugins.updater.pubkey`.
- **Repo-Secret:** `TAURI_SIGNING_PRIVATE_KEY` enthält den privaten Schlüssel,
  damit CI die Update-Pakete signieren kann.

> ⚠️ Geht der private Schlüssel verloren, können keine Updates mehr
> signiert werden und der Auto-Updater bricht ab. Schlüsseldatei sichern!

## Lokal einen Installer bauen

```bash
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/finanz-manager-updater.key)" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
npm run build
```

Ergebnis unter `src-tauri/target/release/bundle/` (`dmg/`, `macos/`).

## Hinweis zur Installation (unsigniert)

Die App ist nicht mit einer Apple Developer ID signiert. Beim **ersten**
Start meldet macOS „nicht verifizierter Entwickler". Lösung: App im
Finder per **Rechtsklick → Öffnen** starten — danach merkt sich macOS die
Freigabe. Auto-Updates laufen anschließend ohne weitere Warnung.
