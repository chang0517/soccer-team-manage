import { MATCH_DURATION_HOURS } from "./rules";
import type { EventItem } from "./types";

// iCalendar(RFC 5545) 텍스트 필드에서 특수문자로 취급되는 문자를 이스케이프한다.
function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// KST 벽시계 시각(date+time, "+09:00" 고정 오프셋)을 iCalendar UTC 포맷으로 바꾼다.
function toIcsUtc(date: string, time: string): string {
  const ms = new Date(`${date}T${time}:00+09:00`).getTime();
  return new Date(ms).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function toIcsDate(date: string): string {
  return date.replace(/-/g, "");
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}

/**
 * 등록된 일정을 OS 캘린더(아이폰/갤럭시)가 구독할 수 있는 iCalendar(.ics)
 * 피드로 변환한다. 시작 시각이 있는 일정은 시작 + MATCH_DURATION_HOURS를
 * 종료로 잡고, 시각이 비어있으면(친선 모임 등) 하루짜리 종일 일정으로 만든다.
 */
export function eventsToIcs(events: EventItem[]): string {
  const now = toIcsUtc(
    new Date().toISOString().slice(0, 10),
    new Date().toISOString().slice(11, 16)
  );
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Raven FC//events//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Raven FC 일정",
    "X-WR-TIMEZONE:Asia/Seoul",
  ];

  for (const ev of events) {
    const summary = ev.opponent ? `${ev.title} vs ${ev.opponent}` : ev.title;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:ravenfc-event-${ev.id}@raven-fc`);
    lines.push(`DTSTAMP:${now}`);
    if (ev.time) {
      lines.push(`DTSTART:${toIcsUtc(ev.date, ev.time)}`);
      const endMs =
        new Date(`${ev.date}T${ev.time}:00+09:00`).getTime() +
        MATCH_DURATION_HOURS * 3600_000;
      lines.push(
        `DTEND:${new Date(endMs).toISOString().replace(/[-:]/g, "").split(".")[0]}Z`
      );
    } else {
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(ev.date)}`);
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(addDays(ev.date, 1))}`);
    }
    lines.push(`SUMMARY:${escapeText(summary)}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
