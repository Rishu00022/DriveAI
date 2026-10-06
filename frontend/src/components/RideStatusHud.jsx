import React from 'react';
import { Gauge, BatteryCharging, AlertTriangle, ShieldCheck, CheckCircle2, Navigation, Play, XCircle, Activity, Radio } from 'lucide-react';

export default function RideStatusHud({
  ride,
  taxi,
  onStartRide,
  onCancelRide,
  onEmergencyStop,
}) {
  if (!ride) return null;

  const currentTaxi = taxi || ride.taxi || {};
  const isEmergency = currentTaxi.status === 'EMERGENCY_STOP' || currentTaxi.emergency_stop_triggered;
  const isWaiting = currentTaxi.status === 'WAITING' || ride.status === 'WAITING';
  const isInTransit = currentTaxi.status === 'IN_TRANSIT' || ride.status === 'IN_TRANSIT' || ride.status === 'RIDE_STARTED';
  const isCompleted = ride.status === 'COMPLETED' || currentTaxi.status === 'RIDE_COMPLETED';

  // Status Step Progress (1 to 4)
  let activeStep = 1;
  if (ride.status === 'ARRIVING' || currentTaxi.status === 'ARRIVING') activeStep = 2;
  if (isWaiting) activeStep = 3;
  if (isInTransit) activeStep = 4;
  if (isCompleted) activeStep = 5;

  return (
    <div className="bg-[#121826]/95 backdrop-blur-md border border-[#1f293d] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4">
      {/* Top Header & Taxi Profile */}
      <div className="flex items-center justify-between border-b border-[#1f293d] pb-3">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-500 p-0.5">
            <div className="w-full h-full bg-[#0d121f] rounded-[10px] flex items-center justify-center">
              <Navigation className="w-6 h-6 text-emerald-400 transform rotate-45" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-white text-base font-mono">{currentTaxi.taxi_code || 'AUTONOMOUS TAXI'}</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {currentTaxi.hardware_version || 'JetsonNano-ESP32'}
              </span>
            </div>
            <p className="text-xs text-slate-400">{currentTaxi.name || 'DriveAI Autonomous Robotaxi'}</p>
          </div>
        </div>

        {/* Live Status Badge */}
        <div className="text-right">
          <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold ${
            isEmergency ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse' :
            isInTransit ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' :
            isWaiting ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-bounce' :
            isCompleted ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
            'bg-slate-700/50 text-slate-300 border border-slate-600'
          }`}>
            <span className="w-2 h-2 rounded-full mr-2 bg-current animate-ping"></span>
            {isEmergency ? 'EMERGENCY HALT' :
             isWaiting ? 'READY FOR PASSENGER' :
             isInTransit ? 'AUTONOMOUS TRANSIT' :
             isCompleted ? 'RIDE COMPLETED' :
             ride.status}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Ride #{ride.id}</div>
        </div>
      </div>

      {/* Ride Progress Stepper */}
      <div className="grid grid-cols-4 gap-2 text-center text-[11px] font-medium pt-1">
        <div className={`p-1.5 rounded-lg border ${activeStep >= 1 ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-900/40 text-slate-500'}`}>
          1. Assigned
        </div>
        <div className={`p-1.5 rounded-lg border ${activeStep >= 2 ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-900/40 text-slate-500'}`}>
          2. Approaching
        </div>
        <div className={`p-1.5 rounded-lg border ${activeStep >= 3 ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 font-bold' : 'border-slate-800 bg-slate-900/40 text-slate-500'}`}>
          3. Pickup
        </div>
        <div className={`p-1.5 rounded-lg border ${activeStep >= 4 ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900/40 text-slate-500'}`}>
          4. In Transit
        </div>
      </div>

      {/* Live Telemetry Hud Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0a0e17] p-3 rounded-xl border border-[#1a2334]">
        
        {/* Speed */}
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Speed</div>
            <div className="text-base font-extrabold text-white font-mono">
              {currentTaxi.speed_kmh ? currentTaxi.speed_kmh.toFixed(1) : '0.0'} <span className="text-[10px] font-normal text-slate-400">km/h</span>
            </div>
          </div>
        </div>

        {/* Battery */}
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
            <BatteryCharging className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Battery</div>
            <div className="text-base font-extrabold text-white font-mono">
              {currentTaxi.battery_percent ? currentTaxi.battery_percent.toFixed(0) : '95'}%
            </div>
          </div>
        </div>

        {/* Front Obstacle Radar */}
        <div className="flex items-center space-x-2.5">
          <div className={`p-2 rounded-lg ${
            currentTaxi.front_obstacle_cm < 30 ? 'bg-rose-500/20 text-rose-400 animate-pulse' :
            currentTaxi.front_obstacle_cm < 75 ? 'bg-amber-500/20 text-amber-400' :
            'bg-slate-800 text-slate-400'
          }`}>
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Radar / LiDAR</div>
            <div className="text-base font-extrabold text-white font-mono">
              {currentTaxi.front_obstacle_cm && currentTaxi.front_obstacle_cm < 500
                ? `${currentTaxi.front_obstacle_cm.toFixed(0)} cm`
                : 'Clear'}
            </div>
          </div>
        </div>

        {/* Estimated Fare & Distance */}
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Fare / Est.</div>
            <div className="text-base font-extrabold text-white font-mono">
              ₹{ride.fare_amount} <span className="text-[10px] font-normal text-slate-400">({ride.distance_km}km)</span>
            </div>
          </div>
        </div>

      </div>

      {/* Obstacle Proximity Warning Notification Banner */}
      {currentTaxi.front_obstacle_cm && currentTaxi.front_obstacle_cm < 60 && (
        <div className="bg-amber-500/15 border border-amber-500/40 text-amber-300 p-2.5 rounded-xl flex items-center space-x-2.5 text-xs animate-pulse">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>
            <strong>Obstacle Detected:</strong> Object detected at {currentTaxi.front_obstacle_cm.toFixed(0)}cm. Jetson vision & ultrasonic safety slowdown engaged.
          </span>
        </div>
      )}

      {/* Controls & Interaction */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        
        {/* Left Action: Start Ride when Taxi is waiting at pickup */}
        {isWaiting && (
          <button
            onClick={() => onStartRide(ride.id)}
            className="flex-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-extrabold py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 transition shadow-lg shadow-emerald-500/25"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>I've Boarded: Start Autonomous Ride</span>
          </button>
        )}

        {/* Cancel Button */}
        {!isCompleted && !isEmergency && (
          <button
            onClick={() => onCancelRide(ride.id)}
            className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition"
          >
            Cancel Booking
          </button>
        )}

        {/* Emergency Stop Red Kill Switch */}
        {!isCompleted && (
          <button
            onClick={() => onEmergencyStop(currentTaxi.id)}
            className={`px-4 py-2.5 rounded-xl flex items-center space-x-1.5 font-bold text-xs transition shadow-lg ${
              isEmergency
                ? 'bg-rose-950 text-rose-300 border border-rose-700 cursor-not-allowed'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>{isEmergency ? 'VEHICLE HALTED' : 'EMERGENCY BRAKE'}</span>
          </button>
        )}

      </div>
    </div>
  );
}
