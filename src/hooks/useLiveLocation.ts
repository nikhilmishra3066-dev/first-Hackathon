import { useCallback, useEffect, useRef, useState } from "react";
import { requestJson } from "@/lib/api";

export interface LocationState {
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number | null;
  error: string | null;
  permissionState: "prompt" | "granted" | "denied" | "unsupported";
  isTracking: boolean;
}

export function useLiveLocation(activeSessionId: string | null = null) {
  const [loc, setLoc] = useState<LocationState>({
    lat: null,
    lon: null,
    accuracy: null,
    speed: null,
    heading: null,
    timestamp: null,
    error: null,
    permissionState: "geolocation" in navigator ? "prompt" : "unsupported",
    isTracking: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const lastPushedRef = useRef<number>(0);

  // Check permission state if supported
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLoc((s) => ({ ...s, permissionState: "unsupported" }));
      return;
    }

    const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (permissions?.query) {
      permissions
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          setLoc((s) => ({ ...s, permissionState: status.state }));
          status.onchange = () => {
            setLoc((s) => ({ ...s, permissionState: status.state }));
          };
        })
        .catch(() => {});
    }
  }, []);

  const pushLocationToBackend = useCallback(
    async (coords: GeolocationCoordinates, timestamp: number) => {
      if (!activeSessionId) return;
      // Debounce pushing updates to at most once every 3 seconds
      if (Date.now() - lastPushedRef.current < 3000) return;
      lastPushedRef.current = Date.now();

      try {
        await requestJson("/functions/v1/app?action=sos_location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: activeSessionId,
            lat: coords.latitude,
            lon: coords.longitude,
            accuracy: coords.accuracy,
            speed: coords.speed,
            heading: coords.heading,
          }),
        });
      } catch {
        // Retry silently on next cycle
      }
    },
    [activeSessionId],
  );

  const startTracking = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLoc((s) => ({
        ...s,
        error: "Geolocation is not supported by your browser.",
        permissionState: "unsupported",
      }));
      return;
    }

    if (watchIdRef.current !== null) return;

    setLoc((s) => ({ ...s, isTracking: true, error: null }));

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed, heading } = pos.coords;
        setLoc({
          lat: latitude,
          lon: longitude,
          accuracy,
          speed,
          heading,
          timestamp: pos.timestamp,
          error: null,
          permissionState: "granted",
          isTracking: true,
        });
        void pushLocationToBackend(pos.coords, pos.timestamp);
      },
      (err) => {
        let msg = "Could not retrieve your location.";
        if (err.code === 1) {
          msg = "Location permission was denied.";
          setLoc((s) => ({ ...s, permissionState: "denied", error: msg, isTracking: false }));
        } else if (err.code === 2) {
          msg = "GPS position is currently unavailable.";
          setLoc((s) => ({ ...s, error: msg }));
        } else if (err.code === 3) {
          msg = "Location request timed out.";
          setLoc((s) => ({ ...s, error: msg }));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 4000,
      },
    );

    watchIdRef.current = id;
  }, [pushLocationToBackend]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setLoc((s) => ({ ...s, isTracking: false }));
  }, []);

  // When active session is set, automatically start live tracking; stop when session ends
  useEffect(() => {
    if (activeSessionId) {
      startTracking();
    } else {
      stopTracking();
    }
    return () => {
      stopTracking();
    };
  }, [activeSessionId, startTracking, stopTracking]);

  return {
    ...loc,
    startTracking,
    stopTracking,
  };
}
