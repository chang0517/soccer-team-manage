import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, ".."); // raven-fc/
const CACHE_FILE = path.join(__dirname, ".last-ngrok-url");
const NGROK_API = "http://127.0.0.1:4040/api/tunnels";
const GATEWAY_PORT = process.env.GATEWAY_PORT || "11435";
const VERCEL_BIN = process.env.VERCEL_BIN || "vercel";

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function readCachedUrl() {
  try {
    return fs.readFileSync(CACHE_FILE, "utf8").trim();
  } catch {
    return null;
  }
}

function writeCachedUrl(url) {
  fs.writeFileSync(CACHE_FILE, url);
}

async function getNgrokPublicUrl() {
  const res = await fetch(NGROK_API);
  const data = await res.json();
  const tunnel = (data.tunnels || []).find((t) => t.proto === "https");
  return tunnel?.public_url ?? null;
}

async function syncVercelEnv(url) {
  log(`URL 변경 감지 → Vercel 환경변수 갱신: ${url}`);
  try {
    await execFileP(VERCEL_BIN, ["env", "rm", "OLLAMA_GATEWAY_URL", "production", "--yes"], {
      cwd: PROJECT_DIR,
    });
  } catch {
    // 기존 값이 없으면 실패하는 게 정상이라 무시한다.
  }
  await new Promise((resolve, reject) => {
    const child = spawn(VERCEL_BIN, ["env", "add", "OLLAMA_GATEWAY_URL", "production"], {
      cwd: PROJECT_DIR,
    });
    child.stdin.write(url);
    child.stdin.end();
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`env add exit ${code}`))));
  });
  log("Vercel 재배포 시작…");
  await execFileP(VERCEL_BIN, ["deploy", "--prod", "--yes"], { cwd: PROJECT_DIR });
  log("Vercel 재배포 완료");
  writeCachedUrl(url);
}

async function pollAndSync() {
  try {
    const url = await getNgrokPublicUrl();
    if (!url) return;
    const cached = readCachedUrl();
    if (url !== cached) {
      await syncVercelEnv(url);
    }
  } catch (e) {
    log(`동기화 확인 중 오류: ${e}`);
  }
}

log("ngrok 실행…");
const ngrok = spawn(
  "ngrok",
  ["http", GATEWAY_PORT, "--log=stdout"],
  { stdio: ["ignore", "pipe", "pipe"] }
);
ngrok.stdout.on("data", (d) => process.stdout.write(`[ngrok] ${d}`));
ngrok.stderr.on("data", (d) => process.stderr.write(`[ngrok] ${d}`));
ngrok.on("exit", (code) => {
  log(`ngrok 종료됨 (code ${code}) — launchd가 전체 프로세스를 재시작할 거예요.`);
  process.exit(1);
});

// ngrok이 뜨는 데 시간이 걸리니 초반엔 짧은 간격으로, 이후엔 여유 있게 확인한다.
setTimeout(pollAndSync, 5000);
setInterval(pollAndSync, 60000);
