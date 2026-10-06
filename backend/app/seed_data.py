from sqlalchemy.orm import Session
from backend.app.models import User, UserRole, Taxi, TaxiStatus, SystemLog
from backend.app.auth import get_password_hash
import datetime

def seed_database(db: Session):
    # Check if already seeded
    if db.query(User).first():
        return

    print("[DriveAI] Seeding database with initial users and autonomous fleet...")

    # 1. Create Default Users
    admin_user = User(
        email="admin@driveai.com",
        hashed_password=get_password_hash("admin123"),
        full_name="Fleet Operations Commander",
        phone="+1-800-DRIVE-AI",
        role=UserRole.ADMIN
    )
    
    passenger_user = User(
        email="passenger@driveai.com",
        hashed_password=get_password_hash("pass123"),
        full_name="Sarah Connor",
        phone="+1-555-019-2834",
        role=UserRole.PASSENGER
    )

    db.add(admin_user)
    db.add(passenger_user)
    db.commit()

    # 2. Create Autonomous Taxi Fleet
    fleet = [
        Taxi(
            taxi_code="ROBO-01",
            name="DriveAI CyberPod Alpha",
            model="Autonomous RoboCar Mk1",
            hardware_version="JetsonNano-ESP32-v2",
            status=TaxiStatus.AVAILABLE,
            battery_percent=94.5,
            current_lat=12.9716,
            current_lng=77.5946,
            current_heading=45.0,
            speed_kmh=0.0,
            front_obstacle_cm=250.0,
            emergency_stop_triggered=False,
            last_ping=datetime.datetime.utcnow()
        ),
        Taxi(
            taxi_code="ROBO-02",
            name="DriveAI RoboX Titan",
            model="Heavy-Duty Autonomous Carrier",
            hardware_version="JetsonOrin-ESP32-v3",
            status=TaxiStatus.AVAILABLE,
            battery_percent=88.0,
            current_lat=12.9765,
            current_lng=77.6015,
            current_heading=180.0,
            speed_kmh=0.0,
            front_obstacle_cm=180.0,
            emergency_stop_triggered=False,
            last_ping=datetime.datetime.utcnow()
        ),
        Taxi(
            taxi_code="ROBO-03",
            name="DriveAI MicroPod Neo",
            model="Urban Compact Robotic Shuttle",
            hardware_version="JetsonNano-Arduino-v1",
            status=TaxiStatus.AVAILABLE,
            battery_percent=72.0,
            current_lat=12.9650,
            current_lng=77.5880,
            current_heading=270.0,
            speed_kmh=0.0,
            front_obstacle_cm=310.0,
            emergency_stop_triggered=False,
            last_ping=datetime.datetime.utcnow()
        ),
        Taxi(
            taxi_code="ROBO-04",
            name="DriveAI Autonomous Cruiser",
            model="Executive Autonomous Sedan",
            hardware_version="JetsonNano-ESP32-v2",
            status=TaxiStatus.AVAILABLE,
            battery_percent=99.0,
            current_lat=12.9830,
            current_lng=77.5990,
            current_heading=90.0,
            speed_kmh=0.0,
            front_obstacle_cm=450.0,
            emergency_stop_triggered=False,
            last_ping=datetime.datetime.utcnow()
        )
    ]

    for taxi in fleet:
        db.add(taxi)
    db.commit()

    # 3. Add initial System Logs
    logs = [
        SystemLog(
            level="INFO",
            source="BACKEND",
            message="Autonomous Fleet Management Core initialized successfully.",
            timestamp=datetime.datetime.utcnow()
        ),
        SystemLog(
            level="INFO",
            source="DISPATCHER",
            message="Dispatch Engine active: 4 autonomous vehicles registered in Bangalore Tech Hub.",
            timestamp=datetime.datetime.utcnow()
        )
    ]
    for log in logs:
        db.add(log)
    db.commit()

    print("[DriveAI] Database seeding complete!")
