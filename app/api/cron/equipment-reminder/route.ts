import { listEvents, listUsersByStatus, updateEvent } from "@/lib/db";
import { todayStr } from "@/lib/format";
import { sendPushToMember } from "@/lib/push";
import { MATCH_DURATION_HOURS } from "@/lib/rules";

// Vercel cron이 주기적으로 호출: 경기 당일, 시작 시각 + MATCH_DURATION_HOURS가
// 지난 경기 중 비품(공가방1·공가방2·물/음료·아이스박스) 담당자 4칸이 아직 다
// 안 채워졌으면, 아직 알림을 안 보낸 경기에 한해 운영진 전원에게 입력 요청
// 푸시를 보낸다. "경기 당일"로 제한해서, 이 기능 도입 전부터 있던 과거
// 경기들이 한꺼번에 알림을 쏟아내는 일이 없게 한다.
export async function GET() {
  const today = todayStr();
  const [events, adminUsers] = await Promise.all([
    listEvents(),
    listUsersByStatus("approved"),
  ]);
  const adminMemberIds = [
    ...new Set(
      adminUsers
        .filter((u) => u.role === "admin" && u.memberId != null)
        .map((u) => u.memberId as number)
    ),
  ];
  if (adminMemberIds.length === 0) return Response.json({ notified: 0 });

  const now = Date.now();
  let notified = 0;
  for (const ev of events) {
    if (ev.type !== "match" || ev.equipmentReminderSent || !ev.time || ev.date !== today) {
      continue;
    }
    const start = new Date(`${ev.date}T${ev.time}:00+09:00`).getTime();
    if (Number.isNaN(start) || now < start + MATCH_DURATION_HOURS * 3600_000) continue;

    const allFilled =
      ev.dutyOffense && ev.dutyDefense && ev.waterDuty && ev.iceboxDuty;
    if (!allFilled) {
      await Promise.all(
        adminMemberIds.map((memberId) =>
          sendPushToMember(memberId, {
            title: "비품 담당자 입력",
            body: `${ev.title} 비품(공가방·물/음료·아이스박스) 담당자를 입력해주세요.`,
            url: `/events/${ev.id}`,
          })
        )
      );
      notified++;
    }
    await updateEvent(ev.id, { equipmentReminderSent: true });
  }
  return Response.json({ notified });
}
