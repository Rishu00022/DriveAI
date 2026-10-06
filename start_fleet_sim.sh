#!/bin/bash
echo "=== Starting DriveAI Multi-Vehicle Autonomous Fleet Simulator ==="
cd "$(dirname "$0")"
source ./venv/bin/activate
python3 hardware/simulator/virtual_taxi.py
