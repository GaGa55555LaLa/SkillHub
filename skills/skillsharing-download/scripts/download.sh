#!/usr/bin/env bash
set -euo pipefail

if [ -z "${SKILLHUB_URL:-}" ] || [ -z "${SKILLHUB_TOKEN:-}" ]; then
  echo "Error: SKILLHUB_URL and SKILLHUB_TOKEN must be set (see SKILL.md Setup)." >&2
  exit 1
fi

SKILL_ID="${1:?Usage: download.sh <skill_id>}"
DEST_ROOT="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

curl -sf "${SKILLHUB_URL}/api/v1/skills/${SKILL_ID}/download" \
  -H "Authorization: Bearer ${SKILLHUB_TOKEN}" \
| python3 "${SCRIPT_DIR}/write_files.py" "${DEST_ROOT}"
