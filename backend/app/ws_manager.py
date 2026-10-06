import json
import logging
from typing import Dict, Set, Any
from fastapi import WebSocket

logger = logging.getLogger("driveai.ws")

class ConnectionManager:
    def __init__(self):
        # Maps taxi_id (int) -> WebSocket
        self.active_taxis: Dict[int, WebSocket] = {}
        # Maps user_id (int) -> Set[WebSocket] (user can have multiple tabs/devices)
        self.active_passengers: Dict[int, Set[WebSocket]] = {}
        # Admin dashboard websockets
        self.active_admins: Set[WebSocket] = set()

    # --- Taxi Hardware Connections ---
    async def connect_taxi(self, taxi_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_taxis[taxi_id] = websocket
        logger.info(f"Vehicle Hardware Connected: Taxi ID {taxi_id}")
        await self.broadcast_to_admins({
            "type": "TAXI_ONLINE",
            "taxi_id": taxi_id,
            "message": f"Hardware Vehicle #{taxi_id} linked."
        })

    def disconnect_taxi(self, taxi_id: int):
        if taxi_id in self.active_taxis:
            del self.active_taxis[taxi_id]
            logger.info(f"Vehicle Hardware Disconnected: Taxi ID {taxi_id}")

    async def send_to_taxi(self, taxi_id: int, data: dict) -> bool:
        ws = self.active_taxis.get(taxi_id)
        if ws:
            try:
                await ws.send_text(json.dumps(data))
                return True
            except Exception as e:
                logger.error(f"Error sending to Taxi #{taxi_id}: {e}")
                self.disconnect_taxi(taxi_id)
        return False

    # --- Passenger Web Connections ---
    async def connect_passenger(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_passengers:
            self.active_passengers[user_id] = set()
        self.active_passengers[user_id].add(websocket)
        logger.info(f"Passenger Connected: User ID {user_id}")

    def disconnect_passenger(self, user_id: int, websocket: WebSocket):
        if user_id in self.active_passengers:
            self.active_passengers[user_id].discard(websocket)
            if not self.active_passengers[user_id]:
                del self.active_passengers[user_id]
        logger.info(f"Passenger Disconnected: User ID {user_id}")

    async def send_to_passenger(self, user_id: int, data: dict):
        connections = self.active_passengers.get(user_id, set()).copy()
        dead_connections = set()
        for ws in connections:
            try:
                await ws.send_text(json.dumps(data))
            except Exception as e:
                logger.error(f"Error sending to passenger #{user_id}: {e}")
                dead_connections.add(ws)
        for ws in dead_connections:
            self.disconnect_passenger(user_id, ws)

    # --- Admin Dashboard Connections ---
    async def connect_admin(self, websocket: WebSocket):
        await websocket.accept()
        self.active_admins.add(websocket)
        logger.info("Admin Dashboard Connected.")

    def disconnect_admin(self, websocket: WebSocket):
        self.active_admins.discard(websocket)
        logger.info("Admin Dashboard Disconnected.")

    async def broadcast_to_admins(self, data: dict):
        dead_admins = set()
        for ws in self.active_admins.copy():
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead_admins.add(ws)
        for ws in dead_admins:
            self.disconnect_admin(ws)

    # --- Universal Broadcast ---
    async def broadcast_fleet_telemetry(self, telemetry: dict):
        """Dispatches telemetry to all interested parties: Admins, and Passenger if on active ride."""
        # 1. Always inform admins
        await self.broadcast_to_admins({
            "type": "TELEMETRY_UPDATE",
            "data": telemetry
        })
        
        # 2. If vehicle is on active ride, inform passenger
        passenger_id = telemetry.get("passenger_id")
        if passenger_id:
            await self.send_to_passenger(passenger_id, {
                "type": "RIDE_TELEMETRY",
                "data": telemetry
            })

ws_manager = ConnectionManager()
