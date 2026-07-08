"use client";

import type { VoteStatus } from "@/lib/types";

const OPTIONS: { status: VoteStatus; label: string; on: string }[] = [
  { status: "attend", label: "참석", on: "bg-blue-600 text-white border-blue-600" },
  { status: "maybe", label: "미정", on: "bg-amber-500 text-white border-amber-500" },
  { status: "absent", label: "불참", on: "bg-zinc-500 text-white border-zinc-500" },
];

export default function VoteButtons({
  myStatus,
  counts,
  disabled,
  onVote,
}: {
  myStatus: VoteStatus | null;
  counts: Record<VoteStatus, number>;
  disabled?: boolean;
  onVote: (s: VoteStatus) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map((o) => (
        <button
          key={o.status}
          disabled={disabled}
          onClick={() => onVote(o.status)}
          className={`rounded-xl border py-2 text-sm font-semibold transition disabled:opacity-40 ${
            myStatus === o.status
              ? o.on
              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
          }`}
        >
          {o.label}
          <span className="ml-1 text-xs opacity-80">{counts[o.status]}</span>
        </button>
      ))}
    </div>
  );
}
