"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionUser } from "@/lib/types";

// 상단 메뉴와 페이지가 동시에 이 훅을 쓰면 같은 요청이 두 번 나가서, 진행 중인 요청은 하나로 합친다.
let meRequest: Promise<{ user: SessionUser | null }> | null = null;
function fetchMe() {
  if (!meRequest) {
    meRequest = fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error(`auth/me ${res.status}`);
        return res.json();
      })
      .finally(() => {
        meRequest = null;
      });
  }
  return meRequest;
}

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  // 서버나 DB가 응답하지 못하면 true. 이걸 안 잡으면 화면이 빈 채로 멈춘다.
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchMe();
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
