import React, { useState, useEffect } from 'react';
import MapView from '../components/MapView';
import {
  fetchTaxis,
  fetchAdminOverview,
  fetchSystemLogs,
  triggerEmergencyStop,
  resumeTaxi,
  triggerGlobalEmergencyStop,
} from '../utils/api';
import {
  ShieldAlert,
  Car,
  Battery,
  AlertTriangle,
  Play,
  Activity,
  Terminal,
  Radio,
  RefreshCw,
  Zap,
  CheckCircle,
  XCircle,
  Eye
} from 'lucide-react';

export default function AdminDashboard({ user }) {
  const [taxis, setTaxis] = useState([]);
  const [overview, setOverview] = useState(null);
  const [logs, setLogs] = useState([]);
  const [selectedTaxi, setSelectedTaxi] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logFilter, setLogFilter] = useState('ALL');

  useEffect(() => {
    loadAllAdminData();
    const timer = setInterval(loadAllAdminData, 2000);
    return () => clearInterval(timer);
  }, []);

  // Admin WebSocket connection for real-time telemetry stream
  useEffect(() => {
    let ws = null;
    try {
      ws = new WebSocket('ws://localhost:8000/ws/admin');
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'TELEMETRY_UPDATE' || msg.type === 'EMERGENCY_ALERT' || msg.type === 'FLEET_UPDATE') {
            loadAllAdminData();
          }
        } catch (e) {}
      };
    } catch (e) {}
    return () => {
      if (ws) ws.close();
    };
  }, []);

  const loadAllAdminData = async () => {
    try {
      const [fleet, stats, sysLogs] = await Promise.all([
        fetchTaxis(),
        fetchAdminOverview(),
        fetchSystemLogs(30),
      ]);
      setTaxis(fleet);
      setOverview(stats);
      setLogs(sysLogs);

      if (selectedTaxi) {
        const updated = fleet.find((t) => t.id === selectedTaxi.id);
        if (updated) setSelectedTaxi(updated);
      }
    } catch (e) {
      console.error('Failed to load admin data:', e);
    }
  };

  const handleEmergencyStopVehicle = async (taxiId) => {
    if (confirm(`IMMEDIATE HARD BRAKE: Halt Taxi #${taxiId}?`)) {
      try {
        await triggerEmergencyStop(taxiId);
        await loadAllAdminData();
      } catch (e) {
        alert(e.message);
      }
    }
  };

  const handleResumeVehicle = async (taxiId) => {
    try {
      await resumeTaxi(taxiId);
      await loadAllAdminData();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleGlobalKillSwitch = async () => {
    if (confirm('CRITICAL ACTION: Execute GLOBAL EMERGENCY STOP on ALL autonomous vehicles in the fleet?')) {
      try {
        await triggerGlobalEmergencyStop();
        await loadAllAdminData();
      } catch (e) {
        alert(e.message);
      }
    }
  };

  const filteredLogs = logs.filter((l) => {
    if (logFilter === 'ALL') return true;
    return l.level === logFilter;
  });

  return (
    <div className="h-[calc(100vh-65px)] w-full flex flex-col lg:flex-row overflow-hidden bg-[#090d16]">
      
      {/* LEFT COLUMN: Fleet Overview, Controls, and Telemetry Inspector */}
      <div className="w-full lg:w-[540px] h-full overflow-y-auto bg-[#0d121f] border-r border-[#1f293d] p-4 lg:p-6 space-y-6 shadow-2xl">
        
        {/* Header & Global Kill Switch */}
        <div className="flex items-center justify-between border-b border-[#1f293d] pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-emerald-400" />
              <span>Fleet Operations Command</span>
            </h2>
            <p className="text-xs text-slate-400">Autonomous Robotic Taxi Dispatch & Safety Monitoring</p>
          </div>

          <button
            onClick={handleGlobalKillSwitch}
            className="bg-rose-600 hover:bg-rose-500 text-white font-extrabold px-3 py-2 rounded-xl text-xs flex items-center space-x-1.5 shadow-lg shadow-rose-600/30 transition animate-pulse"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>GLOBAL KILL</span>
          </button>
        </div>

        {/* Fleet KPI Metric Cards */}
        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#121826] border border-[#1f293d] p-3 rounded-xl">
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Fleet Size</div>
              <div className="text-xl font-extrabold text-white font-mono mt-1">{overview.total_taxis}</div>
              <div className="text-[10px] text-emerald-400 mt-0.5">{overview.active_taxis} operational</div>
            </div>

            <div className="bg-[#121826] border border-[#1f293d] p-3 rounded-xl">
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Active Rides</div>
              <div className="text-xl font-extrabold text-cyan-400 font-mono mt-1">{overview.active_rides}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{overview.total_rides} total rides</div>
            </div>

            <div className="bg-[#121826] border border-[#1f293d] p-3 rounded-xl">
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Avg Battery</div>
              <div className="text-xl font-extrabold text-emerald-400 font-mono mt-1">{overview.avg_battery}%</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Fleet health good</div>
            </div>

            <div className="bg-[#121826] border border-[#1f293d] p-3 rounded-xl">
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">E-Stops Active</div>
              <div className={`text-xl font-extrabold font-mono mt-1 ${overview.emergency_stops > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                {overview.emergency_stops}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Safety cutoff</div>
            </div>
          </div>
        )}

        {/* Registered Vehicles Table & Telemetry */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
              <Car className="w-3.5 h-3.5 text-emerald-400" />
              <span>Registered Autonomous Taxis</span>
            </h3>
            <span className="text-[11px] text-slate-400">Click a taxi to inspect telemetry</span>
          </div>

          <div className="space-y-2.5">
            {taxis.map((t) => {
              const isSelected = selectedTaxi && selectedTaxi.id === t.id;
              const isHalted = t.status === 'EMERGENCY_STOP' || t.emergency_stop_triggered;

              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTaxi(t)}
                  className={`bg-[#121826] border rounded-2xl p-3.5 transition cursor-pointer ${
                    isSelected
                      ? 'border-emerald-500 shadow-lg shadow-emerald-500/10'
                      : isHalted
                      ? 'border-rose-500/50 hover:border-rose-400'
                      : 'border-[#1f293d] hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                        isHalted ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                        'bg-[#0a0e17] text-white border border-[#1f293d]'
                      }`}>
                        {t.taxi_code}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{t.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{t.hardware_version}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        t.status === 'AVAILABLE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        isHalted ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                        'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      }`}>
                        {t.status}
                      </span>

                      {/* E-Stop / Resume Button */}
                      {isHalted ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResumeVehicle(t.id);
                          }}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-black text-[10px] font-extrabold rounded-lg"
                        >
                          RESUME
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEmergencyStopVehicle(t.id);
                          }}
                          className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-extrabold rounded-lg"
                        >
                          E-STOP
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Telemetry Snapshot Row */}
                  <div className="grid grid-cols-4 gap-2 text-[11px] bg-[#0a0e17] p-2 rounded-xl border border-[#1a2334] font-mono">
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase">Speed</span>
                      <span className="text-white font-bold">{t.speed_kmh.toFixed(1)} km/h</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase">Battery</span>
                      <span className="text-emerald-400 font-bold">{t.battery_percent.toFixed(0)}%</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase">Front Radar</span>
                      <span className={t.front_obstacle_cm < 50 ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                        {t.front_obstacle_cm < 500 ? `${t.front_obstacle_cm.toFixed(0)}cm` : 'Clear'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase">Heading</span>
                      <span className="text-slate-300 font-bold">{t.current_heading.toFixed(0)}°</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live System & Hardware Audit Logs */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>System & Hardware Event Audit</span>
            </h3>
            
            {/* Filter buttons */}
            <div className="flex space-x-1">
              {['ALL', 'INFO', 'WARN', 'CRITICAL'].map((f) => (
                <button
                  key={f}
                  onClick={() => setLogFilter(f)}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                    logFilter === f ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#0a0e17] border border-[#1f293d] rounded-2xl p-3 max-h-56 overflow-y-auto space-y-1.5 font-mono text-[11px]">
            {filteredLogs.map((l) => (
              <div key={l.id} className="flex items-start space-x-2 border-b border-slate-900 pb-1">
                <span className={`font-bold px-1 rounded text-[9px] ${
                  l.level === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400' :
                  l.level === 'WARN' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {l.level}
                </span>
                <span className="text-slate-500 text-[10px]">{l.source}:</span>
                <span className="text-slate-300 flex-1">{l.message}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: Master Fleet Map */}
      <div className="flex-1 h-full relative">
        <MapView
          taxis={taxis}
          selectedTaxiId={selectedTaxi?.id}
          onSelectTaxi={(t) => setSelectedTaxi(t)}
          center={selectedTaxi ? [selectedTaxi.current_lat, selectedTaxi.current_lng] : [12.9716, 77.5946]}
          zoom={14}
        />
      </div>

    </div>
  );
}
