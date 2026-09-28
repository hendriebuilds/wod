#!/bin/sh
# Noodoptie. Normaal bouwt GitHub Actions het image (.github/workflows/docker.yml).
set -e

IMAGE="ghcr.io/hendriebuilds/wod"
VERSION=$(tr -d '[:space:]' < VERSION)
PKG_VERSION=$(node -p "require('./package.json').version")

if [ "$VERSION" != "$PKG_VERSION" ]; then
  echo "VERSION ($VERSION) en package.json ($PKG_VERSION) verschillen — gestopt."
  exit 1
fi

echo "Bouwen: $IMAGE:$VERSION"
docker build -t "$IMAGE:$VERSION" -t "$IMAGE:latest" .

echo "Pushen naar GHCR..."
docker push "$IMAGE:$VERSION"
docker push "$IMAGE:latest"

echo "Klaar — $IMAGE:$VERSION en :latest gepusht"
