from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from backend.app.models import UserRole, TaxiStatus, RideStatus

# Auth schemas
class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    phone: Optional[str] = None
    role: Optional[UserRole] = UserRole.PASSENGER

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    phone: Optional[str]
    role: UserRole
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# Taxi schemas
class TaxiBase(BaseModel):
    taxi_code: str
    name: str
    model: Optional[str] = "Autonomous RoboCar v1.0"
    current_lat: float
    current_lng: float

class TaxiCreate(TaxiBase):
    pass

class TaxiUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[TaxiStatus] = None
    battery_percent: Optional[float] = None
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    current_heading: Optional[float] = None
    speed_kmh: Optional[float] = None
    front_obstacle_cm: Optional[float] = None
    emergency_stop_triggered: Optional[bool] = None

class TaxiResponse(BaseModel):
    id: int
    taxi_code: str
    name: str
    model: str
    hardware_version: str
    status: TaxiStatus
    battery_percent: float
    current_lat: float
    current_lng: float
    current_heading: float
    speed_kmh: float
    front_obstacle_cm: float
    emergency_stop_triggered: bool
    manual_override: bool
    last_ping: datetime

    class Config:
        from_attributes = True

# Ride schemas
class RideEstimateRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    pickup_name: Optional[str] = "Pickup Location"
    dropoff_name: Optional[str] = "Dropoff Location"

class RideEstimateResponse(BaseModel):
    pickup_name: str
    dropoff_name: str
    distance_km: float
    estimated_time_mins: float
    fare_amount: float
    available_taxis_count: int
    estimated_pickup_eta_mins: float
    route_waypoints: List[List[float]]

class RideBookRequest(BaseModel):
    pickup_name: str
    pickup_lat: float
    pickup_lng: float
    dropoff_name: str
    dropoff_lat: float
    dropoff_lng: float

class RideResponse(BaseModel):
    id: int
    user_id: int
    taxi_id: Optional[int]
    status: RideStatus
    pickup_name: str
    pickup_lat: float
    pickup_lng: float
    dropoff_name: str
    dropoff_lat: float
    dropoff_lng: float
    distance_km: float
    estimated_time_mins: float
    fare_amount: float
    route_waypoints: Optional[str]
    requested_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    taxi: Optional[TaxiResponse] = None

    class Config:
        from_attributes = True

# Vehicle Telemetry Ingestion Schema (Hardware -> Backend)
class VehicleTelemetryPacket(BaseModel):
    taxi_code: str
    lat: float
    lng: float
    heading: float
    speed_kmh: float
    battery_percent: float
    front_obstacle_cm: float
    obstacle_detected: bool
    status: str
    emergency_stop: bool
    active_ride_id: Optional[int] = None
    timestamp: Optional[float] = None

# Hardware Command Schema (Backend -> Hardware)
class VehicleCommandPacket(BaseModel):
    command: str # "DISPATCH_TO_PICKUP", "START_RIDE", "NAVIGATE_TO_DROPOFF", "EMERGENCY_STOP", "RESUME", "RETURN_TO_BASE"
    ride_id: Optional[int] = None
    target_lat: Optional[float] = None
    target_lng: Optional[float] = None
    waypoints: Optional[List[List[float]]] = None
    parameters: Optional[Dict[str, Any]] = None

# System Log schema
class SystemLogResponse(BaseModel):
    id: int
    level: str
    source: str
    message: str
    taxi_id: Optional[int]
    timestamp: datetime

    class Config:
        from_attributes = True
