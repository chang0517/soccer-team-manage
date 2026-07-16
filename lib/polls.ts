import type { Member, Poll, PollDetail, PollOption, PollVoteRow } from "./types";

export function buildPollDetails(
  polls: Poll[],
  options: PollOption[],
  votes: PollVoteRow[],
  members: Member[],
  viewerMemberId: number | null
): PollDetail[] {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const optionsByPoll = new Map<number, PollOption[]>();
  for (const o of options) {
    const list = optionsByPoll.get(o.pollId) ?? [];
    list.push(o);
    optionsByPoll.set(o.pollId, list);
  }
  const votesByPoll = new Map<number, PollVoteRow[]>();
  for (const v of votes) {
    const list = votesByPoll.get(v.pollId) ?? [];
    list.push(v);
    votesByPoll.set(v.pollId, list);
  }

  return polls.map((poll) => {
    const pollVotes = votesByPoll.get(poll.id) ?? [];
    const voteCounts: Record<number, number> = {};
    const optionVoters: Record<number, string[]> = {};
    for (const o of optionsByPoll.get(poll.id) ?? []) {
      voteCounts[o.id] = 0;
      optionVoters[o.id] = [];
    }
    for (const v of pollVotes) {
      voteCounts[v.optionId] = (voteCounts[v.optionId] ?? 0) + 1;
      const name = memberById.get(v.memberId)?.name ?? "알 수 없음";
      (optionVoters[v.optionId] ??= []).push(name);
    }
    for (const names of Object.values(optionVoters)) names.sort((a, b) => a.localeCompare(b, "ko"));
    const voterCount = new Set(pollVotes.map((v) => v.memberId)).size;
    const myOptionIds =
      viewerMemberId == null
        ? []
        : pollVotes.filter((v) => v.memberId === viewerMemberId).map((v) => v.optionId);
    return {
      ...poll,
      creatorName: memberById.get(poll.createdBy)?.name ?? "알 수 없음",
      options: (optionsByPoll.get(poll.id) ?? []).slice().sort((a, b) => a.order - b.order),
      voteCounts,
      optionVoters,
      voterCount,
      myOptionIds,
    };
  });
}
