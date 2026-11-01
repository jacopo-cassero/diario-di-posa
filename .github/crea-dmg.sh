#!/bin/bash
# Crea i .dmg senza montarli (hdiutil create -srcfolder), così non serve "detach" che sui Mac di GitHub si blocca.
set -e
cd dist
for arch in x64 arm64; do
  dir=mac; [ "$arch" = arm64 ] && dir=mac-arm64
  app=$(ls -d "$dir"/*.app | head -1)
  stage=$(mktemp -d)
  cp -R "$app" "$stage/"
  ln -s /Applications "$stage/Applicazioni"
  hdiutil create -volname "Diario di Posa" -srcfolder "$stage" -ov -format UDZO "Diario-di-Posa-mac-$arch.dmg"
done
ls -la *.dmg
