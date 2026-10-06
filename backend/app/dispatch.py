import math
import random
from typing import List, Tuple, Optional
from sqlalchemy.orm import Session
from backend.app.config import settings
from backend.app.models import Taxi, TaxiStatus

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in kilometers between two points on Earth."""
    R = 6371.0 # Radius of earth in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance = R * c
    return round(distance, 2)

def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the initial compass heading bearing (in degrees, 0-360) between two points."""
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - (math.sin(lat1) * math.cos(lat2) * math.cos(dlon))
    initial_bearing = math.atan2(x, y)
    initial_bearing = math.degrees(initial_bearing)
    compass_bearing = (initial_bearing + 360) % 360
    return round(compass_bearing, 1)

def generate_interpolated_route(start_lat: float, start_lng: float,
                                end_lat: float, end_lng: float,
                                num_points: int = 12) -> List[List[float]]:
    """
    Generates realistic road-like waypoint coordinates between start and end.
    Uses Manhattan-grid style turns so vehicles simulate navigating urban streets.
    """
    if num_points < 3:
        num_points = 3
        
    waypoints = [[start_lat, start_lng]]
    
    # We can create a 2-segment or 3-segment city corner turn
    mid_lat = start_lat + (end_lat - start_lat) * 0.4
    mid_lng = start_lng + (end_lng - start_lng) * 0.7
    
    # Segment 1: start -> corner 1
    steps_seg1 = num_points // 2
    for i in range(1, steps_seg1):
        frac = i / steps_seg1
        cur_lat = start_lat + (mid_lat - start_lat) * frac
        cur_lng = start_lng + (start_lng - start_lng) * frac + (random.uniform(-0.0001, 0.0001))
        waypoints.append([round(cur_lat, 6), round(cur_lng, 6)])
        
    waypoints.append([round(mid_lat, 6), round(mid_lng, 6)])
    
    # Segment 2: corner 1 -> end
    steps_seg2 = num_points - steps_seg1
    for i in range(1, steps_seg2):
        frac = i / steps_seg2
        cur_lat = mid_lat + (end_lat - mid_lat) * frac
        cur_lng = mid_lng + (end_lng - mid_lng) * frac + (random.uniform(-0.0001, 0.0001))
        waypoints.append([round(cur_lat, 6), round(cur_lng, 6)])
        
    waypoints.append([round(end_lat, 6), round(end_lng, 6)])
    return waypoints

def estimate_fare(distance_km: float) -> Tuple[float, float]:
    """Returns (fare_amount, estimated_time_minutes)."""
    # Assuming average autonomous speed in city: 30 km/h
    travel_time_mins = round(max(3.0, (distance_km / 30.0) * 60.0), 1)
    fare = round(settings.BASE_FARE + (distance_km * settings.PER_KM_RATE) + settings.AUTONOMOUS_TECH_FEE, 2)
    return fare, travel_time_mins

def find_nearest_available_taxi(db: Session, pickup_lat: float, pickup_lng: float) -> Optional[Tuple[Taxi, float]]:
    """
    Queries active fleet for available taxis and returns (closest_taxi, distance_km).
    """
    available_taxis = db.query(Taxi).filter(
        Taxi.status == TaxiStatus.AVAILABLE,
        Taxi.emergency_stop_triggered == False
    ).all()
    
    if not available_taxis:
        return None
        
    closest_taxi = None
    min_dist = float("inf")
    
    for taxi in available_taxis:
        dist = haversine_distance(taxi.current_lat, taxi.current_lng, pickup_lat, pickup_lng)
        if dist < min_dist:
            min_dist = dist
            closest_taxi = taxi
            
    return (closest_taxi, min_dist) if closest_taxi else None
