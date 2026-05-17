#!/bin/bash
set -e

IMAGE="hendrie0575/wod-bot:latest"

echo "Building $IMAGE..."
docker build -t "$IMAGE" .

echo "Pushing $IMAGE..."
docker push "$IMAGE"

echo "Done! Pull the new image on Unraid with:"
echo "  docker pull $IMAGE"
