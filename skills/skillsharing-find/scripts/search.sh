#!/usr/bin/env bash
set -euo pipefail

if [ -z "${SKILLHUB_URL:-}" ] || [ -z "${SKILLHUB_TOKEN:-}" ]; then
  echo "Error: SKILLHUB_URL and SKILLHUB_TOKEN must be set (see SKILL.md Setup)." >&2
  exit 1
fi

QUERY="${1:-}"

curl -sf -G "${SKILLHUB_URL}/api/v1/skills/search" \
  --data-urlencode "q=${QUERY}" \
  -H "Authorization: Bearer ${SKILLHUB_TOKEN}"
