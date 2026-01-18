/**
 * Kiro IDE Integration Service
 * Desktop App - Runs Kiro translator server internally
 * No npm package modifications required
 */

import { Command, Child } from '@tauri-apps/plugin-shell';
import { fetch } from '@tauri-apps/plugin-http';
import { homeDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, exists, copyFile } from '@tauri-apps/plugin-fs';

const KIRO_PORT = 9980;
const PROXY_PORT = 8080;

let kiroProcess: Child | null = null;

export interface KiroStatus {
  running: boolean;
  patched: boolean;
  port: number;
  installed: boolean;
}

export interface PatchResult {
  success: boolean;
  error?: string;
}

function getKiroServerCode(): string {
  return `
const http = require("http");
const url = require("url");
const KIRO_PORT = ${KIRO_PORT};
const PROXY_PORT = ${PROXY_PORT};

// CRC32 Calculator
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  CRC32_TABLE[i] = crc >>> 0;
}
function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// EventStream Encoder
function encodeStringHeader(name, value) {
  const nameBuffer = Buffer.from(name, "utf8");
  const valueBuffer = Buffer.from(value, "utf8");
  const header = Buffer.alloc(1 + nameBuffer.length + 1 + 2 + valueBuffer.length);
  let offset = 0;
  header.writeUInt8(nameBuffer.length, offset++);
  nameBuffer.copy(header, offset);
  offset += nameBuffer.length;
  header.writeUInt8(7, offset++);
  header.writeUInt16BE(valueBuffer.length, offset);
  offset += 2;
  valueBuffer.copy(header, offset);
  return header;
}

function encodeEventStreamMessage(eventType, payload) {
  const headers = [
    encodeStringHeader(":event-type", eventType),
    encodeStringHeader(":content-type", "application/json"),
    encodeStringHeader(":message-type", "event")
  ];
  const headersBuffer = Buffer.concat(headers);
  const payloadBuffer = Buffer.from(JSON.stringify(payload), "utf8");
  const totalLength = 12 + headersBuffer.length + payloadBuffer.length + 4;
  const message = Buffer.alloc(totalLength);
  let offset = 0;
  message.writeUInt32BE(totalLength, offset); offset += 4;
  message.writeUInt32BE(headersBuffer.length, offset); offset += 4;
  const preludeCrc = crc32(message.subarray(0, 8));
  message.writeUInt32BE(preludeCrc, offset); offset += 4;
  headersBuffer.copy(message, offset); offset += headersBuffer.length;
  payloadBuffer.copy(message, offset); offset += payloadBuffer.length;
  const messageCrc = crc32(message.subarray(0, offset));
  message.writeUInt32BE(messageCrc, offset);
  return message;
}

function createAssistantResponseEvent(content) {
  return encodeEventStreamMessage("assistantResponseEvent", { content });
}
function createMeteringEvent(usage) {
  return encodeEventStreamMessage("meteringEvent", { unit: "credit", unitPlural: "credits", usage });
}
function createContextUsageEvent(percentage) {
  return encodeEventStreamMessage("contextUsageEvent", { contextUsagePercentage: percentage });
}

// Minimal Model Mapping - only haiku replacement
const MODEL_MAP = {
  "claude-haiku": "gemini-3-flash",
  "simple-task": "gemini-3-flash"
};

function mapModelId(id) {
  return MODEL_MAP[id] || id || "claude-sonnet-4-5-thinking";
}

function kiroToAnthropic(req) {
  const cs = req?.conversationState || {};
  const cm = cs.currentMessage;
  const messages = [];
  for (const msg of (cs.history || [])) {
    if (msg.userInputMessage) messages.push({ role: "user", content: msg.userInputMessage.content });
    else if (msg.assistantResponseMessage?.content) messages.push({ role: "assistant", content: [{ type: "text", text: msg.assistantResponseMessage.content }] });
  }
  if (cm?.userInputMessage?.content) messages.push({ role: "user", content: [{ type: "text", text: cm.userInputMessage.content }] });
  return { model: mapModelId(cm?.userInputMessage?.modelId), messages, max_tokens: 8192, stream: true };
}

// Default fallback models if proxy unavailable
const FALLBACK_MODELS = ["claude-sonnet-4-5-thinking", "claude-sonnet-4-5", "gemini-3-pro-high", "gemini-3-flash"];

// Fetch models from proxy and filter
async function getFilteredModels() {
  try {
    const res = await new Promise((resolve, reject) => {
      http.get("http://localhost:" + PROXY_PORT + "/account-limits?format=json", (r) => {
        let data = "";
        r.on("data", (c) => { data += c; });
        r.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      }).on("error", () => resolve(null));
    });
    if (!res || !res.models) return FALLBACK_MODELS;
    // Filter: exclude image models and gemini-2.5 models
    return res.models.filter(m => !m.includes("image") && !m.startsWith("gemini-2.5"));
  } catch { return FALLBACK_MODELS; }
}

function buildModelResponse(modelIds) {
  const models = modelIds.map(id => ({
    modelId: id,
    modelName: id,
    description: id,
    rateMultiplier: 0.0,
    rateUnit: "credit",
    supportedInputTypes: ["TEXT"],
    tokenLimits: { maxInputTokens: 200000, maxOutputTokens: 8192 }
  }));
  return { defaultModel: { modelId: models[0]?.modelId || "claude-sonnet-4-5-thinking" }, models, nextToken: null };
}

const server = http.createServer(async (req, res) => {
  const path = new url.URL(req.url, "http://localhost:" + KIRO_PORT).pathname;
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.writeHead(200); return res.end(); }
  if (path === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ status: "ok" })); }
  if (path === "/ListAvailableModels") {
    const modelIds = await getFilteredModels();
    console.log("[Kiro] Models (" + modelIds.length + "):", modelIds.join(", "));
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(buildModelResponse(modelIds)));
  }
  if (path === "/getUsageLimits") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ chatCreditsUsed: 0, chatCreditsTotal: 999999 })); }
  if (path === "/generateAssistantResponse" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const anthropicReq = kiroToAnthropic(JSON.parse(body));
        console.log("[Kiro] Req:", anthropicReq.model);
        res.writeHead(200, { "Content-Type": "application/vnd.amazon.eventstream", "Transfer-Encoding": "chunked" });
        const proxyReq = http.request({ hostname: "localhost", port: PROXY_PORT, path: "/v1/messages", method: "POST", headers: { "Content-Type": "application/json" } }, (proxyRes) => {
          let buf = "", tc = 0;
          proxyRes.on("data", (c) => {
            buf += c.toString();
            const lines = buf.split("\\n");
            buf = lines.pop() || "";
            for (const ln of lines) {
              if (ln.startsWith("data: ")) {
                const d = ln.slice(6);
                if (d === "[DONE]") continue;
                try {
                  const ev = JSON.parse(d);
                  if (ev.type === "content_block_delta" && ev.delta?.text) { tc++; res.write(createAssistantResponseEvent(ev.delta.text)); }
                } catch (e) { console.error("[Kiro] Parse chunk error:", e.message); }
              }
            }
          });
          proxyRes.on("end", () => { console.log("[Kiro] Done. Chunks:", tc); res.write(createMeteringEvent(0.001)); res.write(createContextUsageEvent(0.5)); res.end(); });
        });
        proxyReq.on("error", (e) => { console.error("[Kiro] Proxy error:", e.message); res.end(); });
        proxyReq.write(JSON.stringify(anthropicReq));
        proxyReq.end();
      } catch (e) { console.error("[Kiro] Parse error:", e.message); res.writeHead(500); res.end(); }
    });
    return;
  }
  res.writeHead(404); res.end();
});
server.listen(KIRO_PORT, () => { console.log("[Kiro] Server running on port", KIRO_PORT); });
`;
}

async function getValidExtensionPath(): Promise<string | null> {
  const path = await getExtensionPath();
  if (!path) return null;
  return (await exists(path)) ? path : null;
}

function logError(context: string, error: unknown): void {
  console.error(`[Kiro ${context}]`, error instanceof Error ? error.message : String(error));
}

export async function startKiroServer(): Promise<{ success: boolean; error?: string }> {
  try {
    const currentStatus = await getKiroServerStatus();
    if (currentStatus.running) return { success: true };

    if (kiroProcess) {
      try { await kiroProcess.kill(); } catch (e) { logError('cleanup', e); }
      kiroProcess = null;
    }

    const serverCode = getKiroServerCode();
    const command = Command.create('node', ['-e', serverCode]);

    command.stdout.on('data', (line) => console.log('[Kiro Server]', line));
    command.stderr.on('data', (line) => console.error('[Kiro Server Error]', line));

    kiroProcess = await command.spawn();

    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const status = await getKiroServerStatus();
      if (status.running) return { success: true };
    }

    return { success: false, error: 'Server failed to start after 2.5s' };
  } catch (error) {
    logError('start', error);
    return { success: false, error: String(error) };
  }
}

export async function stopKiroServer(): Promise<void> {
  if (kiroProcess) {
    try {
      await kiroProcess.kill();
    } catch (e) {
      logError('stop', e);
    }
    kiroProcess = null;
  }
}

export async function getKiroServerStatus(): Promise<{ running: boolean }> {
  try {
    const response = await fetch(`http://localhost:${KIRO_PORT}/health`, {
      method: 'GET',
      connectTimeout: 2000
    });
    return { running: response.ok };
  } catch {
    return { running: false };
  }
}

export async function getKiroPath(): Promise<string | null> {
  try {
    const home = await homeDir();
    const isWindows = navigator.platform.toLowerCase().includes('win');
    const isMac = navigator.platform.toLowerCase().includes('mac');

    let possiblePaths: string[] = [];

    if (isWindows) {
      possiblePaths = [await join(home, 'AppData', 'Local', 'Programs', 'Kiro')];
    } else if (isMac) {
      possiblePaths = [
        '/Applications/Kiro.app',
        await join(home, 'Applications', 'Kiro.app')
      ];
    } else {
      // Linux
      possiblePaths = [
        await join(home, '.local', 'share', 'Kiro'),
        '/opt/Kiro',
        await join(home, 'snap', 'kiro', 'current')
      ];
    }

    for (const path of possiblePaths) {
      if (await exists(path)) return path;
    }
    return null;
  } catch (e) {
    logError('getKiroPath', e);
    return null;
  }
}

export async function getExtensionPath(): Promise<string | null> {
  const kiroPath = await getKiroPath();
  if (!kiroPath) return null;

  const isWindows = navigator.platform.toLowerCase().includes('win');
  const isMac = navigator.platform.toLowerCase().includes('mac');

  if (isWindows) {
    return await join(kiroPath, 'resources', 'app', 'extensions', 'kiro.kiro-agent', 'dist', 'extension.js');
  } else if (isMac) {
    return await join(kiroPath, 'Contents', 'Resources', 'app', 'extensions', 'kiro.kiro-agent', 'dist', 'extension.js');
  } else {
    // Linux
    return await join(kiroPath, 'resources', 'app', 'extensions', 'kiro.kiro-agent', 'dist', 'extension.js');
  }
}

export async function isKiroInstalled(): Promise<boolean> {
  return (await getKiroPath()) !== null;
}

export async function isKiroPatched(): Promise<boolean> {
  try {
    const extensionPath = await getValidExtensionPath();
    if (!extensionPath) return false;
    const content = await readTextFile(extensionPath);
    return content.includes(`localhost:${KIRO_PORT}`) && !content.includes('https://q.us-east-1.amazonaws.com');
  } catch (e) {
    logError('isKiroPatched', e);
    return false;
  }
}

export async function patchKiro(): Promise<PatchResult> {
  try {
    const extensionPath = await getValidExtensionPath();
    if (!extensionPath) {
      return { success: false, error: 'Kiro extension not found' };
    }

    const backupPath = extensionPath + '.backup';
    if (!(await exists(backupPath))) {
      await copyFile(extensionPath, backupPath);
    }

    let content = await readTextFile(extensionPath);
    const patterns = [
      { find: /endpoint:\s*"https:\/\/q\.[a-z0-9-]+\.amazonaws\.com"/g, replace: `endpoint: "http://localhost:${KIRO_PORT}"` },
      { find: /https:\/\/q\.[a-z0-9-]+\.amazonaws\.com/g, replace: `http://localhost:${KIRO_PORT}` }
    ];

    let patched = false;
    for (const pattern of patterns) {
      if (pattern.find.test(content)) {
        pattern.find.lastIndex = 0;
        content = content.replace(pattern.find, pattern.replace);
        patched = true;
      }
    }

    if (!patched && await isKiroPatched()) return { success: true };
    if (!patched) return { success: false, error: 'No patchable patterns found' };

    await writeTextFile(extensionPath, content);
    return { success: true };
  } catch (error) {
    logError('patchKiro', error);
    return { success: false, error: String(error) };
  }
}

export async function restoreKiro(): Promise<PatchResult> {
  try {
    const extensionPath = await getExtensionPath();
    if (!extensionPath) {
      return { success: false, error: 'Kiro extension not found' };
    }

    const backupPath = extensionPath + '.backup';
    if (!(await exists(backupPath))) {
      return { success: false, error: 'No backup found' };
    }

    const backupContent = await readTextFile(backupPath);
    await writeTextFile(extensionPath, backupContent);
    return { success: true };
  } catch (error) {
    logError('restoreKiro', error);
    return { success: false, error: String(error) };
  }
}

export async function getKiroStatus(): Promise<KiroStatus> {
  const [installed, serverStatus] = await Promise.all([isKiroInstalled(), getKiroServerStatus()]);
  const patched = installed ? await isKiroPatched() : false;

  return {
    running: serverStatus.running,
    patched,
    port: KIRO_PORT,
    installed
  };
}
