"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { EventItem } from "@/lib/types";

export default function ReportListPage() {
  const [events, setEvents] = useState<EventItem[]>([]);

  useEffect(() => {
    fetch("/api/events").then((r) => r.json()).then(setEvents);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">활동 보고서</h1>
      <p className="text-sm text-zinc-500">
        보고서를 만들 일정을 선택하세요. 일시·장소·참석 인원은 자동으로
        채워져요.
      </p>
      <div className="space-y-2">
        {events.map((e) => (
          <Link
            key={e.id}
            href={`/report/${e.id}`}
            className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
          >
            <div>
              <p className="font-semibold">
                {e.title}
                {e.opponent && (
                  <span className="font-normal text-zinc-500">
                    {" "}
                    vs {e.opponent}
                  </span>
                )}
              </p>
              <p className="text-xs text-zinc-500">
                {formatDate(e.date, e.time)}
                {e.location && ` · ${e.location}`}
              </p>
            </div>
            <span className="text-emerald-700">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
