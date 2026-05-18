#!/usr/bin/env bash
#
# Veröffentlicht eine neue Version des Finanz-Managers.
# Hebt die Versionsnummer an, committet, taggt und pusht — GitHub Actions
# baut daraufhin automatisch das Release inkl. Updater-Dateien.
#
#   Nutzung:  ./release.sh 0.2.0
#
set -euo pipefail

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Nutzung: ./release.sh <version>   (z. B. ./release.sh 0.2.0)"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Fehler: Es gibt nicht committete Änderungen. Bitte zuerst committen."
  exit 1
fi

echo "→ Setze Version auf $VERSION"

# tauri.conf.json — maßgeblich für die App-Version
node -e "const f='src-tauri/tauri.conf.json',fs=require('fs');const j=JSON.parse(fs.readFileSync(f));j.version='$VERSION';fs.writeFileSync(f,JSON.stringify(j,null,2)+'\n')"

# package.json
npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null

# Cargo.toml — erste version-Zeile gehört zu [package]
perl -0pi -e 's/^version = ".*?"/version = "'"$VERSION"'"/m' src-tauri/Cargo.toml

# Cargo.lock nachziehen (Fehler hier sind unkritisch — der Build korrigiert es)
( cd src-tauri && cargo update -p finanz-manager --precise "$VERSION" >/dev/null 2>&1 ) || true

git add -A
git commit -m "Release v$VERSION"
git tag "v$VERSION"
git push origin HEAD --tags

echo
echo "✓ v$VERSION gepusht. GitHub Actions baut jetzt das Release:"
echo "  https://github.com/NetworkHybrid/finanz-manager/actions"
echo
echo "  Nach ~10 Min ist das Release fertig. Installierte Apps melden das"
echo "  Update automatisch beim nächsten Start (Einstellungen → Updates)."
