import assert from 'node:assert/strict';
import { backendOrigin } from './pages-config.mjs';

const backend = backendOrigin();
const origin = new URL(process.env.TAROT_FRONTEND_ORIGIN).origin;
const headers = { Origin:origin };
const status = await fetch(backend + '/api/status',{headers,signal:AbortSignal.timeout(25_000)});
assert.ok(status.ok,'后端状态接口 HTTP ' + status.status);
assert.equal(status.headers.get('Access-Control-Allow-Origin'),origin);
assert.equal((await status.json()).mode,'model','后端需要启用模型');
const preflight = await fetch(backend + '/api/consult',{
  method:'OPTIONS',headers:{ ...headers,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type' },
  signal:AbortSignal.timeout(12_000),
});
assert.equal(preflight.status,204);
assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
assert.match(preflight.headers.get('Access-Control-Allow-Headers') ?? '',/\bcontent-type\b/i);
const reading = await fetch(backend + '/api/consult',{
  method:'POST',headers:{ ...headers,'Content-Type':'application/json' },
  body:JSON.stringify({kind:'clarify',question:'我想问工作'}),
  signal:AbortSignal.timeout(95_000),
});
assert.ok(reading.ok,'模型问询接口 HTTP ' + reading.status);
assert.equal(reading.headers.get('Access-Control-Allow-Origin'),origin);
assert.ok((await reading.json()).text?.trim(),'模型没有返回澄清问题');
console.log('独立后端的模型调用和 Pages 跨域检查通过。');
