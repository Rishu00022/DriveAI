import math
from typing import List, Tuple, Optional

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0 # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - (math.sin(lat1) * math.cos(lat2) * math.cos(dlon))
    initial_bearing = math.atan2(x, y)
    initial_bearing = math.degrees(initial_bearing)
    return (initial_bearing + 360) % 360

class WaypointNavigator:
    def __init__(self, arrival_tolerance_km: float = 0.0003):
        self.waypoints: List[List[float]] = []
        self.current_idx: int = 0
        self.arrival_tolerance_km: float = arrival_tolerance_km

    def load_route(self, waypoints: List[List[float]]):
        self.waypoints = waypoints
        self.current_idx = 0

    def clear(self):
        self.waypoints = []
        self.current_idx = 0

    def has_active_route(self) -> bool:
        return len(self.waypoints) > 0 and self.current_idx < len(self.waypoints)

    def is_route_completed(self) -> bool:
        return len(self.waypoints) > 0 and self.current_idx >= len(self.waypoints)

    def current_target(self) -> Optional[List[float]]:
        if self.has_active_route():
            return self.waypoints[self.current_idx]
        return None

    def update_position(self, cur_lat: float, cur_lng: float) -> Tuple[int, int, bool]:
        """
        Calculates throttle (0-255) and steering (-100 to 100).
        Returns: (throttle, steering, is_reached_final_destination)
        """
        if not self.has_active_route():
            return 0, 0, True

        target = self.waypoints[self.current_idx]
        dist_to_wp = haversine_km(cur_lat, cur_lng, target[0], target[1])

        # If arrived at current waypoint
        if dist_to_wp <= self.arrival_tolerance_km:
            self.current_idx += 1
            if self.current_idx >= len(self.waypoints):
                return 0, 0, True
            target = self.waypoints[self.current_idx]

        # Calculate target heading
        target_bearing = calculate_bearing(cur_lat, cur_lng, target[0], target[1])
        return target_bearing, dist_to_wp, False

    def compute_control_inputs(self, cur_lat: float, cur_lng: float, cur_heading: float) -> Tuple[int, int, bool]:
        """
        Computes PWM throttle and steering using Pure Pursuit / proportional steering control.
        """
        if not self.has_active_route():
            return 0, 0, True

        target = self.waypoints[self.current_idx]
        dist_to_wp = haversine_km(cur_lat, cur_lng, target[0], target[1])

        if dist_to_wp <= self.arrival_tolerance_km:
            self.current_idx += 1
            if self.current_idx >= len(self.waypoints):
                return 0, 0, True # Reached final destination
            target = self.waypoints[self.current_idx]

        target_bearing = calculate_bearing(cur_lat, cur_lng, target[0], target[1])
        
        # Calculate angle error (-180 to +180)
        angle_diff = (target_bearing - cur_heading + 180) % 360 - 180
        
        # Steering: map -90..+90 deg to -100..+100 steer cmd
        steer = max(-100, min(100, int(angle_diff * 1.5)))
        
        # Slow down slightly during sharp turns
        turn_slowdown = max(0.5, 1.0 - (abs(steer) / 150.0))
        throttle = int(180 * turn_slowdown)

        return throttle, steer, False
