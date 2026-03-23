#!/bin/bash

set -euo pipefail

ROOT_DIR="/Users/sinjiyong/Library/CloudStorage/GoogleDrive-sjytoto@gmail.com/내 드라이브/SOUNDSTORM"
RUNTIME_DIR="$ROOT_DIR/07_AUTOMATION_자동화/automation_runtime"
SCRIPT_DIR="$ROOT_DIR/07_AUTOMATION_자동화/scripts_스크립트"

python3 "$RUNTIME_DIR/run_and_notify.py" \
  --job-name "SOUNDSTORM Pipeline" \
  --cwd "$SCRIPT_DIR" \
  -- bash "$SCRIPT_DIR/run_pipeline.sh"
