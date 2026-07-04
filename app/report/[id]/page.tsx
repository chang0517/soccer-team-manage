"use client";

import { use, useEffect, useState } from "react";
import { formatDate, todayStr } from "@/lib/format";
import type { EventItem, Member, RecordRow, VoteRow } from "@/lib/types";

export default function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [event, setEvent] = useState<EventItem | null>(null);
  const [orgName, setOrgName] = useState("Raven FC");
  const [writer, setWriter] = useState("");
  const [content, setContent] = useState("");
  const [attendeeText, setAttendeeText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const [detail, mems] = await Promise.all([
        fetch(`/api/events/${id}`).then((r) => r.json()),
        fetch("/api/members").then((r) => r.json()) as Promise<Member[]>,
      ]);
      if (detail.error) return;
      const ev: EventItem = detail.event;
      const records: RecordRow[] = detail.records;
      const votes: VoteRow[] = detail.votes;
      setEvent(ev);

      const byId = new Map(mems.map((m) => [m.id, m.name]));
      const played = records.filter((r) => r.played).map((r) => byId.get(r.memberId));
      const attended = votes
        .filter((v) => v.status === "attend")
        .map((v) => byId.get(v.memberId));
      const names = (played.length > 0 ? played : attended).filter(
        (n): n is string => !!n
      );
      setAttendeeText(names.join(", "));

      let desc =
        ev.type === "match"
          ? `${ev.opponent ? `${ev.opponent}와(과) ` : ""}친선 경기를 진행하였음.`
          : `${ev.title} 활동을 진행하였음.`;
      if (ev.scored != null && ev.conceded != null) {
        const result =
          ev.scored > ev.conceded ? "승리" : ev.scored < ev.conceded ? "패배" : "무승부";
        desc += ` (결과 ${ev.scored}:${ev.conceded} ${result})`;
      }
      setContent(desc);
    })();
  }, [id]);

  const onPhotos = (files: FileList | null) => {
    if (!files) return;
    const urls = Array.from(files)
      .slice(0, 6)
      .map((f) => URL.createObjectURL(f));
    setPhotos(urls);
  };

  if (!event)
    return <p className="py-10 text-center text-zinc-400">불러오는 중…</p>;

  const attendeeCount = attendeeText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length;

  const cell = "border border-zinc-400 px-3 py-2 text-sm align-top";
  const headCell =
    "border border-zinc-400 px-2 py-2 text-sm align-top w-24 whitespace-nowrap bg-zinc-100 font-bold";

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <h1 className="text-lg font-bold">활동 보고서</h1>
        <button
          onClick={() => window.print()}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
        >
          다운로드 (PDF 저장 / 인쇄)
        </button>
      </div>
      <p className="no-print text-xs text-zinc-400">
        버튼을 누르면 인쇄 화면이 열려요. 대상에서 &ldquo;PDF로 저장&rdquo;을
        선택하면 파일로 받을 수 있어요. 정식 양식 파일을 주시면 그 양식 그대로
        만들어 드릴게요.
      </p>

      <div className="print-sheet mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-center text-2xl font-extrabold tracking-wide">
          동호회 활동 보고서
        </h2>
        <table className="w-full table-fixed border-collapse">
          <tbody>
            <tr>
              <td className={headCell}>동호회명</td>
              <td className={cell} colSpan={3}>
                <input
                  className="w-full outline-none"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td className={headCell}>활동명</td>
              <td className={cell} colSpan={3}>
                {event.title}
                {event.opponent && ` (vs ${event.opponent})`}
              </td>
            </tr>
            <tr>
              <td className={headCell}>활동 일시</td>
              <td className={cell}>{formatDate(event.date, event.time)}</td>
              <td className={headCell}>활동 장소</td>
              <td className={cell}>{event.location || "-"}</td>
            </tr>
            <tr>
              <td className={headCell}>참석 인원</td>
              <td className={cell} colSpan={3}>
                <p className="mb-1 font-semibold">{attendeeCount}명</p>
                <textarea
                  className="w-full resize-none outline-none"
                  rows={2}
                  value={attendeeText}
                  onChange={(e) => setAttendeeText(e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td className={headCell}>활동 내용</td>
              <td className={cell} colSpan={3}>
                <textarea
                  className="w-full resize-none outline-none"
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td className={headCell}>활동 사진</td>
              <td className={cell} colSpan={3}>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="no-print mb-2 text-xs"
                  onChange={(e) => onPhotos(e.target.files)}
                />
                {photos.length === 0 ? (
                  <p className="text-xs text-zinc-400">
                    사진을 선택하면 여기에 들어가요 (최대 6장).
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {photos.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={src}
                        alt={`활동 사진 ${i + 1}`}
                        className="h-40 w-full rounded object-cover"
                      />
                    ))}
                  </div>
                )}
              </td>
            </tr>
            <tr>
              <td className={headCell}>작성자</td>
              <td className={cell}>
                <input
                  className="w-full outline-none"
                  placeholder="이름"
                  value={writer}
                  onChange={(e) => setWriter(e.target.value)}
                />
              </td>
              <td className={headCell}>작성일</td>
              <td className={cell}>{formatDate(todayStr())}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
