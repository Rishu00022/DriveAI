import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "DriveAI - Autonomous Self-Driving Taxi System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # Security
    SECRET_KEY: str = "driveai-super-secret-key-change-in-production-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Database
    DATABASE_URL: str = "sqlite:///./driveai.db"
    
    # Fare Configuration (in currency units, e.g., INR or USD)
    BASE_FARE: float = 50.0
    PER_KM_RATE: float = 18.0
    AUTONOMOUS_TECH_FEE: float = 20.0
    
    # Vehicle Safety & Communication
    HEARTBEAT_TIMEOUT_SECONDS: int = 10
    MIN_OBSTACLE_BRAKE_DISTANCE_CM: int = 25
    MIN_OBSTACLE_SLOWDOWN_DISTANCE_CM: int = 60
    
    # Default Map Center (Bangalore Tech Corridor / Cyber Hub / Silicon Valley)
    DEFAULT_LAT: float = 12.9716
    DEFAULT_LNG: float = 77.5946

    class Config:
        env_file = ".env"

settings = Settings()
