import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { cards, spreads, classify, deal, choose, composeReading, answerFollowup, conversationalReply, focusedEntry, formatReport, drawSupplement, supplementRequest } from '../public/reading.mjs';
import { cardPositions, tableState } from '../public/table-layout.mjs';

test('78 unique cards and fully defined skill spreads', () => {
  assert.equal(cards.length, 78);
  assert.equal(new Set(cards.map(card => card.id)).size, 78);
  for (const card of cards) {
    assert.ok(card.name && card.upright && card.reversed);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(spreads).map(([id, spread]) => [id,spread.positions.length])),
    { single:1, daily:3, three:3, timeline:3, choice:5, celtic:10 });
});

test('the local artwork includes every card in the deck', async () => {
  const filenames = await readdir(new URL('../public/cards/', import.meta.url));
  assert.deepEqual(filenames.filter(name => name.endsWith('.jpg')).sort(), cards.map(card => card.id + '.jpg').sort());
});

test('specific and broad questions are differentiated', () => {
  assert.equal(classify('感情').needsClarification, true);
  assert.equal(classify('我想知道要不要主动联系前任').topic, 'love');
  assert.equal(classify('在现公司内部转岗还是出去找工作？').topic, 'decision');
  assert.equal(classify('接下来这份工作应该怎么推进？').needsClarification, false);
  assert.deepEqual(classify('看看日运').suggested, 'single');
  assert.equal(classify('帮我抽三张塔罗牌看看今天运势').suggested, 'daily');
  assert.equal(classify('3张看日运').needsClarification, false);
  assert.equal(classify('帮我抽一张牌看看今天的整体运势').suggested, 'single');
  assert.equal(classify('抽三张牌看明天面试的运势').suggested, 'three');
  assert.equal(classify('随手抽一张').needsClarification, false);
  assert.equal(classify('要留在现在的岗位还是接受新公司的邀请？').suggested, 'choice');
  assert.equal(classify('我想看这段关系过去到现在怎么演变').suggested, 'timeline');
});

test('3D layout covers each spread and preserves original draw positions across pages', () => {
  const pile = deal(false);
  const selected = [{...pile[72],reversed:true}];
  const stage = { stage:'pick', pile, selected, flipped:[0], spread:'celtic', deckPage:8 };
  const view = tableState(stage, 'pick');
  assert.equal(view.deck[0].index, 72);
  assert.equal(view.deck.at(-1).index, 77);
  assert.equal(view.selected[0].id, pile[72].id);
  assert.equal(view.selected[0].flipped, true);
  assert.equal(view.selected[0].reversed, true);
  assert.equal(view.positions[9], spreads.celtic.positions[9][0]);
  for (const [id, spread] of Object.entries(spreads)) {
    for (const compact of [true,false]) {
      const fits = cardPositions(id, compact);
      assert.equal(fits.length, spread.positions.length);
      assert.equal(new Set(fits.map(point=>point.x + ',' + point.z)).size, fits.length);
    }
  }
});

test('cut retains all cards; repeated selection cannot duplicate one', () => {
  const pile = deal(false);
  assert.equal(new Set(pile.map(card => card.id)).size, 78);
  assert.equal(pile.some(card => card.reversed), false);
  const first = choose(pile, [], 0, 3);
  assert.equal(choose(pile, first, 0, 3), first);
  const full = [0, 1, 2].reduce((selected, index) => choose(pile, selected, index, 3), []);
  assert.equal(full.length, 3);
  assert.equal(choose(pile, full, 3, 3), full);
});

test('reading, follow-up and report retain revealed cards and positions', () => {
  const session = { question: '我要主动联系前任吗？', spread: 'three', selected: deal(true).slice(0, 3), replies: [] };
  session.reading = composeReading(session);
  const reply = answerFollowup(session, '第二张牌是什么意思？');
  assert.ok(reply.includes(session.reading.entries[1].card));
  assert.ok(reply.includes(session.reading.entries[1].position));
  const report = formatReport(session);
  assert.ok(report.indexOf('抽到的牌') < report.indexOf('牌面解读'));
  assert.ok(report.indexOf('牌面解读') < report.indexOf('整体总结'));
  assert.ok(report.indexOf('整体总结') < report.indexOf('可以怎么做'));
  assert.match(report,/第一张｜现状/);
  for (const entry of session.reading.entries) {
    assert.ok(report.includes(entry.card));
    assert.ok(report.includes(entry.position));
  }
  assert.ok(report.includes(session.question));
});

test('explicit supplemental cards use the remaining deck and preserve the original spread', () => {
  const pile = deal(false);
  const session = { pile, selected:pile.slice(0,3), supplements:[], spread:'three', question:'怎么整理下一步？', replies:[] };
  assert.equal(supplementRequest('补一张牌'), '');
  assert.equal(supplementRequest('能不能补一张牌，看我需要先确认什么？'), '看我需要先确认什么？');
  assert.equal(supplementRequest('我不想补牌'), null);
  assert.equal(supplementRequest('补牌是什么意思？'), null);
  const first = drawSupplement(session,'我需要先确认什么？');
  assert.equal(first.id,pile[3].id);
  assert.equal(first.orientation,'正位');
  session.supplements.push(first);
  assert.equal(drawSupplement(session,'还有什么影响？').id,pile[4].id);
  session.reading = composeReading(session);
  assert.equal(session.reading.entries.length,3);
  assert.match(formatReport(session), /补牌 1/);
});

test('follow-up fallback responds to the new message without replaying the original reading',()=>{
  const session = { question:'我想弄清这段关系目前的状态。',spread:'choice',selected:deal(false).slice(0,5),replies:[] };
  session.reading = composeReading(session);
  const reply = answerFollowup(session,'她主动来找我复合吗？');
  assert.match(reply,/复合/);
  assert.ok(!reply.includes(session.question));
  assert.ok(!reply.includes(session.reading.entries.at(-1).card));
  assert.ok(!reply.includes(session.reading.next));
  assert.match(answerFollowup(session,'我已经试过了'),/发生|回应/);
  assert.match(conversationalReply('谢谢你！'),/不客气/);
  assert.equal(conversationalReply('谢谢你，不过她又来联系我了'),null);
  assert.equal(focusedEntry(session.reading.entries,'我不懂你刚才的建议'),null);
});
