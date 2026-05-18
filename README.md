# Finanz-Manager

Eine Desktop-App zum Tracken von **Finanzen und Abos**, gebaut mit
[Tauri 2](https://tauri.app/) (Rust) und einem Vanilla-JS-Frontend.

## Funktionen

- **Übersicht** — Kontostand, Monatseinnahmen/-ausgaben, Abo-Kosten,
  Ausgaben nach Kategorie, anstehende Zahlungen, letzte Buchungen
- **Buchungen** — Einnahmen & Ausgaben mit Kategorie, Datum und Notiz
  erfassen, filtern und löschen
- **Abos** — wiederkehrende Zahlungen mit Abrechnungszyklus
  (wöchentlich/monatlich/vierteljährlich/jährlich), Hochrechnung der
  Monats- und Jahreskosten
- **Lokale Speicherung** — alle Daten landen als JSON-Datei im
  App-Verzeichnis des Nutzers, nichts verlässt das Gerät

## Voraussetzungen

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 18+
- macOS: Xcode Command Line Tools

## Starten

```bash
npm install        # Tauri-CLI installieren
npm run dev         # App im Entwicklungsmodus starten
```

Fertige App bauen (DMG / Installer):

```bash
npm run build
```

## Installieren & Updaten

- **Installieren:** Im [Releases-Bereich](https://github.com/NetworkHybrid/finanz-manager/releases)
  die aktuelle `.dmg` laden, öffnen, App in den Programme-Ordner ziehen.
  Beim ersten Start: Rechtsklick → *Öffnen* (App ist unsigniert).
- **Updaten:** Die App prüft selbst auf neue Versionen. Unter
  *Einstellungen → Updates* lässt sich ein Update mit einem Klick
  installieren — die App startet danach automatisch neu.

## Neue Version deployen

```bash
./release.sh 0.2.0
```

GitHub Actions baut daraufhin automatisch das Release. Details in
[RELEASING.md](./RELEASING.md).

## Projektstruktur

```
src/                     Frontend (HTML, CSS, JS)
src-tauri/src/           Rust-Backend (Daten speichern, Update-Logik)
src-tauri/               Tauri-Konfiguration
.github/workflows/       Release-Automatisierung
release.sh               Deploy-Skript für neue Versionen
```

> Version 0.1.0 — Design und Funktionsumfang als Ausgangspunkt gedacht.
