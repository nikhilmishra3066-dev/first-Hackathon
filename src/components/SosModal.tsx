import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { beep, startSiren, stopSiren } from "../lib/siren";
import { requestJson } from "@/lib/api";
import { EmergencyMap } from "./EmergencyMap";
import { useLiveLocation } from "../hooks/useLiveLocation";

interface AlertRecord {
  id: string;
  recipient_name: string;
  channel: string;
  destination: string;
  status: string;
  error_message?: string | null;
  dispatched_at?: string;
  retry_count?: number;
}

interface SosModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerSource?: "manual" | "scream_detection" | "voice_code" | "wearable";
}

export function SosModal({ isOpen, onClose, triggerSource = "manual" }: SosModalProps) {
  // States: "countdown" | "active" | "resolved"
  const [stage, setStage] = useState<"countdown" | "active" | "resolved">("countdown");
  const [countdown, setCountdown] = useState(10);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [isSirenActive, setIsSirenActive] = useState(true);
  const [copied, setCopied] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const countdownTimerRef = useRef<number | null>(null);

  // Live GPS tracking during active emergency session
  const liveLocation = useLiveLocation(stage === "active" ? sessionId : null);

  const startCountdown = useCallback(() => {
    setStage("countdown");
    setCountdown(10);
    beep();

    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
    }

    let remaining = 10;
    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        if (countdownTimerRef.current !== null) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        void triggerEmergencySession();
      } else {
        beep();
      }
    }, 1000);
  }, []);

  const triggerEmergencySession = async () => {
    setStage("active");
    startSiren();
    setIsSirenActive(true);

    let coords: { lat: number; lon: number; accuracy: number } | null = null;
    if ("geolocation" in navigator) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 30000,
          });
        });
        coords = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
      } catch {}
    }

    try {
      const res = (await requestJson("/functions/v1/app?action=sos_trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triggerType: triggerSource,
          location: coords,
        }),
      })) as {
        ok?: boolean;
        session?: { id: string; token: string; tracking_url: string };
        alerts?: AlertRecord[];
      };

      if (res?.ok && res.session) {
        setSessionId(res.session.id);
        setToken(res.session.token);
        setTrackingUrl(res.session.tracking_url);
        setAlerts(res.alerts || []);
      }
    } catch {
      // Fallback in offline state
      setSessionId("offline-" + Date.now());
    }
  };

  const handleCancelCountdown = async () => {
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    stopSiren();
    if (sessionId) {
      try {
        await requestJson("/functions/v1/app?action=sos_cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
      } catch {}
    }
    onClose();
  };

  const handleResolveEmergency = async () => {
    setIsResolving(true);
    stopSiren();
    setIsSirenActive(false);

    if (sessionId) {
      try {
        await requestJson("/functions/v1/app?action=sos_resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
      } catch {}
    }

    setStage("resolved");
    setIsResolving(false);
  };

  const toggleSiren = () => {
    if (isSirenActive) {
      stopSiren();
      setIsSirenActive(false);
    } else {
      startSiren();
      setIsSirenActive(true);
    }
  };

  const handleRetryAlert = async (alertId: string) => {
    setRetryingId(alertId);
    try {
      const res = (await requestJson("/functions/v1/app?action=sos_retry_alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId }),
      })) as {
        ok?: boolean;
        result?: { status: string; error_message?: string; retry_count: number };
      };

      if (res?.ok && res.result) {
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId
              ? {
                  ...a,
                  status: res.result!.status,
                  error_message: res.result!.error_message,
                  retry_count: res.result!.retry_count,
                }
              : a,
          ),
        );
      }
    } catch {
      alert("Retry failed. Check network connection.");
    } finally {
      setRetryingId(null);
    }
  };

  const handleCopyLink = () => {
    if (!trackingUrl) return;
    void navigator.clipboard.writeText(trackingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Trigger countdown when modal opens
  useEffect(() => {
    if (isOpen) {
      startCountdown();
    } else {
      if (countdownTimerRef.current !== null) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      stopSiren();
    }
  }, [isOpen, startCountdown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* ==================================================== */}
        {/* COUNTDOWN STAGE */}
        {/* ==================================================== */}
        {stage === "countdown" && (
          <div className="blk sh-yellow rounded-3xl bg-brand-red p-8 text-center text-white sm:p-12">
            <span className="micro inline-block rounded-full bg-brand-ink px-4 py-1.5 text-brand-yellow">
              Safety Check · False Alarm Protection
            </span>
            <h2 className="poster mt-5 text-4xl sm:text-5xl">Emergency Triggered!</h2>
            <p className="mt-2 text-lg font-medium text-white/90">
              Trigger source: <span className="font-extrabold uppercase">{triggerSource.replace(/_/g, " ")}</span>
            </p>

            <div className="poster my-6 text-[30vw] leading-none sm:text-[180px]" aria-live="assertive">
              {countdown}
            </div>

            <p className="mx-auto max-w-md font-medium text-white/85">
              If this was an accident, cancel now. Otherwise, sirens will sound and live GPS alerts will be dispatched to your trusted contacts.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                type="button"
                onClick={handleCancelCountdown}
                className="micro sh-ink-sm h-14 rounded-full bg-brand-yellow px-10 text-lg font-extrabold text-brand-ink transition hover:-translate-y-0.5 hover:bg-[#e6bf00]"
              >
                I'm OK — Cancel SOS
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (countdownTimerRef.current !== null) {
                    clearInterval(countdownTimerRef.current);
                    countdownTimerRef.current = null;
                  }
                  void triggerEmergencySession();
                }}
                className="micro rounded-full border-[3px] border-white bg-transparent px-8 py-3.5 font-extrabold text-white transition hover:bg-white hover:text-brand-red"
              >
                Skip to SOS Now →
              </Button>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* ACTIVE EMERGENCY STAGE */}
        {/* ==================================================== */}
        {stage === "active" && (
          <div className="blk sh-ink max-h-[90vh] overflow-y-auto rounded-3xl bg-brand-ink p-6 text-white sm:p-8">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-white/20 pb-4">
              <div className="flex items-center gap-3">
                <span className="relative flex size-4">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-red opacity-80" />
                  <span className="relative inline-flex size-4 rounded-full bg-brand-red" />
                </span>
                <div>
                  <h2 className="poster text-2xl text-brand-yellow sm:text-3xl">ACTIVE EMERGENCY SESSION</h2>
                  <p className="micro text-white/70">
                    Live Broadcast Active · {new Date().toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleSiren}
                className={`micro rounded-full border-2 border-white px-4 py-2 font-extrabold transition ${
                  isSirenActive ? "bg-brand-red text-white" : "bg-white/10 text-white/70"
                }`}
              >
                {isSirenActive ? "🔊 Siren Wailing (Mute)" : "🔈 Siren Muted (Sound)"}
              </button>
            </div>

            {/* Live Map Component */}
            <div className="mt-5">
              <EmergencyMap
                lat={liveLocation.lat}
                lon={liveLocation.lon}
                accuracy={liveLocation.accuracy}
                isLive={true}
                height="280px"
              />
            </div>

            {/* Tracking Link Bar */}
            {trackingUrl && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-brand-yellow bg-brand-bone/10 p-3.5">
                <div className="min-w-0 flex-1">
                  <span className="micro block text-brand-yellow">Secure Live Tracking URL</span>
                  <span className="block truncate font-mono text-xs text-white/85">{trackingUrl}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="micro shrink-0 rounded-full bg-brand-yellow px-4 py-2 font-extrabold text-brand-ink transition hover:bg-[#e6bf00]"
                >
                  {copied ? "✓ Copied!" : "Copy Link"}
                </button>
              </div>
            )}

            {/* Alerts Dispatched List */}
            <div className="mt-6">
              <h4 className="micro text-brand-yellow mb-3">Emergency Alerts Dispatched:</h4>
              {alerts.length === 0 ? (
                <div className="rounded-xl border-2 border-white/15 bg-white/5 p-4 text-center">
                  <p className="text-sm font-semibold text-white/80">
                    Broadcasting alert to emergency volunteer network & campus responders.
                  </p>
                  <p className="micro mt-1 text-white/50">
                    (Add trusted personal contacts in the Trusted Circle section to alert them directly)
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-white/15 bg-white/5 p-3 text-sm"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-white">{alert.recipient_name}</span>
                          <span className="micro rounded bg-white/20 px-1.5 py-0.5 text-[10px]">
                            {alert.channel.toUpperCase()}
                          </span>
                        </div>
                        <span className="text-xs text-white/60">{alert.destination}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`micro rounded-full px-2.5 py-1 ${
                            alert.status === "delivered" || alert.status === "sent"
                              ? "bg-green-600 text-white"
                              : alert.status === "simulated"
                              ? "bg-brand-yellow text-brand-ink"
                              : "bg-brand-red text-white"
                          }`}
                        >
                          {alert.status.toUpperCase()}
                        </span>
                        {alert.status === "failed" && (
                          <button
                            type="button"
                            disabled={retryingId === alert.id}
                            onClick={() => handleRetryAlert(alert.id)}
                            className="micro rounded border border-white/40 px-2 py-1 text-xs hover:bg-white/20"
                          >
                            {retryingId === alert.id ? "Retrying..." : "Retry"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t-2 border-white/20 pt-6 sm:flex-row">
              <a
                href="tel:112"
                className="micro sh-ink-sm flex h-13 w-full items-center justify-center gap-2 rounded-full bg-brand-red px-6 font-extrabold text-white hover:bg-[#c81c15] sm:w-auto"
              >
                📞 Call 112 Emergency
              </a>

              <Button
                type="button"
                disabled={isResolving}
                onClick={handleResolveEmergency}
                className="micro sh-ink-sm h-13 w-full rounded-full bg-brand-white px-8 font-extrabold text-brand-ink transition hover:-translate-y-0.5 hover:bg-brand-bone sm:w-auto"
              >
                {isResolving ? "Ending Session..." : "I Am Safe Now (End SOS)"}
              </Button>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* RESOLVED STAGE */}
        {/* ==================================================== */}
        {stage === "resolved" && (
          <div className="blk sh-yellow rounded-3xl bg-brand-white p-8 text-center text-brand-ink sm:p-12">
            <span className="grid size-16 place-items-center rounded-full bg-green-500 text-3xl text-white mx-auto">
              ✓
            </span>
            <h2 className="poster mt-5 text-4xl text-brand-ink">Emergency Session Resolved</h2>
            <p className="mx-auto mt-2 max-w-md font-medium text-brand-ink/75">
              Live location sharing has been terminated. A "Safe Now" follow-up notification has been sent to your contacts.
            </p>
            <div className="mt-8">
              <Button
                type="button"
                onClick={onClose}
                className="micro sh-ink-sm rounded-full bg-brand-ink px-10 py-4 font-extrabold text-brand-yellow hover:bg-black"
              >
                Return to Safety Dashboard
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
