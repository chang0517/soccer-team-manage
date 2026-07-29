import webpush from "web-push";
import { deletePushSubscription, getAllPushSubscriptions } from "./db";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

type PushSub = { endpoint: string; p256dh: string; auth: string };

async function sendTo(subs: PushSub[], payload: { title: string; body: string; url: string }) {
  if (!ensureConfigured()) return;
  const json = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          json
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await deletePushSubscription(sub.endpoint);
        }
      }
    })
  );
}

/**
 * 등록된 모든 PWA 구독자에게 푸시 알림을 보낸다. 실패해도 호출자(예: 일정
 * 생성 API)를 막지 않도록 에러는 여기서 삼킨다. 구독이 만료됐으면(410/404)
 * DB에서 정리한다.
 */
export async function sendPushToAll(payload: {
  title: string;
  body: string;
  url: string;
}) {
  const subs = await getAllPushSubscriptions();
  await sendTo(subs, payload);
}

/**
 * 특정 멤버(예: 비품 담당자)의 구독 기기에만 푸시 알림을 보낸다. 그 멤버가
 * 여러 기기로 구독해뒀으면 전부에게 간다.
 */
export async function sendPushToMember(
  memberId: number,
  payload: { title: string; body: string; url: string }
) {
  const subs = (await getAllPushSubscriptions()).filter((s) => s.memberId === memberId);
  await sendTo(subs, payload);
}
