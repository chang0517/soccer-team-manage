import http from "node:http";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SMS_SCRIPT = path.join(__dirname, "..", "fine-notices", "send-imessage.applescript");

const PORT = Number(process.env.GATEWAY_PORT || 11435);
const SECRET = process.env.GATEWAY_SECRET;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";

if (!SECRET) {
  console.error("GATEWAY_SECRET 환경변수가 필요해요.");
  process.exit(1);
}

// 010-1234-5678, 01012345678 등을 +8210... 형식으로 정규화.
// (fine-notices/send-fine-notices.mjs의 normalizePhone과 동일한 로직)
function normalizePhone(raw) {
  const digits = String(raw).replace(/[^0-9]/g, "");
  if (digits.startsWith("82")) return `+${digits}`;
  if (digits.startsWith("0")) return `+82${digits.slice(1)}`;
  return `+${digits}`;
}

function sendSms(phone, message) {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      [SMS_SCRIPT, normalizePhone(phone), message],
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      }
    );
  });
}

async function handleSmsSend(body, res) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid json" }));
    return;
  }
  const phone = String(payload?.phone ?? "").trim();
  const message = String(payload?.message ?? "").trim();
  if (!phone || !message) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "phone and message are required" }));
    return;
  }
  try {
    await sendSms(phone, message);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}

function handleOllamaProxy(body, res) {
  fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
    .then(async (upstream) => {
      const text = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(text);
    })
    .catch((e) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    });
}

// Raven FC 서버(Vercel)가 이 게이트웨이를 거쳐 로컬 Ollama를 호출하거나
// 이 맥미니의 Messages.app으로 SMS를 보낸다.
// Authorization: Bearer <SECRET> 헤더가 없거나 틀리면 그대로 거부한다.
const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);
  if (req.method !== "POST") {
    res.writeHead(405).end("method not allowed");
    return;
  }
  const auth = req.headers["authorization"];
  if (auth !== `Bearer ${SECRET}`) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  const isSmsSend = new URL(req.url, "http://localhost").pathname === "/sms/send";

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (isSmsSend) handleSmsSend(body, res);
    else handleOllamaProxy(body, res);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`gateway listening on 127.0.0.1:${PORT} -> ${OLLAMA_URL} (+ /sms/send)`);
});
