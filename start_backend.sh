#!/bin/bash
echo "=== Starting DriveAI Backend Server (FastAPI + WebSockets) ==="
cd "$(dirname "$0")"
source ./venv/bin/activate
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
