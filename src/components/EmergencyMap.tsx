import { useEffect, useRef, useState } from "react";

interface TrailPoint {
  lat: number;
  lon: number;
  timestamp?: number;
}

interface EmergencyMapProps {
  lat: number | null;
  lon: number | null;
  accuracy?: number | null;
  trail?: TrailPoint[];
  isLive?: boolean;
  className?: string;
  height?: string;
}

export function EmergencyMap({
  lat,
  lon,
  accuracy,
  trail = [],
  isLive = true,
  className = "",
  height = "340px",
}: EmergencyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const hasCoords = lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon);

  useEffect(() => {
    if (!containerRef.current || !hasCoords) return;

    const L = (window as any).L;
    if (!L) {
      // If Leaflet global is not yet available, wait and retry
      const check = setInterval(() => {
        if ((window as any).L) {
          clearInterval(check);
          setMapLoaded(true);
        }
      }, 200);
      return () => clearInterval(check);
    }

    if (!mapInstanceRef.current) {
      const map = L.map(containerRef.current, {
        center: [lat, lon],
        zoom: 16,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      // SafeHer Neo-brutalist custom marker
      const customIcon = L.divIcon({
        className: "safeher-custom-marker",
        html: `
          <div style="position: relative; width: 34px; height: 34px; transform: translate(-50%, -50%);">
            <div style="position: absolute; inset: -8px; border-radius: 50%; background: rgba(231, 34, 26, 0.35); animation: pulse-ring 2s infinite;"></div>
            <div style="position: absolute; inset: 0; background: #e7221a; border: 3px solid #101010; border-radius: 50%; box-shadow: 3px 3px 0 #101010; display: grid; place-items: center;">
              <div style="width: 10px; height: 10px; background: #ffd400; border-radius: 50%; border: 1.5px solid #101010;"></div>
            </div>
          </div>
        `,
        iconSize: [0, 0],
      });

      const marker = L.marker([lat, lon], { icon: customIcon }).addTo(map);
      markerRef.current = marker;

      if (accuracy && accuracy > 0) {
        const circle = L.circle([lat, lon], {
          radius: Math.min(accuracy, 200),
          color: "#e7221a",
          fillColor: "#ffd400",
          fillOpacity: 0.15,
          weight: 2,
          dashArray: "4, 6",
        }).addTo(map);
        circleRef.current = circle;
      }

      mapInstanceRef.current = map;
      setMapLoaded(true);
    } else {
      const map = mapInstanceRef.current;
      map.setView([lat, lon], map.getZoom(), { animate: true });

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lon]);
      }

      if (circleRef.current && accuracy) {
        circleRef.current.setLatLng([lat, lon]);
        circleRef.current.setRadius(Math.min(accuracy, 200));
      }
    }

    // Render trail path if points are available
    if (mapInstanceRef.current && trail.length > 1) {
      const L = (window as any).L;
      const latlngs = trail.map((t) => [t.lat, t.lon]);
      if (polylineRef.current) {
        polylineRef.current.setLatLngs(latlngs);
      } else {
        polylineRef.current = L.polyline(latlngs, {
          color: "#101010",
          weight: 4,
          dashArray: "6, 6",
          opacity: 0.8,
        }).addTo(mapInstanceRef.current);
      }
    }

    return () => {
      // Map cleanup on unmount
    };
  }, [lat, lon, accuracy, hasCoords, trail]);

  // Teardown map on complete unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className={`blk sh-ink relative overflow-hidden rounded-2xl bg-brand-white ${className}`}>
      {/* Live Badge Header */}
      <div className="absolute left-3 top-3 z-[1000] flex items-center gap-2 rounded-full border-2 border-brand-ink bg-brand-bone px-3 py-1.5 shadow-[2px_2px_0_#101010]">
        <span className="relative flex size-2.5">
          {isLive && <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-red opacity-80" />}
          <span className={`relative inline-flex size-2.5 rounded-full ${isLive ? "bg-brand-red" : "bg-brand-ink/60"}`} />
        </span>
        <span className="micro text-brand-ink">
          {isLive ? "LIVE GPS SHARING" : "RECORDED LOCATION"}
        </span>
        {accuracy && (
          <span className="micro text-brand-ink/60">
            · ±{Math.round(accuracy)}m
          </span>
        )}
      </div>

      {/* External Map Link */}
      {hasCoords && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`}
          target="_blank"
          rel="noreferrer"
          className="micro absolute bottom-3 right-3 z-[1000] rounded-full border-2 border-brand-ink bg-brand-yellow px-3 py-1 text-brand-ink shadow-[2px_2px_0_#101010] hover:bg-[#e6bf00]"
        >
          Open Google Maps ↗
        </a>
      )}

      {/* Map Container or Loading Placeholder */}
      {hasCoords ? (
        <div ref={containerRef} style={{ height, width: "100%" }} className="z-0" />
      ) : (
        <div style={{ height }} className="flex flex-col items-center justify-center p-6 text-center text-brand-ink/60">
          <div className="size-8 animate-spin rounded-full border-4 border-brand-ink border-t-brand-red mb-3" />
          <p className="poster text-lg text-brand-ink">Acquiring GPS Signal...</p>
          <p className="micro mt-1 text-brand-ink/60">Ensure location permission is allowed on your device.</p>
        </div>
      )}
    </div>
  );
}
