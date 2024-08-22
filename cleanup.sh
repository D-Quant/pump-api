#!/bin/bash

# 检查并删除现有的 pump-api 容器
container_id=$(docker ps -a -q --filter "name=pump-api")

if [ -n "$container_id" ]; then
  echo "Stopping and removing existing pump-api container..."
  docker stop "$container_id"
  docker rm "$container_id"
else
  echo "No existing pump-api container found."
fi

# 检查并删除现有的 pump-api 镜像
image_id=$(docker images -q pump-api)

if [ -n "$image_id" ]; then
  echo "Removing existing pump-api image..."
  docker rmi "$image_id"
else
  echo "No existing pump-api image found."
fi

echo "Cleanup completed."
