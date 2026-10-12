import http from "node:http";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);
loadDotEnv(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "127.0.0.1";
const MAX_BODY_BYTES = 32 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".srt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, {
        ok: true,
        llmConfigured: hasLLMConfig(),
        mode: hasLLMConfig() ? "local + LLM enhancement" : "local only",
      });
    }

    if (request.method === "POST" && url.pathname === "/api/interpret") {
      return handleInterpret(request, response);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendJson(response, 405, { error: "Method not allowed" });
    }

    return serveStatic(url.pathname, request.method === "HEAD", response);
  } catch (error) {
    console.error("Request failed:", error);
    return sendJson(response, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\nAI驾校已启动： http://localhost:${PORT}`);
  console.log(`本地指令解析：已启用`);
  console.log(`大模型增强：${hasLLMConfig() ? "已配置" : "未配置（可正常游玩）"}\n`);
});

async function handleInterpret(request, response) {
  if (!hasLLMConfig()) {
    return sendJson(response, 503, {
      error: "LLM enhancement is not configured",
      hint: "Set LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL in .env",
    });
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(request));
  } catch (error) {
    return sendJson(response, 400, { error: "Invalid JSON body" });
  }

  const text = String(payload?.text || "").trim().slice(0, 160);
  if (!text) return sendJson(response, 400, { error: "Missing command text" });

  const state = {
    gear: ["P", "R", "D"].includes(payload?.state?.gear) ? payload.state.gear : "P",
    steeringDegrees: clampNumber(payload?.state?.steeringDegrees, -32, 32, 0),
    moving: Boolean(payload?.state?.moving),
  };

  try {
    const result = await callCompatibleLLM(text, state);
    return sendJson(response, 200, normalizeModelOutput(result));
  } catch (error) {
    console.error("LLM interpretation failed:", error.message);
    return sendJson(response, 502, {
      error: "LLM interpretation failed",
      detail: error.message,
    });
  }
}

async function callCompatibleLLM(text, state) {
  const baseUrl = process.env.LLM_BASE_URL.replace(/\/$/, "");
  const endpoint = `${baseUrl}/chat/completions`;
  const systemPrompt = `你是浏览器小游戏《AI驾校》的驾驶口令解析器。玩家只能用中文自然语言指挥一个虚构角色完成低速倒车入库。\n\n请只返回一个 JSON 对象，不要使用 Markdown。字段必须是：\n{\n  "understood": boolean,\n  "gear": "R" | "D" | "P" | null,\n  "steering": "left_full" | "left_slight" | "center" | "right_slight" | "right_full" | null,\n  "speed": "slow" | "normal" | "fast" | null,\n  "stop": boolean,\n  "move": boolean,\n  "summary": string[],\n  "reply": string\n}\n\n规则：\n1. “停车、刹车、别动”等必须 stop=true，不得误解。\n2. 支持组合指令，例如“挂倒挡，左打死，慢慢倒”。\n3. 没有明确动作时 understood=false，其他动作字段为 null/false。\n4. reply 是 AI 学员的一句简短、略带吐槽但不冒犯的中文回应，最多 35 字。笑点来自 AI 的过度自信和沟通误差，不涉及性别或群体刻板印象。\n5. 这是游戏控制，不要输出真实道路驾驶建议。`;

  const llmResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL,
      temperature: 0.25,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({ command: text, currentState: state }),
        },
      ],
    }),
    signal: AbortSignal.timeout(6500),
  });

  const raw = await llmResponse.text();
  if (!llmResponse.ok) {
    throw new Error(`Provider returned ${llmResponse.status}: ${raw.slice(0, 240)}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Provider response was not valid JSON");
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Provider response did not contain message content");
  return parseJsonObject(content);
}

function normalizeModelOutput(input) {
  const steeringValues = new Set(["left_full", "left_slight", "center", "right_slight", "right_full", null]);
  const speedValues = new Set(["slow", "normal", "fast", null]);
  const gearValues = new Set(["R", "D", "P", null]);

  const output = {
    understood: Boolean(input?.understood),
    gear: gearValues.has(input?.gear ?? null) ? (input.gear ?? null) : null,
    steering: steeringValues.has(input?.steering ?? null) ? (input.steering ?? null) : null,
    speed: speedValues.has(input?.speed ?? null) ? (input.speed ?? null) : null,
    stop: Boolean(input?.stop),
    move: Boolean(input?.move),
    summary: Array.isArray(input?.summary) ? input.summary.slice(0, 5).map((item) => String(item).slice(0, 20)) : [],
    reply: typeof input?.reply === "string" ? input.reply.slice(0, 80) : "收到。",
  };

  if (output.stop) output.move = false;
  if (!output.understood) {
    output.gear = null;
    output.steering = null;
    output.speed = null;
    output.stop = false;
    output.move = false;
  }
  return output;
}

async function serveStatic(requestPath, headOnly, response) {
  const decoded = decodeURIComponent(requestPath);
  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, relativePath);

  if (!filePath.startsWith(`${ROOT}${path.sep}`) && filePath !== ROOT) {
    return sendJson(response, 403, { error: "Forbidden" });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": info.size,
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    if (headOnly) return response.end();
    response.end(await readFile(filePath));
  } catch {
    sendJson(response, 404, { error: "File not found" });
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function parseJsonObject(text) {
  const cleaned = String(text)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Model did not return a JSON object");
  }
}

function hasLLMConfig() {
  return Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
