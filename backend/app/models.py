import enum
import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import relationship
from backend.app.database import Base

class UserRole(str, enum.Enum):
    PASSENGER = "passenger"
    ADMIN = "admin"

class TaxiStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    ASSIGNED = "ASSIGNED"
    ARRIVING = "ARRIVING"
    WAITING = "WAITING"
    RIDE_STARTED = "RIDE_STARTED"
    RIDE_COMPLETED = "RIDE_COMPLETED"
    EMERGENCY_STOP = "EMERGENCY_STOP"
    OFFLINE = "OFFLINE"

class RideStatus(str, enum.Enum):
    REQUESTED = "REQUESTED"
    ASSIGNED = "ASSIGNED"
    ARRIVING = "ARRIVING"
    WAITING = "WAITING"
    IN_TRANSIT = "IN_TRANSIT"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    EMERGENCY_HALTED = "EMERGENCY_HALTED"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    role = Column(Enum(UserRole), default=UserRole.PASSENGER, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    rides = relationship("Ride", back_populates="passenger")

class Taxi(Base):
    __tablename__ = "taxis"

    id = Column(Integer, primary_key=True, index=True)
    taxi_code = Column(String(50), unique=True, index=True, nullable=False) # e.g. "ROBO-01"
    name = Column(String(100), nullable=False) # e.g. "DriveAI CyberPod Alpha"
    model = Column(String(100), default="Autonomous RoboCar v1.0")
    hardware_version = Column(String(50), default="JetsonNano-ESP32-v2")
    
    status = Column(Enum(TaxiStatus), default=TaxiStatus.AVAILABLE, nullable=False, index=True)
    battery_percent = Column(Float, default=100.0)
    current_lat = Column(Float, nullable=False)
    current_lng = Column(Float, nullable=False)
    current_heading = Column(Float, default=0.0) # 0-360 degrees
    speed_kmh = Column(Float, default=0.0)
    
    # Real-time sensor state snapshot
    front_obstacle_cm = Column(Float, default=999.0)
    emergency_stop_triggered = Column(Boolean, default=False)
    manual_override = Column(Boolean, default=False)
    last_ping = Column(DateTime, default=datetime.datetime.utcnow)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    rides = relationship("Ride", back_populates="taxi")
    telemetry_logs = relationship("TelemetryLog", back_populates="taxi")

class Ride(Base):
    __tablename__ = "rides"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    taxi_id = Column(Integer, ForeignKey("taxis.id"), nullable=True)
    
    status = Column(Enum(RideStatus), default=RideStatus.REQUESTED, nullable=False, index=True)
    
    pickup_name = Column(String(255), nullable=False)
    pickup_lat = Column(Float, nullable=False)
    pickup_lng = Column(Float, nullable=False)
    
    dropoff_name = Column(String(255), nullable=False)
    dropoff_lat = Column(Float, nullable=False)
    dropoff_lng = Column(Float, nullable=False)
    
    distance_km = Column(Float, default=0.0)
    estimated_time_mins = Column(Float, default=0.0)
    fare_amount = Column(Float, default=0.0)
    
    # Path coordinates stored as JSON string for tracking
    route_waypoints = Column(Text, nullable=True) # JSON list of [lat, lng]
    
    requested_at = Column(DateTime, default=datetime.datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    passenger = relationship("User", back_populates="rides")
    taxi = relationship("Taxi", back_populates="rides")
    telemetry_logs = relationship("TelemetryLog", back_populates="ride")

class TelemetryLog(Base):
    __tablename__ = "telemetry_logs"

    id = Column(Integer, primary_key=True, index=True)
    taxi_id = Column(Integer, ForeignKey("taxis.id"), nullable=False)
    ride_id = Column(Integer, ForeignKey("rides.id"), nullable=True)
    
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    heading = Column(Float, default=0.0)
    speed_kmh = Column(Float, default=0.0)
    battery_percent = Column(Float, default=100.0)
    obstacle_detected = Column(Boolean, default=False)
    obstacle_distance_cm = Column(Float, default=999.0)
    status = Column(String(50), default="AVAILABLE")
    
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    taxi = relationship("Taxi", back_populates="telemetry_logs")
    ride = relationship("Ride", back_populates="telemetry_logs")

class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, index=True)
    level = Column(String(20), default="INFO", index=True) # INFO, WARN, ERROR, CRITICAL
    source = Column(String(50), default="SYSTEM") # BACKEND, JETSON_NANO, ESP32, DISPATCHER
    message = Column(Text, nullable=False)
    taxi_id = Column(Integer, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
