import { cards } from './deck.mjs';
export { cards };

export const spreads = {
  single: {
    name: '单张聚焦', description: '从一个角度看清眼前的重点。',
    positions: [['眼前的重点','此刻最值得留意的主题']],
  },
  three: {
    name: '三张牌阵', description: '梳理现状、阻碍，以及可以尝试的一步。',
    positions: [['现状','问题目前的状态'], ['阻碍','容易卡住的地方或被忽略的因素'], ['建议','可以尝试的行动或态度']],
  },
  timeline: {
    name: '三张变化牌阵', description: '观察过去留下的影响、当下，以及事情可能如何演变。',
    positions: [['过去的影响','仍然影响当下的经历或做法'], ['当下','眼前最实际的情况'], ['可能走向','在现有条件下可能演变的方向']],
  },
  choice: {
    name: '五张取舍牌阵', description: '适合比较已明确的两个选项，依次看它们的机会和代价。',
    positions: [
      ['当前取舍','两个选项之间最需要厘清的取舍'],
      ['A 的机会','第一个选项可能带来的收获'], ['A 的代价','第一个选项可能要求的付出或承担'],
      ['B 的机会','第二个选项可能带来的收获'], ['B 的代价','第二个选项可能要求的付出或承担'],
    ],
  },
  celtic: {
    name: '凯尔特十字', description: '从十个牌位看背景、影响和可能的走向。',
    positions: [
      ['现状','问题的核心'], ['交叉影响','当前的挑战或辅助力量'], ['目标或意识','主观希望或意识到的目标'],
      ['基础','事情的根基或深层影响'], ['近期过去','正在退出的影响'], ['近期走向','可能接近的变化'],
      ['你的态度','你在其中的立场'], ['外部环境','周围条件和他人的可见影响'],
      ['希望与担忧','期待或顾虑'], ['可能结果','现有条件下可能形成的局面'],
    ],
  },
};

export const prompts = {
  love: ['你想了解关系目前的状态，还是想决定接下来要不要主动沟通？', ['我想弄清这段关系目前的状态。','我想知道主动沟通前需要考虑什么。'], '这段关系里，哪些迹象来自对方实际说过或做过的事？选其中一件写下来，再想想你想表达的需求。'],
  work: ['你更想看眼前的工作阻碍，还是在考虑一次岗位或方向上的变化？', ['我想弄清眼前的工作阻碍。','我想看看换一个工作方向前该准备什么。'], '从可以控制的条件入手，写下这周可以向谁确认一项信息，或可以自己完成哪一个准备动作。'],
  decision: ['你在比较哪些选项？你最在意它们之间的什么差别？', ['我想看这个决定里容易被忽略的代价。','我想看做决定前该先确认什么。'], '列出两个实际选项，分别写下最看重的收获和最难承受的代价，再选一个可撤回的小步骤试一试。'],
  general: ['能说说你正在面对什么，以及这次最想弄清楚哪一件事吗？', ['我想知道眼前这件事最值得注意什么。','我想找一个可以开始的小行动。'], '先把你已知的事实和猜测分开，找一个可在本周尝试的小步骤，再观察它带来的真实反馈。'],
};

export function classify(question) {
  const text = question.trim();
  const topic = /还是|选哪|选项|怎么选|做决定|两种|选择/.test(text) ? 'decision'
    : /感情|恋爱|前任|喜欢|复合|婚|伴侣|分手|关系|联系/.test(text) ? 'love'
    : /工作|岗位|职场|事业|辞职|跳槽|公司|同事|实习/.test(text) ? 'work' : 'general';
  const single = /日运|今日一抽|随手抽|随便抽|单张|抽一张|一个提示|一句话|眼前的重点/.test(text);
  const options = text.split(/还是|或者|选项\s*[AB甲乙]/i).filter(part => part.trim().length >= 4);
  const needsClarification = !single && (text.length < 9 || text === '我正在考虑一个选择'
    || /^(我想问|我想看|帮我看|看看)?(感情|工作|事业|运势|选择|未来|塔罗)[吧啊呢！。？?]*$/.test(text));
  const suggested = single ? 'single' : /凯尔特|深入|多方|复杂|全面|来龙去脉/.test(text) ? 'celtic'
    : /五张|二选一/.test(text) || (topic === 'decision' && options.length > 1) ? 'choice'
    : /过去.*现在|过去.*当下|变化过程|演变|发展过程/.test(text) ? 'timeline' : 'three';
  return { topic, needsClarification, suggested };
}

export function deal(allowReversals) {
  const deck = cards.map(card => ({ id: card.id, reversed: allowReversals && randomBelow(2) === 1 }));
  for (let position = deck.length - 1; position > 0; position -= 1) {
    const other = randomBelow(position + 1);
    [deck[position], deck[other]] = [deck[other], deck[position]];
  }
  return deck;
}

function randomBelow(limit) {
  const sample = new Uint32Array(1);
  const ceiling = 0x100000000 - 0x100000000 % limit;
  do { globalThis.crypto.getRandomValues(sample); } while (sample[0] >= ceiling);
  return sample[0] % limit;
}

export function choose(pile, selected, index, count) {
  const card = pile[index];
  return !card || selected.length >= count || selected.some(item => item.id === card.id)
    ? selected : [...selected, card];
}

export function supplementRequest(question) {
  if (/^补牌(?:有用吗|有什么用|是什么意思|怎么用|怎么抽)/.test(question.trim())) return null;
  const match = question.trim().match(/^(?:(?:能不能|可以|麻烦|请|帮我|我想要|我想|我能)\s*)*(?:再\s*)?补(?:抽(?:[一1]张)?牌?|[一1]张(?:澄清)?牌?|牌)\s*([\s\S]*)$/u);
  if (!match) return null;
  return match[1].replace(/^[：:，,\s]+/, '').replace(/^(?:吗?[？?。！!]|吗)$/, '').trim();
}

export function drawSupplement(session, purpose) {
  const earlier = session.supplements ?? [];
  const used = new Set([...session.selected,...earlier].map(item => item.id));
  const item = session.pile.find(entry => !used.has(entry.id));
  if (!item) return null;
  const card = cards.find(entry => entry.id === item.id);
  return {
    id:item.id, card:card.name, position:'补牌 ' + (earlier.length + 1), purpose,
    orientation:item.reversed ? '逆位' : '正位', meaning:item.reversed ? card.reversed : card.upright,
  };
}

export function composeReading(session) {
  const entries = session.selected.map((item, index) => {
    const card = cards.find(candidate => candidate.id === item.id);
    const [position, purpose] = spreads[session.spread].positions[index];
    return {
      position, purpose, card: card.name, orientation: item.reversed ? '逆位' : '正位',
      meaning: item.reversed ? card.reversed : card.upright,
    };
  });
  const first = entries[0];
  const last = entries.at(-1);
  const blocking = entries[1];
  const overview = session.spread === 'choice'
    ? '这次取舍先从「' + first.meaning + '」看起。A 的机会在于' + entries[1].meaning + '，需要考虑' + entries[2].meaning + '。B 的机会在于' + entries[3].meaning + '，需要考虑' + entries[4].meaning + '。你可以先比较，哪一边的代价更能承担。'
    : entries.length === 1
    ? '围绕「' + session.question + '」，' + first.card + '把注意力带到' + first.meaning + '。可以用这个方向检查眼前的处境。'
    : '围绕「' + session.question + '」，可以从「' + first.meaning + '」理解目前的处境。' + blocking.card + '落在' + blocking.position + '位，把' + blocking.meaning + '带进了这件事。' + last.card + '给出的另一个观察方向是「' + last.meaning + '」。';
  return { entries, overview, next: prompts[classify(session.question).topic][2] };
}

export function conversationalReply(question) {
  const text = question.trim().replace(/[。！？!?，,～~]+$/u,'');
  if (/^(谢谢(?:你|老师)?|多谢|感谢(?:你|老师)?|辛苦了)$/.test(text)) return '不客气。你可以慢慢想，我在这儿。';
  if (/^(嗯+|好的?|好吧|嗯嗯好|明白了?|我明白了|懂了|知道了)$/.test(text)) return '好。想接着聊的时候，我们再继续。';
  if (/^(不太准|不太贴切|不太像我|说得不对|不是这个意思)$/.test(text)) return '明白，刚才可能理解偏了。哪一句和你实际经历最不一样？';
  return null;
}

export function answerFollowup(session, question) {
  const conversational = conversationalReply(question);
  if (conversational) return conversational;
  if (/换个(话题|问题|主题)|问另一件事|开一轮新的/.test(question)) {
    return '可以。请用页面顶部的「新的读牌」开启一场会话，再告诉我你这次想问什么。';
  }
  const note = session.reading;
  const supplement = /补牌|澄清牌/.test(question) ? session.supplements?.at(-1) : null;
  if (supplement) return supplement.card + ' · ' + supplement.orientation + '补充的是「' + supplement.purpose + '」。可以结合原牌阵，留意' + supplement.meaning + '。';
  const index = cardNumber(question);
  const focus = focusedEntry(note.entries, question);
  if (index !== null && !focus) return '这次牌阵共有 ' + note.entries.length + ' 张牌。你可以用牌名或牌位来追问其中一张。';
  if (focus) return '我先讲' + focus.position + '位的' + focus.card + '（' + focus.orientation + '）。放在这个位置，我会留意' + focus.meaning + '。';
  if (/试过了|已经(做了|说了|问了|发了|联系了)/.test(question)) return '你已经试过了。之后发生了什么，或者对方是怎么回应的？';
  if (/怎么开口|怎么发消息|怎么回复|怎么回[他她]|话术/.test(question)) return '如果你想先听听对方的想法，可以从一句轻一点的话开始：「你现在方便聊几句吗？不方便的话也没关系。」';
  if (/复合/.test(question)) return '光靠牌面很难判断对方会不会主动提复合。最近有没有发生过明确的主动联系，或者对方说过希望再聊聊？';
  if (/他在想|她在想|对方.*(想法|心里)|一定|会不会|什么时候会/.test(question)) return '这件事还要看现实里发生了什么。有没有一个最近的动作、回复或变化，让你特别想确认这一点？';
  return '我还没接准你这句最想问的是什么。你能说说刚发生的事，或指出想接着聊的那一句吗？';
}

export function cardNumber(question) {
  const indices = '一二三四五六七八九十';
  const match = question.match(/第\s*([一二三四五六七八九十]|\d{1,2})\s*张/);
  return match ? (/^\d+$/.test(match[1]) ? Number(match[1]) : indices.indexOf(match[1]) + 1) - 1 : null;
}

export function focusedEntry(entries, question) {
  const index = cardNumber(question);
  if (index !== null) return entries[index] ?? null;
  return entries.find(item => question.includes(item.card))
    ?? entries.find(({position}) => question.trim() === position || question.includes(position + '位') || question.includes(position + '那张'))
    ?? null;
}

export function formatReport(session) {
  const note = session.reading;
  const report = ['月汐塔罗 · 读牌报告', '问题：' + session.question, '牌阵：' + spreads[session.spread].name, '', note.overview, ''];
  for (const entry of note.entries) {
    report.push(entry.position + '｜' + entry.card + ' · ' + entry.orientation, entry.detail ?? entry.meaning, '');
  }
  report.push('可以尝试的下一步', note.next);
  for (const extra of session.supplements ?? []) report.push('', extra.position + '｜' + extra.card + ' · ' + extra.orientation, '澄清：' + extra.purpose, extra.meaning);
  for (const step of session.replies) report.push('', '追问：' + step.question, step.answer);
  return report.join('\n');
}
