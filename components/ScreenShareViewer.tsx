"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MonitorUp, Volume2, VolumeX } from "lucide-react";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export function ScreenShareViewer({ sessionId }: { sessionId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const lastSignalIdRef = useRef(0);
  const [status, setStatus] = useState("Waiting for employee stream…");
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerRef.current = peer;

    peer.ontrack = (event) => {
      if (videoRef.current) {
        videoRef.current.srcObject = event.streams[0] || new MediaStream([event.track]);
        void videoRef.current.play().catch(() => undefined);
      }
      setStatus("Live");
    };

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      void fetch("/api/admin/screen-share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          signalType: "ice",
          payload: event.candidate.toJSON(),
        }),
      });
    };

    async function poll() {
      if (cancelled) return;
      try {
        const response = await fetch(
          "/api/admin/screen-share?sessionId=" + encodeURIComponent(sessionId) + "&afterId=" + lastSignalIdRef.current,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          signals?: Array<{ id: number; signal_type: "offer" | "ice"; payload: RTCSessionDescriptionInit | RTCIceCandidateInit }>;
        };
        for (const signal of data.signals || []) {
          lastSignalIdRef.current = Math.max(lastSignalIdRef.current, signal.id);
          if (signal.signal_type === "offer") {
            await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await fetch("/api/admin/screen-share", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId, signalType: "answer", payload: answer }),
            });
            setStatus("Connecting…");
          } else if (signal.signal_type === "ice") {
            await peer.addIceCandidate(signal.payload as RTCIceCandidateInit).catch(() => undefined);
          }
        }
      } catch {
        setStatus("Connection retrying…");
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      peer.close();
      peerRef.current = null;
    };
  }, [sessionId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <MonitorUp size={14} className="text-emerald-400" />
            {status}
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-50">Live Screen Share</h1>
          <p className="mt-1 text-sm text-neutral-500">Peer-to-peer WebRTC stream. The app does not record or save the screen/audio.</p>
        </div>
        <Link href="/admin/employee-activity" className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-300">
          <ArrowLeft size={13} />
          Employee Activity
        </Link>
      </div>

      <section className="overflow-hidden rounded-xl2 border border-base-700 bg-black shadow-card">
        <video ref={videoRef} autoPlay playsInline muted={muted} className="aspect-video w-full object-contain" />
      </section>
      <button type="button" onClick={() => setMuted((value) => !value)} className="inline-flex items-center gap-2 rounded-lg border border-base-600 px-3 py-2 text-xs text-neutral-300">
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        {muted ? "Enable stream audio" : "Mute stream audio"}
      </button>
    </div>
  );
}
