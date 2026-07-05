import http from "node:http";

const PORT = Number(process.env.GATEWAY_PORT || 11435);
const SECRET = process.env.GATEWAY_SECRET;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";

if (!SECRET) {
  console.error("GATEWAY_SECRET 환경변수가 필요해요.");
  process.exit(1);
}

// Raven FC 서버(Vercel)가 이 게이트웨이를 거쳐 로컬 Ollama를 호출한다.
// Authorization: Bearer <SECRET> 헤더가 없거나 틀리면 그대로 거부한다.
const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} from ${req.socket.remoteAddress}`);
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

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const upstream = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`ollama gateway listening on 127.0.0.1:${PORT} -> ${OLLAMA_URL}`);
});
