import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAllowedOrigins, allowApiRequest } from '../http-origin.mjs';

const allow = parseAllowedOrigins('https://example.github.io, http://127.0.0.1:9418');

test('backend accepts only configured browser origins and sets the preflight headers', () => {
  function request(origin, method = 'OPTIONS') {
    const headers = {};
    const incoming = { method, headers: { origin, host:'backend.example', 'access-control-request-method':'POST' } };
    const accepted = allowApiRequest(incoming, { setHeader:(name,value) => { headers[name]=value; } }, allow, true, '/api/consult');
    return { accepted, headers };
  }
  assert.equal(request('https://example.github.io').accepted,true);
  assert.equal(request('https://example.github.io').headers['Access-Control-Allow-Origin'],'https://example.github.io');
  assert.equal(request('https://example.github.io').headers['Access-Control-Allow-Headers'],'Content-Type');
  assert.equal(request('https://example.github.io.attacker.invalid').accepted,false);
  assert.equal(request('null').accepted,false);
  assert.equal(request(undefined,'POST').accepted,false);
  assert.throws(() => parseAllowedOrigins('*'));
  assert.throws(() => parseAllowedOrigins('https://example.github.io/tarot-reading'));
});

test('loopback mode maintains existing same-origin and curl behavior', () => {
  const res = { setHeader:() => {} };
  const base = { method:'POST', headers:{ host:'127.0.0.1:4318' } };
  assert.equal(allowApiRequest(base,res,new Set(),false,'/api/consult'),true);
  assert.equal(allowApiRequest({
    ...base, headers:{ ...base.headers, origin:'http://127.0.0.1:4318' },
  },res,new Set(),false,'/api/consult'),true);
});
