"use client";

import { useState } from "react";
import type { EventItem } from "@/lib/types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function MonthCalendar({
  events,
  todayStr,
  selectedDate,
  onSelectDate,
}: {
  events: EventItem[];
  todayStr: string;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const [year, todayMonth, todayDay] = todayStr.split("-").map(Number);
  const [cursor, setCursor] = useState({ year, month: todayMonth - 1 });

  const eventsByDate = new Map<string, EventItem[]>();
  for (const e of events) {
    const list = eventsByDate.get(e.date) ?? [];
    list.push(e);
    eventsByDate.set(e.date, list);
  }

  const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      `${cursor.year}-${pad(cursor.month + 1)}-${pad(i + 1)}`
    ),
  ];

  const changeMonth = (delta: number) => {
    setCursor((c) => {
      const m = c.month + delta;
      if (m < 0) return { year: c.year - 1, month: 11 };
      if (m > 11) return { year: c.year + 1, month: 0 };
      return { year: c.year, month: m };
    });
  };

  const isToday = (d: string) =>
    d === `${year}-${pad(todayMonth)}-${pad(todayDay)}`;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => changeMonth(-1)}
          aria-label="이전 달"
          className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-zinc-100"
        >
          ‹
        </button>
        <p className="text-sm font-bold">
          {cursor.year}년 {cursor.month + 1}월
        </p>
        <button
          onClick={() => changeMonth(1)}
          aria-label="다음 달"
          className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-zinc-100"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-xs font-semibold text-zinc-400">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const dayEvents = eventsByDate.get(d) ?? [];
          const dayNum = Number(d.slice(-2));
          const selected = d === selectedDate;
          return (
            <button
              key={d}
              onClick={() => onSelectDate(d)}
              className={`mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-sm ${
                selected
                  ? "bg-blue-700 text-white font-bold"
                  : isToday(d)
                    ? "border border-blue-600 font-bold text-blue-700"
                    : "text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {dayNum}
              {dayEvents.length > 0 && (
                <span
                  className={`-mt-0.5 h-1 w-1 rounded-full ${
                    selected ? "bg-white" : "bg-blue-600"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
