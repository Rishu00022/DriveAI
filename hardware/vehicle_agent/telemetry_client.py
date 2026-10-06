import asyncio
import json
import logging
from typing import Callable, Optional
import websockets

logger = logging.getLogger("driveai.telemetry")

class TelemetryClient:
    def __init__(self, ws_url: str, on_command_callback: Callable[[dict], None]):
        self.ws_url = ws_url
        self.on_command = on_command_callback
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.is_running = False

    async def connect_and_listen(self):
        self.is_running = True
        while self.is_running:
            try:
                logger.info(f"Connecting to Backend WebSocket: {self.ws_url}...")
                async with websockets.connect(self.ws_url) as ws:
                    self.ws = ws
                    logger.info("Connected to DriveAI Fleet Server.")
                    
                    async for message in ws:
                        try:
                            data = json.loads(message)
                            logger.info(f"Received Command from Backend: {data.get('command')}")
                            if self.on_command:
                                self.on_command(data)
                        except Exception as e:
                            logger.error(f"Error parsing incoming message: {e}")
            except Exception as e:
                logger.warning(f"WebSocket connection lost ({e}). Reconnecting in 3s...")
                self.ws = None
                await asyncio.sleep(3.0)

    async def send_telemetry(self, packet: dict) -> bool:
        if self.ws:
            try:
                await self.ws.send(json.dumps(packet))
                return True
            except Exception as e:
                logger.error(f"Failed to send telemetry packet: {e}")
        return False

    def stop(self):
        self.is_running = False
