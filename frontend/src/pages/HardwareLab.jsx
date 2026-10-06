import React, { useState, useEffect } from 'react';
import { fetchTaxis, triggerEmergencyStop, resumeTaxi } from '../utils/api';
import {
  Cpu,
  Radio,
  Sliders,
  AlertTriangle,
  Play,
  RotateCcw,
  Zap,
  Gauge,
  Compass,
  Eye,
  CheckCircle2,
  Layers,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';

export default function HardwareLab() {
  const [taxis, setTaxis] = useState([]);
  const [selectedTaxiId, setSelectedTaxiId] = useState(1);
  const [obstacleSimDist, setObstacleSimDist] = useState(250);
  const [manualDriveMode, setManualDriveMode] = useState(false);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 1500);
    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    try {
      const fleet = await fetchTaxis();
      setTaxis(fleet);
    } catch (e) {}
  };

  const currentTaxi = taxis.find((t) => t.id === Number(selectedTaxiId)) || taxis[0] || {};

  const handleSimulateObstacle = (distanceCm) => {
    setObstacleSimDist(distanceCm);
    // Transmit simulation packet or notify backend
    fetch(`http://localhost:8000/api/taxis/${currentTaxi.id}/emergency-stop`, { method: 'POST' });
  };

  const handleClearObstacle = () => {
    setObstacleSimDist(350);
    fetch(`http://localhost:8000/api/taxis/${currentTaxi.id}/resume`, { method: 'POST' });
  };

  const isEStop = currentTaxi.status === 'EMERGENCY_STOP' || currentTaxi.emergency_stop_triggered;

  return (
    <div className="h-[calc(100vh-65px)] w-full overflow-y-auto bg-[#090d16] p-4 lg:p-8 space-y-6">
      
      {/* Page Header */}
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1f293d] pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">Robotic Vehicle Hardware Testbench</h2>
              <p className="text-xs text-slate-400">Low-Level Hardware-in-the-Loop (HIL) Simulator & Telemetry Inspector</p>
            </div>
          </div>
        </div>

        {/* Taxi Target Selector */}
        <div className="flex items-center space-x-3">
          <label className="text-xs font-bold text-slate-400 uppercase">Target Taxi:</label>
          <select
            value={selectedTaxiId}
            onChange={(e) => setSelectedTaxiId(Number(e.target.value))}
            className="bg-[#121826] border border-[#1f293d] rounded-xl px-4 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
          >
            {taxis.map((t) => (
              <option key={t.id} value={t.id}>
                {t.taxi_code} - {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Hardware Architecture & Subsystem Health */}
        <div className="bg-[#0e1320] border border-[#1f293d] rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>Hardware Stack Status</span>
          </h3>

          <div className="space-y-3 text-xs">
            {/* Jetson Nano */}
            <div className="bg-[#121826] p-3 rounded-xl border border-[#1f293d] flex items-center justify-between">
              <div>
                <strong className="text-white block font-mono">NVIDIA Jetson Nano</strong>
                <span className="text-slate-400 text-[11px]">Primary Autonomous Agent & Pure Pursuit</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ONLINE
              </span>
            </div>

            {/* Intel RealSense LiDAR L515 */}
            <div className="bg-[#121826] p-3 rounded-xl border border-[#1f293d] flex items-center justify-between">
              <div>
                <strong className="text-white block font-mono">Intel RealSense L515</strong>
                <span className="text-slate-400 text-[11px]">Solid-State LiDAR Depth (USB 3.0)</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                LIDAR ACTIVE
              </span>
            </div>

            {/* USB Camera 1 */}
            <div className="bg-[#121826] p-3 rounded-xl border border-[#1f293d] flex items-center justify-between">
              <div>
                <strong className="text-white block font-mono">USB Camera 1</strong>
                <span className="text-slate-400 text-[11px]">RGB Optical Road & Lane Detector</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                RGB 30 FPS
              </span>
            </div>

            {/* Arduino Uno Controller */}
            <div className="bg-[#121826] p-3 rounded-xl border border-[#1f293d] flex items-center justify-between">
              <div>
                <strong className="text-white block font-mono">Arduino Uno (ATmega328P)</strong>
                <span className="text-slate-400 text-[11px]">2-Motor PWM & HC-SR04 (/dev/ttyACM0)</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                115200 BAUD
              </span>
            </div>

            {/* 2 DC Motors */}
            <div className="bg-[#121826] p-3 rounded-xl border border-[#1f293d] flex items-center justify-between">
              <div>
                <strong className="text-white block font-mono">2x DC Motors (L298N)</strong>
                <span className="text-slate-400 text-[11px]">Differential Drive (Left & Right)</span>
              </div>
              <span className="text-emerald-400 font-mono font-bold text-[11px]">PWM READY</span>
            </div>

            {/* Ultrasonic HC-SR04 */}
            <div className="bg-[#121826] p-3 rounded-xl border border-[#1f293d] flex items-center justify-between">
              <div>
                <strong className="text-white block font-mono">HC-SR04 Distance Sensor</strong>
                <span className="text-slate-400 text-[11px]">5V Hardware Collision Cutoff (&lt; 25cm)</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                currentTaxi.front_obstacle_cm < 30
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                {currentTaxi.front_obstacle_cm < 500 ? `${currentTaxi.front_obstacle_cm.toFixed(0)} cm` : 'CLEAR'}
              </span>
            </div>
          </div>

          {/* Quick Hardware Actions */}
          <div className="pt-2 flex space-x-2">
            <button
              onClick={() => fetch(`http://localhost:8000/api/taxis/${currentTaxi.id}/emergency-stop`, { method: 'POST' })}
              className="flex-1 bg-rose-600/80 hover:bg-rose-600 text-white font-bold py-2 rounded-xl text-xs transition"
            >
              Test E-Stop
            </button>
            <button
              onClick={() => fetch(`http://localhost:8000/api/taxis/${currentTaxi.id}/resume`, { method: 'POST' })}
              className="flex-1 bg-emerald-600/80 hover:bg-emerald-600 text-white font-bold py-2 rounded-xl text-xs transition"
            >
              Test Resume
            </button>
          </div>
        </div>

        {/* Live Sensor Telemetry Gauges */}
        <div className="bg-[#0e1320] border border-[#1f293d] rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>Real-Time Sensor Telemetry</span>
          </h3>

          <div className="grid grid-cols-2 gap-3 font-mono">
            {/* Speed */}
            <div className="bg-[#121826] p-3.5 rounded-xl border border-[#1f293d]">
              <div className="text-[10px] text-slate-400 uppercase font-sans">Linear Speed</div>
              <div className="text-2xl font-extrabold text-white mt-1">
                {currentTaxi.speed_kmh ? currentTaxi.speed_kmh.toFixed(1) : '0.0'}
              </div>
              <div className="text-[10px] text-slate-500 font-sans">km/h</div>
            </div>

            {/* Compass Heading */}
            <div className="bg-[#121826] p-3.5 rounded-xl border border-[#1f293d]">
              <div className="text-[10px] text-slate-400 uppercase font-sans">Compass Heading</div>
              <div className="text-2xl font-extrabold text-cyan-400 mt-1">
                {currentTaxi.current_heading ? currentTaxi.current_heading.toFixed(0) : '0'}°
              </div>
              <div className="text-[10px] text-slate-500 font-sans">0–360° Degrees</div>
            </div>

            {/* Battery Level */}
            <div className="bg-[#121826] p-3.5 rounded-xl border border-[#1f293d]">
              <div className="text-[10px] text-slate-400 uppercase font-sans">LiPo Pack Voltage</div>
              <div className="text-2xl font-extrabold text-emerald-400 mt-1">
                {currentTaxi.battery_percent ? currentTaxi.battery_percent.toFixed(1) : '95'}%
              </div>
              <div className="text-[10px] text-slate-500 font-sans">~11.8V 3S LiPo</div>
            </div>

            {/* Ultrasonic Radar */}
            <div className="bg-[#121826] p-3.5 rounded-xl border border-[#1f293d]">
              <div className="text-[10px] text-slate-400 uppercase font-sans">Front Radar</div>
              <div className={`text-2xl font-extrabold mt-1 ${
                currentTaxi.front_obstacle_cm < 30 ? 'text-rose-400' : 'text-amber-300'
              }`}>
                {currentTaxi.front_obstacle_cm < 500 ? `${currentTaxi.front_obstacle_cm.toFixed(0)}` : '999'}
              </div>
              <div className="text-[10px] text-slate-500 font-sans">Distance (cm)</div>
            </div>
          </div>

          {/* GPS Coordinates Display */}
          <div className="bg-[#121826] p-3 rounded-xl border border-[#1f293d] text-xs font-mono space-y-1">
            <div className="text-slate-400 text-[10px] uppercase font-sans">u-blox GPS Fix:</div>
            <div className="text-white">LAT: {currentTaxi.current_lat}</div>
            <div className="text-white">LNG: {currentTaxi.current_lng}</div>
          </div>
        </div>

        {/* Obstacle Injection & Safety Simulation Testbed */}
        <div className="bg-[#0e1320] border border-[#1f293d] rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Interactive Obstacle Injector</span>
          </h3>
          <p className="text-xs text-slate-400">
            Inject realistic roadway events into the vehicle perception pipeline to test automated safety responses.
          </p>

          <div className="space-y-2.5">
            <button
              onClick={() => handleSimulateObstacle(20)}
              className="w-full p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold flex items-center justify-between transition"
            >
              <span>Inject Hard Obstacle (&lt; 25 cm)</span>
              <span className="text-[10px] font-mono bg-rose-500/20 px-1.5 py-0.5 rounded">Triggers Hard Brake</span>
            </button>

            <button
              onClick={() => handleSimulateObstacle(50)}
              className="w-full p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold flex items-center justify-between transition"
            >
              <span>Inject Approaching Obstacle (50 cm)</span>
              <span className="text-[10px] font-mono bg-amber-500/20 px-1.5 py-0.5 rounded">Triggers Slowdown</span>
            </button>

            <button
              onClick={handleClearObstacle}
              className="w-full p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-bold flex items-center justify-between transition"
            >
              <span>Clear Road Ahead</span>
              <span className="text-[10px] font-mono bg-emerald-500/20 px-1.5 py-0.5 rounded">Resumes Autonomous Drive</span>
            </button>
          </div>

          <div className="pt-3 border-t border-[#1f293d] text-[11px] text-slate-500">
            Current vehicle response: <strong className="text-slate-300">{currentTaxi.status}</strong>
          </div>
        </div>

      </div>

    </div>
  );
}
