"use client";

import { useEffect, useState } from "react";

export function useMyId(): [number | null, (id: number | null) => void] {
  const [myId, setMyIdState] = useState<number | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("ravenMemberId");
    if (raw) setMyIdState(Number(raw));
  }, []);

  const setMyId = (id: number | null) => {
    setMyIdState(id);
    if (id === null) localStorage.removeItem("ravenMemberId");
    else localStorage.setItem("ravenMemberId", String(id));
  };

  return [myId, setMyId];
}
