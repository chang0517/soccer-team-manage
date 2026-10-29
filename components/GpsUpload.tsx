"use client";

import { useState } from "react";
import type { Member } from "@/lib/types";

// 서버리스 요청 본문 한도(약 4.5MB) 때문에 로그는 브라우저에서 gzip으로 줄여 보낸다.
const MAX_UPLOAD_BYTES = 4_200_000;

async function gzip(file: File): Promise<Blob> {
  if (typeof CompressionStream === "undefined") return file;
  const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

export default function GpsUpload({
  sessionId,
  members,
  onUploaded,
}: {
  sessionId: number;
  members: Member[];
  onUploaded: () => void;
}) {
  const [memberId, setMemberId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const body = await gzip(file);
      if (body.size > MAX_UPLOAD_BYTES) {
        alert("파일이 너무 커요. 경기 시간대만 잘라서 올려 주세요.");
        return;
      }
      const q = new URLSearchParams();
      if (memberId) q.set("memberId", memberId);
      const res = await fetch(`/api/gps/sessions/${sessionId}/tracks?${q}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "올리지 못했어요.");
        return;
      }
      setFile(null);
      onUploaded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white space-y-3 p-4">
      <p className="text-sm font-bold">로그 올리기</p>
      <p className="text-xs text-zinc-500">
        포드가 저장한 CSV나 스마트폰·시계 앱의 GPX 파일을 올리면 자동으로 분석해요. 같은 선수의 로그를 다시 올리면
        이전 것을 대체해요.
      </p>
      <select
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
        value={memberId}
        onChange={(e) => setMemberId(e.target.value)}
      >
        <option value="">선수 지정 안 함</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <input
        type="file"
        accept=".csv,.gpx,.txt,text/csv,text/plain,application/gpx+xml"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm"
      />
      <button
        type="button"
        disabled={!file || busy}
        onClick={submit}
        className="w-full rounded-2xl bg-blue-900 py-2.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {busy ? "분석 중…" : "올리고 분석하기"}
      </button>
    </div>
  );
}
