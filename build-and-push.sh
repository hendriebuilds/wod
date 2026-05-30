#!/bin/sh
set -e

IMAGE="ghcr.io/hen3games/wod"
VERSION=$(node -p "require('./package.json').version")

echo "Bouwen: $IMAGE:$VERSION"
docker build -t "$IMAGE:$VERSION" -t "$IMAGE:latest" .

echo "Pushen naar GHCR..."
docker push "$IMAGE:$VERSION"
docker push "$IMAGE:latest"

echo "Klaar — $IMAGE:$VERSION en :latest gepusht"