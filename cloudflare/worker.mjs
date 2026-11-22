import { allowApiRequest, parseAllowedOrigins } from '../http-origin.mjs';
import { inputsOf, extractOutput, offlineFormat, modelMessages } from '../tarot-api.mjs';

const defaultModel = '@cf/qwen/qwen3.8-27b';
const bodyLimit = 32_000;

async function requestData(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > bodyLimit) {
      await reader.cancel();
      throw Object.assign(new Error('Request too large'),{ status:413 });
    }
    text += decoder.decode(value,{stream:true});
  }
  return JSON.parse(text + decoder.decode());
}

function resultOf(result,inputs) {
  const data = result?.choices?.[0]?.message?.content ?? result?.response;
  if (typeof data !== 'string') return extractOutput(data,inputs);
  const clean = data.trim().replace(/^<think>[\s\S]*?<\/think>\s*/i,'')
    .replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  return extractOutput(JSON.parse(clean),inputs);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const headers = new Headers({ 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff' });
    const json = (body,status=200) => Response.json(body,{status,headers});
    if (path === '/' && request.method === 'GET') return json({service:'moon-tide-tarot'});
    if (path !== '/api/status' && path !== '/api/consult') return json({error:'页面未找到'},404);
    const incoming = { method:request.method, headers:Object.fromEntries(request.headers) };
    if (!allowApiRequest(incoming,{setHeader:(name,value)=>headers.set(name,value)},parseAllowedOrigins(env.TAROT_ALLOWED_ORIGINS),true,path)) {
      return json({error:'请求来源无效'},403);
    }
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
    const model = env.TAROT_WORKER_MODEL || defaultModel;
    if (path === '/api/status' && request.method === 'GET') {
      return json({mode:env.AI ? 'model':'unavailable',provider:'server',model:env.AI ? model : null},env.AI ? 200:503);
    }
    if (path !== '/api/consult' || request.method !== 'POST') return json({error:'请求方式无效'},405);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) {
      return json({error:'读牌接口接受 JSON 请求'},415);
    }
    if (!env.AI) return json({error:'模型暂时不可用'},503);
    let inputs;
    try { inputs = inputsOf(await requestData(request)); }
    catch (error) { return json({error:'请求数据无效'},error.status ?? 400); }
    if (!inputs) return json({error:'读牌资料无效'},400);

    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    if (env.TAROT_LIMIT && !(await env.TAROT_LIMIT.limit({key:ip})).success) {
      return json({error:'读牌请求过于频繁，请稍等再试'},429);
    }

    try {
      const raw = await env.AI.run(model,{
        messages:modelMessages(inputs,true),
        response_format:offlineFormat(inputs),
        chat_template_kwargs:{enable_thinking:false},
        max_completion_tokens:inputs.kind === 'reading' ? 1450 : 350,
        temperature:.35,
        store:false,
      });
      const result = resultOf(raw,inputs);
      if (result) return json({...result,model});
    } catch { /* Keep model responses and visitor inputs out of operational logs. */ }
    return json({error:'模型暂时不可用'},502);
  },
};
