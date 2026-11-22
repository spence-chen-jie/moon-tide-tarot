import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { inputsOf, extractOutput, offlineFormat, modelMessages } from './tarot-api.mjs';
import { allowApiRequest, parseAllowedOrigins } from './http-origin.mjs';

const root = new URL('./public/', import.meta.url);
const port = Number(process.env.TAROT_PORT || '4318');
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('TAROT_PORT 必须是 1–65535 的整数');
const backendOnly = process.env.TAROT_BACKEND_ONLY === '1';
const listenHost = process.env.TAROT_LISTEN_HOST || (backendOnly ? '0.0.0.0' : '127.0.0.1');
const allowedOrigins = parseAllowedOrigins(process.env.TAROT_ALLOWED_ORIGINS);
if (backendOnly && !allowedOrigins.size) throw new Error('独立后端需要配置 TAROT_ALLOWED_ORIGINS');

const configuredModel = process.env.TAROT_MODEL?.trim();
const apiKey = process.env.TAROT_API_KEY?.trim();
const configuredUrl = process.env.TAROT_MODEL_URL?.trim()
  || (apiKey ? 'https://api.openai.com/v1/chat/completions' : '');
const executable = new URL('./.runtime/llama/llama-server.exe', import.meta.url);
const modelFile = new URL('./.runtime/qwen2.5-1.5b-instruct-q4_k_m.gguf', import.meta.url);
const offlinePort = 14318;
const bundled = process.platform === 'win32' && !configuredUrl && !configuredModel
  && existsSync(executable) && existsSync(modelFile);
const model = bundled ? 'qwen-local' : configuredModel;
const modelUrl = bundled ? 'http://127.0.0.1:' + offlinePort + '/v1/chat/completions' : configuredUrl;
const modelEnabled = process.env.TAROT_FORCE_LOCAL !== '1' && Boolean(model && modelUrl);
if (backendOnly && !modelEnabled) throw new Error('独立后端需要可用的模型配置');
const structuredOutput = bundled || process.env.TAROT_STRUCTURED_OUTPUT === '1';
let activeRequests = 0;
let offlineProcess;
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.js': 'text/javascript; charset=utf-8',
};

function json(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(data));
}

async function getBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 32_000) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function consult(request, response) {
  if (!modelEnabled) return json(response, 503, { error: '模型解读未配置' });
  if (backendOnly && !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    return json(response, 415, { error: '读牌接口接受 JSON 请求' });
  }
  let inputs;
  try { inputs = inputsOf(await getBody(request)); }
  catch (error) { return json(response, error.status ?? 400, { error: '请求数据无效' }); }
  if (!inputs) return json(response, 400, { error: '读牌资料无效' });
  if (backendOnly && activeRequests >= 2) return json(response, 429, { error: '模型正在读牌，请稍后再试' });
  activeRequests++;
  try {
    const result = await fetch(modelUrl, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(backendOnly ? 90_000 : bundled ? 60_000 : 25_000),
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}) },
      body: JSON.stringify({
        model, ...(structuredOutput ? { response_format: offlineFormat(inputs), temperature: 0.35, max_tokens: inputs.kind === 'reading' ? 1450 : 350 } : {}),
        messages: modelMessages(inputs, structuredOutput),
      }),
    });
    if (!result.ok) throw new Error('Model service unavailable');
    const data = await result.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Empty model reply');
    const clean = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const output = extractOutput(JSON.parse(clean), inputs);
    if (!output) throw new Error('Invalid model reply');
    json(response, 200, output);
  } catch {
    json(response, 502, { error: '模型暂时不可用' });
  } finally {
    activeRequests--;
  }
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader('Referrer-Policy', 'no-referrer');
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/api/status' || pathname === '/api/consult') {
    if (!allowApiRequest(request,response,allowedOrigins,backendOnly,pathname)) {
      return json(response,403,{ error:'请求来源无效' });
    }
    if (request.method === 'OPTIONS') { response.writeHead(204); return response.end(); }
  }
  if (pathname === '/api/status' && request.method === 'GET') {
    return json(response,200,{ mode:modelEnabled ? 'model' : 'local', provider:backendOnly ? 'server' : modelEnabled && bundled ? 'device' : null });
  }
  if (pathname === '/api/consult' && request.method === 'POST') return consult(request, response);
  if (!['GET','HEAD'].includes(request.method)) return json(response, 405, { error: '请求方式无效' });
  if (backendOnly) return json(response,pathname === '/' ? 200 : 404,
    pathname === '/' ? { service:'moon-tide-tarot' } : { error:'页面未找到' });
  const filename = pathname === '/' ? 'index.html' : pathname.slice(1);
  const type = contentTypes[extname(filename)];
  if (!type || !/^(?:index\.html|[a-z-]+\.(?:mjs|css|webp)|cards\/[a-z][0-9]{2}\.jpg|vendor\/(?:three\.(?:module|core)\.min|RoundedBoxGeometry)\.js)$/.test(filename)) return json(response, 404, { error: '页面未找到' });
  try {
    const data = await readFile(new URL(filename, root));
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    json(response, 404, { error: '文件未找到' });
  }
});

server.listen({ host: listenHost, port }, () => {
  const url = 'http://127.0.0.1:' + port + '/';
  if (modelEnabled && bundled) {
    offlineProcess = spawn(fileURLToPath(executable), [
      '-m', fileURLToPath(modelFile), '--alias', model, '--host', '127.0.0.1', '--port', String(offlinePort),
      '-c', '6144', '-np', '1', '--no-webui', '--log-disable',
    ], { cwd: fileURLToPath(new URL('./.runtime/llama/', import.meta.url)), windowsHide: true, stdio: 'ignore' });
    offlineProcess.on('error', () => console.log('本机模型启动失败，网页可以继续使用内置牌义。'));
    offlineProcess.on('exit', code => { if (code) console.log('本机模型已退出，网页可以继续使用内置牌义。'); });
  }
  console.log('月汐塔罗  ' + url + '  [' + (modelEnabled ? '模型解读' : '本地牌义解读') + ']');
  if (process.argv.includes('--open') && process.platform === 'win32') {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], () => {});
  }
});

process.on('exit', () => offlineProcess?.kill());
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    offlineProcess?.kill();
    server.close();
  });
}
