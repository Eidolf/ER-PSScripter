#!/bin/bash
# Script to pull a model into the built-in Ollama container

MODEL=${1:-llama3}

echo "Connect to integrated Ollama..."
container_id=$(docker ps -qf "name=er-psscripter-ollama")

if [ -z "$container_id" ]; then
    echo "Error: Ollama container is not running. Please start it with 'docker compose up -d'."
    exit 1
fi

echo "Pulling model '$MODEL' inside container $container_id..."
docker exec -it $container_id ollama pull $MODEL

echo "Done! Model '$MODEL' is ready."
