import json
import logging
import datetime
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.database import engine, Base, get_db
from backend.app.models import User, UserRole, Taxi, TaxiStatus, Ride, RideStatus, TelemetryLog, SystemLog
from backend.app.schemas import (
    UserCreate, UserLogin, UserResponse, TokenResponse,
    TaxiResponse, TaxiUpdate,
    RideEstimateRequest, RideEstimateResponse, RideBookRequest, RideResponse,
    SystemLogResponse
)
from backend.app.auth import (
    verify_password, get_password_hash, create_access_token,
    get_current_user, get_current_admin
)
from backend.app.dispatch import (
    haversine_distance, estimate_fare, generate_interpolated_route,
    find_nearest_available_taxi
)
from backend.app.ws_manager import ws_manager
from backend.app.seed_data import seed_database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("driveai.server")

# Create tables and seed
Base.metadata.create_all(bind=engine)
with next(get_db()) as db_session:
    seed_database(db_session)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="End-to-End Autonomous Robotic Taxi Fleet Management & Ride-Booking Backend"
)

# Enable CORS for frontend applications
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------
# AUTHENTICATION APIS
# -------------------------------------------------------------
@app.post(f"{settings.API_V1_STR}/auth/register", response_model=TokenResponse)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    
    new_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        phone=user_in.phone,
        role=user_in.role or UserRole.PASSENGER
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    token = create_access_token(data={"sub": str(new_user.id)})
    return TokenResponse(access_token=token, user=new_user)

@app.post(f"{settings.API_V1_STR}/auth/login", response_model=TokenResponse)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_data.email).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    token = create_access_token(data={"sub": str(user.id)})
    return TokenResponse(access_token=token, user=user)

@app.get(f"{settings.API_V1_STR}/auth/me", response_model=UserResponse)
def get_profile(current_user: User = Depends(get_current_user)):
    return current_user

# -------------------------------------------------------------
# TAXI FLEET MANAGEMENT APIS
# -------------------------------------------------------------
@app.get(f"{settings.API_V1_STR}/taxis", response_model=List[TaxiResponse])
def get_all_taxis(db: Session = Depends(get_db)):
    return db.query(Taxi).all()

@app.get(f"{settings.API_V1_STR}/taxis/{{taxi_id}}", response_model=TaxiResponse)
def get_taxi(taxi_id: int, db: Session = Depends(get_db)):
    taxi = db.query(Taxi).filter(Taxi.id == taxi_id).first()
    if not taxi:
        raise HTTPException(status_code=404, detail="Autonomous taxi not found.")
    return taxi

@app.post(f"{settings.API_V1_STR}/taxis/{{taxi_id}}/emergency-stop")
async def trigger_emergency_stop(taxi_id: int, db: Session = Depends(get_db)):
    """Triggers an instantaneous hard emergency stop on the robotic vehicle."""
    taxi = db.query(Taxi).filter(Taxi.id == taxi_id).first()
    if not taxi:
        raise HTTPException(status_code=404, detail="Autonomous taxi not found.")
    
    taxi.status = TaxiStatus.EMERGENCY_STOP
    taxi.emergency_stop_triggered = True
    taxi.speed_kmh = 0.0
    db.commit()

    # Transmit EMERGENCY_STOP command directly to hardware over WebSocket
    stop_command = {
        "command": "EMERGENCY_STOP",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "reason": "Operator / User Emergency Trigger"
    }
    sent = await ws_manager.send_to_taxi(taxi_id, stop_command)

    # Log event
    log_entry = SystemLog(
        level="CRITICAL",
        source="FLEET_CONTROLLER",
        message=f"EMERGENCY BRAKE TRIGGERED for Taxi {taxi.taxi_code} (#{taxi.id})",
        taxi_id=taxi.id
    )
    db.add(log_entry)
    db.commit()

    # Broadcast to all admins and current passenger
    await ws_manager.broadcast_to_admins({
        "type": "EMERGENCY_ALERT",
        "taxi_id": taxi.id,
        "taxi_code": taxi.taxi_code,
        "message": f"EMERGENCY STOP engaged on {taxi.taxi_code}!"
    })

    return {"status": "EMERGENCY_STOP_TRIGGERED", "taxi_id": taxi_id, "hardware_notified": sent}

@app.post(f"{settings.API_V1_STR}/taxis/{{taxi_id}}/resume")
async def resume_vehicle(taxi_id: int, db: Session = Depends(get_db)):
    """Clears emergency stop and restores vehicle operation."""
    taxi = db.query(Taxi).filter(Taxi.id == taxi_id).first()
    if not taxi:
        raise HTTPException(status_code=404, detail="Autonomous taxi not found.")
    
    taxi.status = TaxiStatus.AVAILABLE
    taxi.emergency_stop_triggered = False
    db.commit()

    resume_command = {
        "command": "RESUME_OPERATION",
        "timestamp": datetime.datetime.utcnow().isoformat()
    }
    sent = await ws_manager.send_to_taxi(taxi_id, resume_command)

    log_entry = SystemLog(
        level="INFO",
        source="FLEET_CONTROLLER",
        message=f"Emergency stop cleared. Vehicle {taxi.taxi_code} resumed to AVAILABLE.",
        taxi_id=taxi.id
    )
    db.add(log_entry)
    db.commit()

    await ws_manager.broadcast_to_admins({
        "type": "FLEET_UPDATE",
        "taxi_id": taxi.id,
        "status": "AVAILABLE"
    })

    return {"status": "RESUMED", "taxi_id": taxi_id, "hardware_notified": sent}

# -------------------------------------------------------------
# RIDE BOOKING & NAVIGATION APIS
# -------------------------------------------------------------
@app.post(f"{settings.API_V1_STR}/rides/estimate", response_model=RideEstimateResponse)
def estimate_ride_route(request: RideEstimateRequest, db: Session = Depends(get_db)):
    distance = haversine_distance(
        request.pickup_lat, request.pickup_lng,
        request.dropoff_lat, request.dropoff_lng
    )
    fare, travel_time = estimate_fare(distance)
    waypoints = generate_interpolated_route(
        request.pickup_lat, request.pickup_lng,
        request.dropoff_lat, request.dropoff_lng,
        num_points=12
    )
    
    available_taxis = db.query(Taxi).filter(
        Taxi.status == TaxiStatus.AVAILABLE,
        Taxi.emergency_stop_triggered == False
    ).count()

    # Estimate pickup ETA based on closest taxi
    best_match = find_nearest_available_taxi(db, request.pickup_lat, request.pickup_lng)
    pickup_eta = round((best_match[1] / 30.0) * 60.0 + 2.0, 1) if best_match else 5.0

    return RideEstimateResponse(
        pickup_name=request.pickup_name,
        dropoff_name=request.dropoff_name,
        distance_km=distance,
        estimated_time_mins=travel_time,
        fare_amount=fare,
        available_taxis_count=available_taxis,
        estimated_pickup_eta_mins=pickup_eta,
        route_waypoints=waypoints
    )

@app.post(f"{settings.API_V1_STR}/rides/book", response_model=RideResponse)
async def book_autonomous_taxi(
    request: RideBookRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Check if user already has an active ride
    active_ride = db.query(Ride).filter(
        Ride.user_id == current_user.id,
        Ride.status.in_([RideStatus.REQUESTED, RideStatus.ASSIGNED, RideStatus.ARRIVING, RideStatus.WAITING, RideStatus.IN_TRANSIT])
    ).first()
    if active_ride:
        raise HTTPException(
            status_code=400,
            detail=f"You already have an active ride (#{active_ride.id}) in state '{active_ride.status.value}'."
        )

    # 2. Dispatch closest available taxi
    best_match = find_nearest_available_taxi(db, request.pickup_lat, request.pickup_lng)
    if not best_match:
        raise HTTPException(
            status_code=503,
            detail="No autonomous taxis currently available nearby. Please retry shortly."
        )

    matched_taxi, pickup_dist = best_match

    # 3. Calculate distance and fare
    distance = haversine_distance(
        request.pickup_lat, request.pickup_lng,
        request.dropoff_lat, request.dropoff_lng
    )
    fare, travel_time = estimate_fare(distance)
    waypoints = generate_interpolated_route(
        request.pickup_lat, request.pickup_lng,
        request.dropoff_lat, request.dropoff_lng,
        num_points=14
    )

    # 4. Create Ride record in DB
    new_ride = Ride(
        user_id=current_user.id,
        taxi_id=matched_taxi.id,
        status=RideStatus.ASSIGNED,
        pickup_name=request.pickup_name,
        pickup_lat=request.pickup_lat,
        pickup_lng=request.pickup_lng,
        dropoff_name=request.dropoff_name,
        dropoff_lat=request.dropoff_lat,
        dropoff_lng=request.dropoff_lng,
        distance_km=distance,
        estimated_time_mins=travel_time,
        fare_amount=fare,
        route_waypoints=json.dumps(waypoints),
        requested_at=datetime.datetime.utcnow()
    )
    db.add(new_ride)
    
    # 5. Update Taxi Status to ASSIGNED
    matched_taxi.status = TaxiStatus.ASSIGNED
    db.commit()
    db.refresh(new_ride)

    # 6. Generate route from taxi current location to pickup point
    taxi_to_pickup_route = generate_interpolated_route(
        matched_taxi.current_lat, matched_taxi.current_lng,
        request.pickup_lat, request.pickup_lng,
        num_points=8
    )

    # 7. Transmit dispatch mission to physical Jetson Nano vehicle
    mission_packet = {
        "command": "DISPATCH_MISSION",
        "ride_id": new_ride.id,
        "passenger_id": current_user.id,
        "passenger_name": current_user.full_name,
        "pickup": {
            "lat": request.pickup_lat,
            "lng": request.pickup_lng,
            "name": request.pickup_name
        },
        "dropoff": {
            "lat": request.dropoff_lat,
            "lng": request.dropoff_lng,
            "name": request.dropoff_name
        },
        "pickup_route_waypoints": taxi_to_pickup_route,
        "ride_route_waypoints": waypoints
    }
    
    await ws_manager.send_to_taxi(matched_taxi.id, mission_packet)

    # 8. Notify Admins and Passenger
    await ws_manager.broadcast_to_admins({
        "type": "NEW_RIDE_BOOKED",
        "ride_id": new_ride.id,
        "taxi_code": matched_taxi.taxi_code,
        "passenger": current_user.full_name
    })

    return new_ride

@app.get(f"{settings.API_V1_STR}/rides/active", response_model=Optional[RideResponse])
def get_user_active_ride(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    active_ride = db.query(Ride).filter(
        Ride.user_id == current_user.id,
        Ride.status.in_([
            RideStatus.REQUESTED, RideStatus.ASSIGNED,
            RideStatus.ARRIVING, RideStatus.WAITING,
            RideStatus.IN_TRANSIT, RideStatus.EMERGENCY_HALTED
        ])
    ).order_by(Ride.id.desc()).first()
    return active_ride

@app.get(f"{settings.API_V1_STR}/rides/history", response_model=List[RideResponse])
def get_user_ride_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Ride).filter(Ride.user_id == current_user.id).order_by(Ride.id.desc()).all()

@app.post(f"{settings.API_V1_STR}/rides/{{ride_id}}/confirm-pickup")
async def confirm_passenger_boarded(ride_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Passenger boards the autonomous vehicle and presses 'Start Ride'."""
    ride = db.query(Ride).filter(Ride.id == ride_id, Ride.user_id == current_user.id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found.")
    
    ride.status = RideStatus.IN_TRANSIT
    ride.started_at = datetime.datetime.utcnow()
    
    if ride.taxi:
        ride.taxi.status = TaxiStatus.RIDE_STARTED
    db.commit()

    # Inform vehicle to engage autonomous transit to dropoff
    cmd = {
        "command": "START_TRANSIT_TO_DROPOFF",
        "ride_id": ride.id
    }
    if ride.taxi_id:
        await ws_manager.send_to_taxi(ride.taxi_id, cmd)

    await ws_manager.send_to_passenger(current_user.id, {
        "type": "RIDE_STATUS_CHANGE",
        "ride_id": ride.id,
        "status": "IN_TRANSIT",
        "message": "Passenger on board. Autonomous navigation to destination engaged."
    })

    return {"status": "IN_TRANSIT", "ride_id": ride.id}

@app.post(f"{settings.API_V1_STR}/rides/{{ride_id}}/cancel")
async def cancel_ride(ride_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ride = db.query(Ride).filter(Ride.id == ride_id, Ride.user_id == current_user.id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found.")
    
    if ride.status in [RideStatus.COMPLETED, RideStatus.CANCELLED]:
        raise HTTPException(status_code=400, detail="Ride already ended.")

    ride.status = RideStatus.CANCELLED
    if ride.taxi:
        ride.taxi.status = TaxiStatus.AVAILABLE
    db.commit()

    # Send abort to hardware
    if ride.taxi_id:
        await ws_manager.send_to_taxi(ride.taxi_id, {
            "command": "ABORT_MISSION",
            "ride_id": ride.id
        })

    return {"status": "CANCELLED", "ride_id": ride.id}

# -------------------------------------------------------------
# ADMIN & SYSTEM APIS
# -------------------------------------------------------------
@app.get(f"{settings.API_V1_STR}/admin/overview")
def get_admin_overview(db: Session = Depends(get_db)):
    total_taxis = db.query(Taxi).count()
    active_taxis = db.query(Taxi).filter(Taxi.status.in_([TaxiStatus.AVAILABLE, TaxiStatus.ASSIGNED, TaxiStatus.ARRIVING, TaxiStatus.RIDE_STARTED])).count()
    active_rides = db.query(Ride).filter(Ride.status.in_([RideStatus.ASSIGNED, RideStatus.ARRIVING, RideStatus.WAITING, RideStatus.IN_TRANSIT])).count()
    total_rides = db.query(Ride).count()
    total_users = db.query(User).count()
    emergency_stops = db.query(Taxi).filter(Taxi.emergency_stop_triggered == True).count()
    
    taxis = db.query(Taxi).all()
    avg_battery = round(sum(t.battery_percent for t in taxis) / len(taxis), 1) if taxis else 100.0

    return {
        "total_taxis": total_taxis,
        "active_taxis": active_taxis,
        "active_rides": active_rides,
        "total_rides": total_rides,
        "total_users": total_users,
        "emergency_stops": emergency_stops,
        "avg_battery": avg_battery
    }

@app.get(f"{settings.API_V1_STR}/admin/logs", response_model=List[SystemLogResponse])
def get_system_logs(limit: int = 50, db: Session = Depends(get_db)):
    return db.query(SystemLog).order_by(SystemLog.id.desc()).limit(limit).all()

@app.post(f"{settings.API_V1_STR}/admin/emergency-stop-all")
async def emergency_stop_all(db: Session = Depends(get_db)):
    """Global kill-switch for all vehicles in the fleet."""
    taxis = db.query(Taxi).all()
    for taxi in taxis:
        taxi.status = TaxiStatus.EMERGENCY_STOP
        taxi.emergency_stop_triggered = True
        taxi.speed_kmh = 0.0
        await ws_manager.send_to_taxi(taxi.id, {
            "command": "EMERGENCY_STOP",
            "reason": "ADMIN_GLOBAL_KILL_SWITCH"
        })
    db.commit()

    log_entry = SystemLog(
        level="CRITICAL",
        source="ADMIN_CONSOLE",
        message="GLOBAL EMERGENCY STOP EXECUTED FOR ALL VEHICLES!"
    )
    db.add(log_entry)
    db.commit()

    await ws_manager.broadcast_to_admins({
        "type": "GLOBAL_EMERGENCY_ALERT",
        "message": "Global emergency halt dispatched to all active robotic taxis."
    })
    return {"status": "GLOBAL_EMERGENCY_HALT_ACTIVE", "affected_vehicles": len(taxis)}

# -------------------------------------------------------------
# WEBSOCKET REAL-TIME ENDPOINTS
# -------------------------------------------------------------

@app.websocket("/ws/taxi/{taxi_id}")
async def websocket_taxi_endpoint(websocket: WebSocket, taxi_id: int):
    """
    Dedicated bidirectional real-time link for Jetson Nano / Autonomous Hardware.
    Receives high-frequency sensor telemetry, obstacles, position.
    Sends route commands, waypoints, emergency stop.
    """
    await ws_manager.connect_taxi(taxi_id, websocket)
    db = SessionLocal = next(get_db())

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                payload = json.loads(raw_data)
            except Exception:
                continue

            msg_type = payload.get("type", "TELEMETRY")

            if msg_type == "TELEMETRY":
                # Extract telemetry fields
                lat = payload.get("lat")
                lng = payload.get("lng")
                heading = payload.get("heading", 0.0)
                speed = payload.get("speed_kmh", 0.0)
                battery = payload.get("battery_percent", 100.0)
                front_obstacle_cm = payload.get("front_obstacle_cm", 999.0)
                obstacle_detected = payload.get("obstacle_detected", False)
                vehicle_status = payload.get("status")
                ride_id = payload.get("active_ride_id")

                # Update Taxi in database
                taxi = db.query(Taxi).filter(Taxi.id == taxi_id).first()
                if taxi:
                    taxi.current_lat = lat
                    taxi.current_lng = lng
                    taxi.current_heading = heading
                    taxi.speed_kmh = speed
                    taxi.battery_percent = battery
                    taxi.front_obstacle_cm = front_obstacle_cm
                    taxi.last_ping = datetime.datetime.utcnow()

                    if vehicle_status:
                        try:
                            taxi.status = TaxiStatus(vehicle_status)
                        except ValueError:
                            pass

                    # Also update ride status if vehicle reached checkpoints
                    passenger_id = None
                    if ride_id:
                        ride = db.query(Ride).filter(Ride.id == ride_id).first()
                        if ride:
                            passenger_id = ride.user_id
                            # Sync ride state with vehicle state
                            if vehicle_status == "WAITING" and ride.status == RideStatus.ARRIVING:
                                ride.status = RideStatus.WAITING
                            elif vehicle_status == "RIDE_COMPLETED" and ride.status in [RideStatus.IN_TRANSIT, RideStatus.WAITING]:
                                ride.status = RideStatus.COMPLETED
                                ride.completed_at = datetime.datetime.utcnow()
                                taxi.status = TaxiStatus.AVAILABLE
                                # Log completion
                                db.add(SystemLog(
                                    level="INFO",
                                    source="JETSON_NANO",
                                    message=f"Ride #{ride.id} completed safely by {taxi.taxi_code}.",
                                    taxi_id=taxi.id
                                ))

                    db.commit()

                    # Save telemetry log record
                    telemetry_rec = TelemetryLog(
                        taxi_id=taxi_id,
                        ride_id=ride_id,
                        lat=lat,
                        lng=lng,
                        heading=heading,
                        speed_kmh=speed,
                        battery_percent=battery,
                        obstacle_detected=obstacle_detected,
                        obstacle_distance_cm=front_obstacle_cm,
                        status=taxi.status.value,
                        timestamp=datetime.datetime.utcnow()
                    )
                    db.add(telemetry_rec)
                    db.commit()

                    # Broadcast telemetry payload
                    telemetry_broadcast = {
                        "taxi_id": taxi.id,
                        "taxi_code": taxi.taxi_code,
                        "lat": lat,
                        "lng": lng,
                        "heading": heading,
                        "speed_kmh": speed,
                        "battery_percent": battery,
                        "front_obstacle_cm": front_obstacle_cm,
                        "obstacle_detected": obstacle_detected,
                        "status": taxi.status.value,
                        "ride_id": ride_id,
                        "passenger_id": passenger_id,
                        "timestamp": datetime.datetime.utcnow().isoformat()
                    }
                    await ws_manager.broadcast_fleet_telemetry(telemetry_broadcast)

            elif msg_type == "OBSTACLE_ALERT":
                distance_cm = payload.get("distance_cm", 0.0)
                db.add(SystemLog(
                    level="WARN",
                    source="JETSON_VISION",
                    message=f"Obstacle detected at {distance_cm}cm! Automated avoidance/braking engaged.",
                    taxi_id=taxi_id
                ))
                db.commit()

                await ws_manager.broadcast_to_admins({
                    "type": "OBSTACLE_WARNING",
                    "taxi_id": taxi_id,
                    "distance_cm": distance_cm
                })

    except WebSocketDisconnect:
        ws_manager.disconnect_taxi(taxi_id)
        # Mark taxi as offline or update last_ping
        taxi = db.query(Taxi).filter(Taxi.id == taxi_id).first()
        if taxi:
            taxi.status = TaxiStatus.OFFLINE
            db.commit()
    finally:
        db.close()

@app.websocket("/ws/passenger/{user_id}")
async def websocket_passenger_endpoint(websocket: WebSocket, user_id: int):
    """Real-time link for passenger mobile/web app."""
    await ws_manager.connect_passenger(user_id, websocket)
    try:
        while True:
            # Keep-alive ping/pong
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_passenger(user_id, websocket)

@app.websocket("/ws/admin")
async def websocket_admin_endpoint(websocket: WebSocket):
    """Real-time link for fleet operations center."""
    await ws_manager.connect_admin(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_admin(websocket)
