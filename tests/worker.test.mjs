import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';

const origin = 'https://spence-chen-jie.github.io';
const model = '@cf/qwen/qwen3.8-27b';
const base = 'https://example.workers.dev';
const construct = (path,method='GET',payload,source=origin) => new Request(base+path,{
  method,headers:{ Origin:source,'Content-Type':'application/json','Access-Control-Request-Method':'POST' },
  body:payload === undefined ? undefined : JSON.stringify(payload),
});

test('Worker handles HTTPS model status and only the configured Pages origin',async()=>{
  const env = { TAROT_ALLOWED_ORIGINS:origin, AI:{run(){}}, TAROT_WORKER_MODEL:model };
  const preflight = await worker.fetch(construct('/api/consult','OPTIONS'),env);
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
  const denied = await worker.fetch(construct('/api/consult','POST',{kind:'clarify',question:'我想问工作'},'https://unrelated.invalid'),env);
  assert.equal(denied.status,403);
  const status = await worker.fetch(construct('/api/status'),env);
  assert.deepEqual(await status.json(),{mode:'model',provider:'server',model});
});

test('Worker respects the existing spread contract and passes a real schema to the model binding',async()=>{
  const payload = {kind:'reading',question:'我该怎么开始？',spread:'single',entries:[
    { position:'眼前的重点',purpose:'核心主题',card:'愚人',orientation:'正位',meaning:'起步与尝试' },
  ]};
  const env = { TAROT_ALLOWED_ORIGINS:origin,TAROT_WORKER_MODEL:model,AI:{
    async run(id,options){
      assert.equal(id,model);
      assert.equal(options.store,false);
      assert.equal(options.chat_template_kwargs.enable_thinking,false);
      assert.equal(options.response_format.json_schema.schema.properties.details.minItems,1);
      const [system] = options.messages;
      assert.equal(system.role,'system');
      assert.match(system.content,/月汐塔罗.*线上塔罗师/);
      assert.match(system.content,/第一人称/);
      assert.match(options.messages[1].content,/愚人/);
      return { choices:[{message:{content:'{"overview":"愚人关注起步","details":["尝试"],"next":"先做一次小尝试"}'}}] };
    },
  }};
  const response = await worker.fetch(construct('/api/consult','POST',payload),env);
  assert.equal(response.status,200);
  const result = await response.json();
  assert.equal(result.details.length,1);
  assert.equal(result.model,model);
});

test('Worker focuses supplemental queries on the actual drawn card',async()=>{
  const card = {position:'补牌 1',purpose:'如何打开沟通',card:'节制',orientation:'逆位',meaning:'放慢节奏'};
  const payload = {kind:'followup',question:'我想问感情',followup:'补牌看看怎么开口',supplemental:card,entries:[
    { position:'眼前的重点',purpose:'核心主题',card:'愚人',orientation:'正位',meaning:'起步' },
  ]};
  const env={ TAROT_ALLOWED_ORIGINS:origin, AI:{ async run(_model,options){
    const context = JSON.parse(options.messages[1].content);
    assert.equal(context.targetCard.card,'节制');
    assert.equal(context.question,'我想问感情');
    assert.equal(context.focusQuestion,'如何打开沟通');
    assert.ok(!Object.hasOwn(context,'entries'));
    return { response:{ text:'节制提示，先问对方现在是否适合聊几句。' } };
  } }};
  const response=await worker.fetch(construct('/api/consult','POST',payload),env);
  assert.equal(response.status,200);
  assert.match((await response.json()).text,/节制/);
});

test('A focused follow-up passes the latest question, past context and just the named card',async()=>{
  const entries = [
    { position:'现状',purpose:'核心主题',card:'愚人',orientation:'正位',meaning:'起步' },
    { position:'阻碍',purpose:'当前顾虑',card:'月亮',orientation:'逆位',meaning:'厘清猜测' },
    { position:'建议',purpose:'可做的事',card:'节制',orientation:'正位',meaning:'分配时间' },
  ];
  const previous = [{question:'我每晚只有十五分钟',answer:'可以先做一次短练习。'}];
  const context = {overview:'这次看面试准备',next:'试着每晚练一个问题'};
  const payload = {kind:'followup',question:'我怎么准备下周的面试？',followup:'第 3 张牌说的第一步具体怎么做？',entries,previous,context};
  const env={ TAROT_ALLOWED_ORIGINS:origin, AI:{ async run(_model,options){
    const data = JSON.parse(options.messages[1].content);
    assert.equal(data.targetCard.card,'节制');
    assert.equal(data.focusQuestion,payload.followup);
    assert.equal(data.question,payload.question);
    assert.equal(data.latestUserQuestion,previous[0].question);
    assert.deepEqual(data.previous,previous);
    assert.deepEqual(data.initialReading,context);
    assert.ok(!Object.hasOwn(data,'entries'));
    assert.match(options.messages[0].content,/时间或预算.*明确写出/);
    return {response:{text:'建议位的节制提示，今晚用十五分钟演练一个问题。'}};
  } } };
  const response=await worker.fetch(construct('/api/consult','POST',payload),env);
  assert.equal(response.status,200);
});
