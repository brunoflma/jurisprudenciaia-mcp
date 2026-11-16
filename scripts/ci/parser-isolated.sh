#!/usr/bin/env bash
set -euo pipefail
name="parser-${CIRCLE_WORKFLOW_ID:?}-${CIRCLE_BUILD_NUM:?}"
volume="${name}-source"
seed="${name}-seed"
trap 'docker rm -f "$name" "$seed" >/dev/null 2>&1 || true; docker volume rm "$volume" >/dev/null 2>&1 || true' EXIT
docker pull node:22-bookworm-slim
# Remote Docker cannot mount the primary container's filesystem. Populate a
# dedicated volume through Docker's API, then mount it read-only for the test.
docker volume create "$volume" >/dev/null
docker create --name "$seed" --mount "type=volume,source=$volume,target=/workspace" node:22-bookworm-slim true >/dev/null
docker cp dist "$seed:/workspace/dist"
docker cp node_modules "$seed:/workspace/node_modules"
docker cp tests "$seed:/workspace/tests"
docker cp package.json "$seed:/workspace/package.json"
docker rm "$seed" >/dev/null
timeout --kill-after=5s 45s docker run --name "$name" --rm \
  --network none --read-only --ipc none --user 1000:1000 \
  --cap-drop ALL --security-opt no-new-privileges \
  --cpus 1 --memory 512m --pids-limit 32 \
  --ulimit cpu=30:30 --ulimit fsize=8388608:8388608 \
  --tmpfs /tmp:rw,noexec,nosuid,size=67108864,uid=1000,gid=1000 \
  --mount "type=volume,source=$volume,target=/workspace,readonly" \
  --workdir /workspace --entrypoint /usr/bin/env node:22-bookworm-slim \
  -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp TMPDIR=/tmp \
  NODE_ENV=test node tests/parser-limit-isolated.mjs
