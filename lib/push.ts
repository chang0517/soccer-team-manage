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
  if (!ensureConfigured()) return;
  const subs = await getAllPushSubscriptions();
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
