"use client";

import { useEffect, useState } from "react";

// base64url VAPID 공개키를 Uint8Array로 변환 (PushManager.subscribe 요구 형식)
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function PushPrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!isStandalone) return;
    if (Notification.permission === "denied") return;
    if (localStorage.getItem("pushDismissed") === "1") return;

    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const existing = await reg.pushManager.getSubscription();
      if (!existing && Notification.permission !== "granted") setVisible(true);
    });
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setVisible(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
    } finally {
      setBusy(false);
      setVisible(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem("pushDismissed", "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="no-print fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-blue-200 bg-white p-3 shadow-lg md:bottom-6">
      <span className="text-2xl">🔔</span>
      <p className="flex-1 text-xs text-zinc-600">
        새 경기 일정이 올라오면 바로 알림을 받아보세요.
      </p>
      <button
        onClick={enable}
        disabled={busy}
        className="shrink-0 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
      >
        {busy ? "설정 중…" : "알림 켜기"}
      </button>
      <button onClick={dismiss} className="shrink-0 text-xs text-zinc-400">
        닫기
      </button>
    </div>
  );
}
