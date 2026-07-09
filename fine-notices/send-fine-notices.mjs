#!/usr/bin/env node
// 매월 1일 00:01(launchd StartCalendarInterval)에 실행되어, 그 달 경기 투표를
// 하나라도 안 한 정식 멤버에게 벌금 안내 메시지를 맥미니의 Messages.app으로
// 보낸다. DRY_RUN=true(기본값)면 실제로 보내지 않고 무엇을 보낼지만 로그에
// 남긴다 — 처음 켤 땐 반드시 DRY_RUN=true로 한 번 확인하고, 문제 없으면
// plist의 DRY_RUN 값을 false로 바꿔서 실제 발송을 켠다.
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.RAVEN_BASE_URL || "https://raven-fc.vercel.app";
const SECRET = process.env.FINE_NOTICE_SECRET;
const DRY_RUN = (process.env.DRY_RUN ?? "true") !== "false";

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

// 010-1234-5678, 01012345678 등을 +8210... 형식으로 정규화.
function normalizePhone(raw) {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("82")) return `+${digits}`;
  if (digits.startsWith("0")) return `+82${digits.slice(1)}`;
  return `+${digits}`;
}

function sendIMessage(phone, message) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "send-imessage.applescript");
    execFile("osascript", [scriptPath, phone, message], (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

async function main() {
  if (!SECRET) {
    log("FINE_NOTICE_SECRET이 설정되지 않았어요. 종료합니다.");
    process.exit(1);
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  log(`${year}년 ${month}월 미투표자 조회 중... (DRY_RUN=${DRY_RUN})`);

  const res = await fetch(
    `${BASE_URL}/api/admin/monthly-nonvoters?year=${year}&month=${month}`,
    { headers: { Authorization: `Bearer ${SECRET}` } }
  );
  if (!res.ok) {
    log(`조회 실패: HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const { notices } = await res.json();
  log(`미투표자 ${notices.length}명`);

  for (const n of notices) {
    if (!n.phone) {
      log(`- ${n.name}: 전화번호 없음, 건너뜀`);
      continue;
    }
    const phone = normalizePhone(n.phone);
    if (DRY_RUN) {
      log(`- [DRY_RUN] ${n.name}(${phone})에게 벌금 안내를 보낼 예정`);
      continue;
    }
    try {
      await sendIMessage(phone, n.message);
      log(`- ${n.name}(${phone})에게 발송 완료`);
    } catch (e) {
      log(`- ${n.name}(${phone}) 발송 실패: ${e.message}`);
    }
  }
  log("완료");
}

main().catch((e) => {
  log("에러:", e);
  process.exit(1);
});
