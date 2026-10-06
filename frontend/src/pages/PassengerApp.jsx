import React, { useState, useEffect } from 'react';
import MapView from '../components/MapView';
import RideStatusHud from '../components/RideStatusHud';
import {
  fetchTaxis,
  estimateRide,
  bookRide,
  getActiveRide,
  confirmPickup,
  cancelRide,
  triggerEmergencyStop,
  getRideHistory,
} from '../utils/api';
import {
  Navigation,
  MapPin,
  Clock,
  Sparkles,
  History,
  AlertCircle,
  Car,
  ShieldCheck,
  Check,
  ArrowRight
} from 'lucide-react';

const PRESET_LOCATIONS = [
  { name: 'Tech Park Central', lat: 12.9716, lng: 77.5946 },
  { name: 'Cyber Innovation Zone', lat: 12.9790, lng: 77.6040 },
  { name: 'AI Robotics Campus', lat: 12.9650, lng: 77.5850 },
  { name: 'Metro Terminal Station', lat: 12.9840, lng: 77.5970 },
  { name: 'Aerospace Business Park', lat: 12.9620, lng: 77.6100 },
];

export default function PassengerApp({ user, onRequireAuth }) {
  const [taxis, setTaxis] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [pickup, setPickup] = useState(PRESET_LOCATIONS[0]);
  const [dropoff, setDropoff] = useState(PRESET_LOCATIONS[1]);
  const [estimate, setEstimate] = useState(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [rideHistory, setRideHistory] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedVehicleType, setSelectedVehicleType] = useState('robosedan');
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Initial Load & Polling for Taxis and Active Ride
  useEffect(() => {
    loadFleetData();
    const interval = setInterval(loadFleetData, 2000); // 2s fleet refresh
    return () => clearInterval(interval);
  }, [user]);

  // 2. Real-time WebSocket connection for Passenger
  useEffect(() => {
    if (!user || !user.id) return;

    let ws = null;
    try {
      ws = new WebSocket(`ws://localhost:8000/ws/passenger/${user.id}`);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'RIDE_TELEMETRY' || msg.type === 'RIDE_STATUS_CHANGE') {
            // Update active ride's taxi position and state
            loadActiveRide();
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };
    } catch (err) {
      console.warn('Passenger WS unavailable:', err);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [user]);

  // 3. Fetch Fare Estimate whenever pickup or dropoff changes
  useEffect(() => {
    if (pickup && dropoff && (!activeRide || activeRide.status === 'COMPLETED')) {
      fetchEstimate();
    }
  }, [pickup, dropoff, activeRide]);

  const loadFleetData = async () => {
    try {
      const fleet = await fetchTaxis();
      setTaxis(fleet);

      if (user) {
        await loadActiveRide();
      }
    } catch (e) {
      console.error('Failed to load fleet data:', e);
    }
  };

  const loadActiveRide = async () => {
    try {
      const current = await getActiveRide();
      setActiveRide(current);
    } catch (e) {
      console.error('Active ride fetch error:', e);
    }
  };

  const fetchEstimate = async () => {
    setLoadingEstimate(true);
    setErrorMsg('');
    try {
      const res = await estimateRide(
        pickup.lat,
        pickup.lng,
        dropoff.lat,
        dropoff.lng,
        pickup.name,
        dropoff.name
      );
      setEstimate(res);
    } catch (e) {
      console.error('Estimate failed:', e);
    } finally {
      setLoadingEstimate(false);
    }
  };

  const handleBookRide = async () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    setBookingLoading(true);
    setErrorMsg('');
    try {
      const newRide = await bookRide(
        pickup.name,
        pickup.lat,
        pickup.lng,
        dropoff.name,
        dropoff.lat,
        dropoff.lng
      );
      setActiveRide(newRide);
      await loadFleetData();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to dispatch autonomous taxi');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleStartRide = async (rideId) => {
    try {
      await confirmPickup(rideId);
      await loadActiveRide();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCancelRide = async (rideId) => {
    if (confirm('Cancel this autonomous ride request?')) {
      try {
        await cancelRide(rideId);
        setActiveRide(null);
        await loadFleetData();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const handleEmergencyStop = async (taxiId) => {
    if (confirm('Trigger EMERGENCY HARD STOP on robotic taxi?')) {
      try {
        await triggerEmergencyStop(taxiId);
        await loadFleetData();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const handleOpenHistory = async () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    try {
      const history = await getRideHistory();
      setRideHistory(history);
      setShowHistoryModal(true);
    } catch (err) {
      alert(err.message);
    }
  };

  // Determine active route waypoints to display on the map
  let mapRoute = [];
  if (activeRide && activeRide.route_waypoints) {
    try {
      mapRoute = JSON.parse(activeRide.route_waypoints);
    } catch (e) {}
  } else if (estimate && estimate.route_waypoints) {
    mapRoute = estimate.route_waypoints;
  }

  // Find assigned taxi for active ride
  const assignedTaxi = activeRide
    ? taxis.find((t) => t.id === activeRide.taxi_id) || activeRide.taxi
    : null;

  return (
    <div className="relative h-[calc(100vh-65px)] w-full flex flex-col lg:flex-row overflow-hidden bg-[#0a0e17]">
      
      {/* LEFT PANEL: Ride Booking & Telemetry HUD */}
      <div className="w-full lg:w-[460px] h-full overflow-y-auto bg-[#0e1320] border-r border-[#1f293d] p-4 lg:p-6 flex flex-col justify-between z-10 shadow-2xl">
        <div className="space-y-5">
          
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center space-x-2">
                <span>Autonomous Mobility</span>
                <Sparkles className="w-4 h-4 text-emerald-400" />
              </h2>
              <p className="text-xs text-slate-400">Next-gen driverless cab dispatched straight to your door</p>
            </div>
            
            <button
              onClick={handleOpenHistory}
              title="Ride History"
              className="p-2 rounded-xl bg-[#141b2d] border border-[#1f293d] text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              <History className="w-4 h-4" />
            </button>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 p-3 rounded-xl flex items-center space-x-2 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ACTIVE RIDE HUD (If passenger currently has an active ride) */}
          {activeRide && activeRide.status !== 'CANCELLED' && (
            <RideStatusHud
              ride={activeRide}
              taxi={assignedTaxi}
              onStartRide={handleStartRide}
              onCancelRide={handleCancelRide}
              onEmergencyStop={handleEmergencyStop}
            />
          )}

          {/* RIDE BOOKING DRAWER (Shown when no ride is in progress) */}
          {(!activeRide || activeRide.status === 'COMPLETED' || activeRide.status === 'CANCELLED') && (
            <div className="space-y-4">
              
              {/* Pickup & Destination Selector */}
              <div className="bg-[#121826] border border-[#1f293d] rounded-2xl p-4 space-y-3">
                
                {/* Pickup Dropdown */}
                <div>
                  <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5 mb-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Pickup Location</span>
                  </label>
                  <select
                    value={pickup.name}
                    onChange={(e) => {
                      const loc = PRESET_LOCATIONS.find((l) => l.name === e.target.value);
                      if (loc) setPickup(loc);
                    }}
                    className="w-full bg-[#0a0e17] border border-[#1f293d] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium"
                  >
                    {PRESET_LOCATIONS.map((loc) => (
                      <option key={loc.name} value={loc.name}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dropoff Dropdown */}
                <div>
                  <label className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center space-x-1.5 mb-1.5">
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Destination</span>
                  </label>
                  <select
                    value={dropoff.name}
                    onChange={(e) => {
                      const loc = PRESET_LOCATIONS.find((l) => l.name === e.target.value);
                      if (loc) setDropoff(loc);
                    }}
                    className="w-full bg-[#0a0e17] border border-[#1f293d] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-medium"
                  >
                    {PRESET_LOCATIONS.map((loc) => (
                      <option key={loc.name} value={loc.name}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>

              </div>

              {/* Autonomous Vehicle Tier Selection */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">Select Vehicle Type</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <div
                    onClick={() => setSelectedVehicleType('robosedan')}
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      selectedVehicleType === 'robosedan'
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-[#1f293d] bg-[#121826] hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-white">RoboSedan</span>
                      <Car className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-[10px] text-slate-400">Standard 4-wheel robotic cabin</div>
                    <div className="text-xs font-extrabold text-emerald-400 mt-2 font-mono">
                      ₹{estimate ? estimate.fare_amount : '80'}
                    </div>
                  </div>

                  <div
                    onClick={() => setSelectedVehicleType('cyberpod')}
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      selectedVehicleType === 'cyberpod'
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-[#1f293d] bg-[#121826] hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-white">CyberPod VIP</span>
                      <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="text-[10px] text-slate-400">Executive autonomous shuttle</div>
                    <div className="text-xs font-extrabold text-cyan-400 mt-2 font-mono">
                      ₹{estimate ? (estimate.fare_amount * 1.3).toFixed(0) : '105'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Fare & ETA Summary Card */}
              {estimate && (
                <div className="bg-[#121826] border border-[#1f293d] rounded-2xl p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Estimated Route Distance:</span>
                    <strong className="text-white font-mono">{estimate.distance_km} km</strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Estimated Trip Time:</span>
                    <strong className="text-white font-mono">{estimate.estimated_time_mins} mins</strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Autonomous Taxi Pickup ETA:</span>
                    <strong className="text-emerald-400 font-mono">~{estimate.estimated_pickup_eta_mins} mins</strong>
                  </div>
                  <div className="border-t border-[#1f293d] pt-2 flex items-center justify-between text-sm font-bold">
                    <span className="text-white">Total Guaranteed Fare:</span>
                    <span className="text-emerald-400 font-extrabold font-mono text-base">
                      ₹{selectedVehicleType === 'cyberpod' ? (estimate.fare_amount * 1.3).toFixed(0) : estimate.fare_amount}
                    </span>
                  </div>
                </div>
              )}

              {/* Book Button */}
              <button
                onClick={handleBookRide}
                disabled={bookingLoading || loadingEstimate}
                className="w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-extrabold py-3.5 px-6 rounded-2xl flex items-center justify-center space-x-2 transition shadow-xl shadow-emerald-500/25 disabled:opacity-50"
              >
                {bookingLoading ? (
                  <span>Dispatching Autonomous Taxi...</span>
                ) : (
                  <>
                    <span>Confirm & Book Self-Driving Taxi</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

            </div>
          )}

        </div>

        {/* Footer Fleet Status */}
        <div className="pt-4 border-t border-[#1f293d] flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Active Fleet: {taxis.length} Robocabs</span>
          </div>
          <div>Bangalore Tech Zone</div>
        </div>

      </div>

      {/* RIGHT PANEL: Master Interactive Map */}
      <div className="flex-1 h-full relative">
        <MapView
          taxis={taxis}
          pickup={pickup}
          dropoff={dropoff}
          routeWaypoints={mapRoute}
          center={assignedTaxi ? [assignedTaxi.current_lat, assignedTaxi.current_lng] : [12.9716, 77.5946]}
          zoom={14}
        />
      </div>

      {/* RIDE HISTORY MODAL */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-[#1f293d] rounded-2xl max-w-xl w-full p-6 max-h-[80vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-[#1f293d] pb-3">
              <h3 className="font-bold text-white text-base">Your Autonomous Ride History</h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-slate-800"
              >
                Close
              </button>
            </div>

            {rideHistory.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No previous rides recorded.</p>
            ) : (
              <div className="space-y-3">
                {rideHistory.map((r) => (
                  <div key={r.id} className="bg-[#0a0e17] border border-[#1a2334] rounded-xl p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">Ride #{r.id}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        r.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
                        r.status === 'CANCELLED' ? 'bg-slate-700 text-slate-400' : 'bg-cyan-500/20 text-cyan-400'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="text-slate-400">
                      <div><strong>From:</strong> {r.pickup_name}</div>
                      <div><strong>To:</strong> {r.dropoff_name}</div>
                    </div>
                    <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 border-t border-slate-800/80">
                      <span>Distance: {r.distance_km} km</span>
                      <span className="text-emerald-400 font-bold font-mono">₹{r.fare_amount}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
