import { useCallback, useEffect, useState } from "react";
import { Link } from "../router";
import { EmergencyMap } from "../components/EmergencyMap";
import { requestJson } from "@/lib/api";

interface TrackData {
  status: "active" | "resolved" | "cancelled";
  triggerType: string;
  startedAt: string;
  resolvedAt?: string | null;
  lastLocation: { lat: number; lon: number; accuracy: number; timestamp?: number } | null;
  trail: Array<{ lat: number; lon: number; accuracy?: number; timestamp?: number }>;
}

export default function LiveTracking() {
  const [data, setData] = useState<TrackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const token = new URLSearchParams(window.location.search).get("token");

  const fetchTracking = useCallback(async () => {
    if (!token) {
      setError("No emergency tracking token provided.");
      setLoading(false);
      return;
    }

    try {
      const res = (await requestJson(`/functions/v1/app?action=sos_track&token=${encodeURIComponent(token)}`)) as {
        ok?: boolean;
        status?: "active" | "resolved" | "cancelled";
        triggerType?: string;
        startedAt?: string;
        resolvedAt?: string | null;
        lastLocation?: { lat: number; lon: number; accuracy: number; timestamp?: number };
        trail?: Array<{ lat: number; lon: number; accuracy?: number; timestamp?: number }>;
      };

      if (res?.ok && res.status) {
        setData({
          status: res.status,
          triggerType: res.triggerType || "manual",
          startedAt: res.startedAt || new Date().toISOString(),
          resolvedAt: res.resolvedAt,
          lastLocation: res.lastLocation || null,
          trail: res.trail || [],
        });
        setError(null);
      } else {
        setError("This emergency session could not be found or has expired.");
      }
    } catch {
      setError("Failed to fetch emergency tracking data. Check connection.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchTracking();
    // Poll every 4 seconds if active
    const timer = setInterval(() => {
      void fetchTracking();
    }, 4000);
    return () => clearInterval(timer);
  }, [fetchTracking]);

  return (
    <div className="min-h-svh bg-brand-bone text-brand-ink">
      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-50 bg-brand-ink">
        <div className="mx-auto flex h-15 max-w-4xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5 text-white">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-yellow text-brand-ink">
              <svg viewBox="0 0 24 24" className="size-4.5" fill="none" aria-hidden="true">
                <path d="M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="poster text-xl tracking-wide">SafeHer</span>
          </Link>
          <span className="micro rounded-full bg-brand-red px-4 py-1.5 text-white animate-pulse">
            EMERGENCY BROADCAST
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 pb-24 pt-24 sm:pt-28">
        {loading && !data ? (
          <div className="blk sh-ink mx-auto mt-12 max-w-lg rounded-2xl bg-brand-white p-10 text-center">
            <div className="mx-auto size-10 animate-spin rounded-full border-[5px] border-brand-ink border-t-brand-red mb-4" />
            <p className="poster text-2xl text-brand-ink">Connecting to Live Feed...</p>
          </div>
        ) : error ? (
          <div className="blk sh-ink mx-auto mt-12 max-w-lg rounded-2xl bg-brand-white p-8 text-center">
            <span className="text-4xl">⚠️</span>
            <h2 className="poster mt-4 text-3xl text-brand-red">Tracking Unavailable</h2>
            <p className="mt-2 text-sm font-semibold text-brand-ink/70">{error}</p>
            <Link
              to="/"
              className="micro sh-ink-sm mt-6 inline-block rounded-full bg-brand-ink px-7 py-3 text-brand-yellow hover:bg-black"
            >
              Go to SafeHer Home
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Status Card */}
            <div className="blk sh-ink rounded-3xl bg-brand-ink p-7 text-white sm:p-9">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span
                    className={`micro rounded-full px-3.5 py-1 ${
                      data?.status === "active"
                        ? "bg-brand-red text-white"
                        : "bg-green-600 text-white"
                    }`}
                  >
                    STATUS: {data?.status.toUpperCase()}
                  </span>
                  <h1 className="poster mt-3 text-4xl sm:text-5xl text-brand-yellow">
                    {data?.status === "active" ? "SOS IN PROGRESS" : "USER REPORTED SAFE"}
                  </h1>
                  <p className="mt-1 text-sm font-medium text-white/75">
                    Triggered at {new Date(data!.startedAt).toLocaleTimeString()} via{" "}
                    <span className="font-bold uppercase">{data?.triggerType.replace(/_/g, " ")}</span>
                  </p>
                </div>

                <a
                  href="tel:112"
                  className="micro sh-ink-sm flex items-center gap-2 rounded-full bg-brand-red px-6 py-3.5 font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#c81c15]"
                >
                  📞 Call Emergency Services (112)
                </a>
              </div>

              {/* Map */}
              <div className="mt-7">
                <EmergencyMap
                  lat={data?.lastLocation?.lat || null}
                  lon={data?.lastLocation?.lon || null}
                  accuracy={data?.lastLocation?.accuracy || 10}
                  trail={data?.trail || []}
                  isLive={data?.status === "active"}
                  height="380px"
                />
              </div>

              {/* Coordinates info */}
              {data?.lastLocation && (
                <div className="mt-5 grid grid-cols-2 gap-4 text-xs font-semibold text-white/80 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/20 bg-white/5 p-3">
                    <span className="micro block text-white/50">COORDINATES</span>
                    <span className="poster mt-0.5 text-base text-brand-yellow">
                      {data.lastLocation.lat.toFixed(5)}, {data.lastLocation.lon.toFixed(5)}
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/20 bg-white/5 p-3">
                    <span className="micro block text-white/50">ACCURACY</span>
                    <span className="poster mt-0.5 text-base text-brand-yellow">
                      ±{Math.round(data.lastLocation.accuracy)} meters
                    </span>
                  </div>
                  <div className="col-span-2 rounded-xl border border-white/20 bg-white/5 p-3 sm:col-span-1">
                    <span className="micro block text-white/50">LAST UPDATE</span>
                    <span className="poster mt-0.5 text-base text-brand-yellow">
                      {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <p className="micro text-center text-brand-ink/60">
              This is a private emergency broadcast transmitted directly to designated contacts and responders.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
