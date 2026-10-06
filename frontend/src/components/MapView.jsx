import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Create Custom Robotic Taxi Icon with Compass Heading Rotation
function createTaxiIcon(taxi) {
  const isEmergency = taxi.status === 'EMERGENCY_STOP' || taxi.emergency_stop_triggered;
  const isBusy = ['ASSIGNED', 'ARRIVING', 'IN_TRANSIT', 'RIDE_STARTED'].includes(taxi.status);
  
  const color = isEmergency ? '#ef4444' : isBusy ? '#06b6d4' : '#10b981';
  const pulse = isBusy ? 'animate-pulse' : '';

  const html = `
    <div style="position: relative; width: 42px; height: 42px; display: flex; items-center: center; justify-content: center;">
      <!-- Sensor Radar Ping -->
      ${isBusy ? `<div style="position: absolute; width: 42px; height: 42px; border-radius: 50%; background: ${color}22; border: 1.5px solid ${color}88;" class="radar-circle"></div>` : ''}
      
      <!-- Vehicle Body -->
      <div style="
        position: relative;
        z-index: 10;
        width: 32px;
        height: 32px;
        background: #0f172a;
        border: 2.5px solid ${color};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px ${color}66;
        transform: rotate(${taxi.current_heading || 0}deg);
        transition: transform 0.3s ease;
      ">
        <!-- Directional arrow -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${color}" stroke="#0f172a" stroke-width="1.5">
          <polygon points="12,2 22,22 12,17 2,22"/>
        </svg>
      </div>

      <!-- Badge Label -->
      <div style="
        position: absolute;
        bottom: -14px;
        left: 50%;
        transform: translateX(-50%);
        background: #020617;
        color: #f8fafc;
        border: 1px solid ${color}88;
        font-family: monospace;
        font-size: 9px;
        font-weight: 700;
        padding: 1px 4px;
        border-radius: 4px;
        white-space: nowrap;
        z-index: 20;
      ">
        ${taxi.taxi_code}
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-taxi-marker',
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

// Pickup Pin
const pickupIcon = L.divIcon({
  html: `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
      <div style="width: 28px; height: 28px; background: #10b981; border: 2.5px solid #ffffff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.5);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M12 2a8 8 0 0 0-8 8c0 5 8 12 8 12s8-7 8-12a8 8 0 0 0-8-8z"></path>
        </svg>
      </div>
      <span style="background: #0f172a; color: #10b981; font-weight: 800; font-size: 10px; padding: 2px 6px; border-radius: 4px; border: 1px solid #10b981; margin-top: 2px;">PICKUP</span>
    </div>
  `,
  className: 'pickup-pin',
  iconSize: [40, 50],
  iconAnchor: [20, 25],
});

// Dropoff Pin (Radiant Cobalt Blue)
const dropoffIcon = L.divIcon({
  html: `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
      <div style="width: 28px; height: 28px; background: #0284c7; border: 2.5px solid #ffffff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.6);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </div>
      <span style="background: #071328; color: #38bdf8; font-weight: 800; font-size: 10px; padding: 2px 6px; border-radius: 4px; border: 1px solid #0284c7; margin-top: 2px;">DESTINATION</span>
    </div>
  `,
  className: 'dropoff-pin',
  iconSize: [40, 50],
  iconAnchor: [20, 25],
});

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick(e.latlng);
      }
    },
  });
  return null;
}

function MapRecenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, map.getZoom(), { animate: true });
    }
  }, [center, map]);
  return null;
}

export default function MapView({
  taxis = [],
  pickup = null,
  dropoff = null,
  routeWaypoints = [],
  center = [12.9716, 77.5946],
  zoom = 14,
  onMapClick = null,
  selectedTaxiId = null,
  onSelectTaxi = null,
}) {
  return (
    <div className="w-full h-full relative rounded-2xl overflow-hidden border border-[#1f293d] shadow-2xl">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ width: '100%', height: '100%', background: '#090d16' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors & CartoDB'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          className="dark-tiles"
        />

        <MapRecenter center={center} />
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}

        {/* Autonomous Route Polyline */}
        {routeWaypoints && routeWaypoints.length > 1 && (
          <>
            {/* Outer Glowing Glow Line */}
            <Polyline
              positions={routeWaypoints}
              color="#06b6d4"
              weight={7}
              opacity={0.35}
            />
            {/* Inner Vibrant Path Line */}
            <Polyline
              positions={routeWaypoints}
              color="#10b981"
              weight={4}
              opacity={0.9}
              dashArray="6, 8"
            />
          </>
        )}

        {/* Pickup Marker */}
        {pickup && pickup.lat && (
          <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}>
            <Popup>
              <div className="text-slate-900 font-sans p-1">
                <strong className="text-emerald-700 block text-xs">Pickup Location</strong>
                <span className="text-xs">{pickup.name || 'Selected Pickup Point'}</span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Dropoff Marker */}
        {dropoff && dropoff.lat && (
          <Marker position={[dropoff.lat, dropoff.lng]} icon={dropoffIcon}>
            <Popup>
              <div className="text-slate-900 font-sans p-1">
                <strong className="text-rose-700 block text-xs">Dropoff Destination</strong>
                <span className="text-xs">{dropoff.name || 'Selected Destination'}</span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Fleet of Autonomous Taxis */}
        {taxis.map((taxi) => (
          <Marker
            key={taxi.id}
            position={[taxi.current_lat, taxi.current_lng]}
            icon={createTaxiIcon(taxi)}
            eventHandlers={{
              click: () => onSelectTaxi && onSelectTaxi(taxi),
            }}
          >
            <Popup>
              <div className="text-slate-900 font-sans p-2 min-w-[180px]">
                <div className="flex items-center justify-between border-b pb-1 mb-1">
                  <span className="font-bold text-xs text-slate-800">{taxi.taxi_code}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    taxi.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-800' :
                    taxi.status === 'EMERGENCY_STOP' ? 'bg-rose-100 text-rose-800' : 'bg-cyan-100 text-cyan-800'
                  }`}>
                    {taxi.status}
                  </span>
                </div>
                <div className="text-xs text-slate-600 space-y-0.5">
                  <div><strong>Model:</strong> {taxi.name}</div>
                  <div><strong>Speed:</strong> {taxi.speed_kmh} km/h</div>
                  <div><strong>Battery:</strong> {taxi.battery_percent}%</div>
                  <div><strong>Heading:</strong> {taxi.current_heading}°</div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
