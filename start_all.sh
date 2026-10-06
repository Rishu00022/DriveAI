#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=========================================================="
echo "    DriveAI - Autonomous Self-Driving Taxi System         "
echo "=========================================================="

# Ensure execute permissions
chmod +x start_backend.sh start_frontend.sh start_fleet_sim.sh

echo "1. Starting Backend API & WebSocket Server (Port 8000)..."
./start_backend.sh > backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend running [PID: $BACKEND_PID] (Logs: backend.log)"

# Wait 2 seconds for backend to initialize
sleep 2

echo "2. Starting Autonomous Robotic Fleet Simulator (4 Taxis)..."
./start_fleet_sim.sh > fleet_sim.log 2>&1 &
SIM_PID=$!
echo "   Fleet Simulator running [PID: $SIM_PID] (Logs: fleet_sim.log)"

# Wait 1 second
sleep 1

echo "3. Starting Passenger Web App & Admin Fleet UI (Port 5173)..."
./start_frontend.sh > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend running [PID: $FRONTEND_PID] (Logs: frontend.log)"

echo ""
echo "=========================================================="
echo "  DriveAI is LIVE and READY!"
echo "  -> Passenger Web App: http://localhost:5173"
echo "  -> Admin Dashboard:   http://localhost:5173 (Select Fleet Control)"
echo "  -> Hardware Lab:      http://localhost:5173 (Select Hardware Lab)"
echo "  -> Backend Swagger:   http://localhost:8000/docs"
echo "=========================================================="
echo "Press Ctrl+C to stop all services."

cleanup() {
    echo ""
    echo "Stopping all DriveAI services..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $SIM_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "All services stopped."
    exit 0
}

trap cleanup INT TERM
wait
