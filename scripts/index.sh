#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${THINKFEEL_ENV_FILE:-"$ROOT_DIR/.env.local"}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  echo "Using env file: $ENV_FILE"
elif [[ -n "${THINKFEEL_ENV_FILE:-}" ]]; then
  cat >&2 <<EOF
Missing local env file: $ENV_FILE

EOF
  exit 1
else
  echo "No .env.local found; using current shell environment."
fi

: "${THINKFEEL_API_KEY:?Set THINKFEEL_API_KEY in .env.local or the shell environment}"
: "${THINKFEEL_PERSONA_ID:?Set THINKFEEL_PERSONA_ID in .env.local or the shell environment}"
: "${THINKFEEL_BASE_URL:?Set THINKFEEL_BASE_URL in .env.local or the shell environment}"

export THINKFEEL_API_KEY
export THINKFEEL_PERSONA_ID
export THINKFEEL_BASE_URL
export THINKFEEL_GENERATE_PROMPT="${THINKFEEL_GENERATE_PROMPT:-I just got back from a long day and wanted to check in.}"
export THINKFEEL_PERSONIFY_RAW="${THINKFEEL_PERSONIFY_RAW:-Thanks for reaching out. I can help with that. Send me the details when you have them.}"

echo
echo "========================================================================"
echo "ThinkFeel live test runner"
echo "========================================================================"
echo "Using base URL: $THINKFEEL_BASE_URL"

cd "$ROOT_DIR"

echo
echo "========================================================================"
echo "Build"
echo "========================================================================"
npm run build

echo
echo "========================================================================"
echo "Live tests"
echo "========================================================================"
node scripts/test-live.js
