"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionUser } from "@/lib/types";

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  // 서버나 DB가 응답하지 못하면 true. 이걸 안 잡으면 화면이 빈 채로 멈춘다.
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) throw new Error(`auth/me ${res.status}`);
      const data = await res.json();
      setUser(data.user);
      setError(false);
    } catch {
      setUser(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  return { user, loading, error, refresh, logout };
}
