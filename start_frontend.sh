#!/bin/bash
echo "=== Starting DriveAI Frontend (React + Vite + Leaflet) ==="
cd "$(dirname "$0")/frontend"
npm run dev -- --host 0.0.0.0 --port 5173
