#!/bin/bash

# 检查并删除现有的 pump-api 容器
container_id=$(docker ps -a -q --filter "name=pump-api")

if [ -n "$container_id" ]; then
  echo "Stopping and removing existing pump-api container..."
  docker stop "$container_id"
  docker rm "$container_id"
else
  echo "No existing 'pump-api' container found."
fi

echo "Remove container completed."
