import { cards, spreads, prompts, classify, deal, choose, composeReading, answerFollowup, conversationalReply, formatReport, drawSupplement, supplementRequest, cardNumber, focusedEntry, cardReadingTitle } from './reading.mjs';
import { TABLE_PAGE_SIZE, deckPageCount, tableState } from './table-layout.mjs';
import { apiBase } from './deployment.mjs';
import './music.mjs';

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const status = document.querySelector('#status');
const roomLayer = document.querySelector('#room-layer');
const roomControls = document.querySelector('#room-controls');
const modeButton = document.querySelector('#room-mode');
const roomStages = new Set(['shuffle','cut','pick','reveal','reading']);
const storageKey = 'moon-tide-reading-v1';
const fresh = () => ({
  stage: 'home', draft: '', question: '', firstQuestion: '', spread: '', allowReversals: true,
  pile: [], selected: [], flipped: [], reading: null, replies: [], guidance: '', usedModel: false, deckPage: 0,
  supplements: [], waitingForSupplementFocus: false,
});
let session = restore();
let modelEnabled = false;
let modelOnDevice = false;
let waiting = '';
let modelFallback = false;
let generation = 0;
let roomWanted = true;
let roomPromise;
let table;
let roomUnavailable = false;
let openSheet = session.stage === 'reading' ? 'analysis' : '';

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && ['home','clarify','spread','shuffle','cut','pick','reveal','reading','report'].includes(saved.stage)) return { ...fresh(), ...saved };
  } catch { /* The reading can continue if storage is unavailable. */ }
  return fresh();
}

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(session)); } catch { /* Keep the session in memory. */ }
}

function safe(text) {
  return String(text ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
}

function announce(text) {
  status.textContent = text;
}

function focusAfterRender(selector) {
  app.querySelector(selector)?.focus({ preventScroll: true });
}

function show(stage, message) {
  session.stage = stage;
  save();
  render();
  if (message) announce(message);
  focusAfterRender('h1');
}

function prepareRoom() {
  if (roomPromise || roomUnavailable) return;
  const fallback = () => {
    roomUnavailable = true;
    render();
    announce('已切换到平面牌桌。');
  };
  roomPromise = import('./table-scene.mjs').then(({ createTable }) => {
    table = createTable(document.querySelector('#room-canvas'), roomControls, roomLayer, fallback);
    render();
  }).catch(fallback);
}

function landscape() {
  return `<section class="hero">
    <div class="hero-copy">
      <h1 tabindex="-1">你想向塔罗<br>问些什么<span class="accent">？</span></h1>
      <p class="intro">说出你此刻在意的事。从选牌到解读，<br class="wide-only">一步一步看清问题里的线索。</p>
      <div class="topics" aria-label="问题示例">
        <button class="topic" type="button" data-action="topic" data-value="感情">感情</button>
        <button class="topic" type="button" data-action="topic" data-value="工作">工作</button>
        <button class="topic" type="button" data-action="topic" data-value="选择">选择</button>
      </div>
      <form data-form="start" class="entry-form">
        <label class="sr-only" for="opening-question">你的塔罗问题</label>
        <textarea id="opening-question" name="text" maxlength="480" rows="2" placeholder="请用一两句话描述你的问题…" required>${safe(session.draft)}</textarea>
        <button class="primary" type="submit">开始读牌 <span aria-hidden="true">✦</span></button>
      </form>
    </div>
    <div class="hero-art" aria-hidden="true"><img src="./hero.webp" alt="" fetchpriority="high"></div>
  </section>
  <div class="landing-steps" aria-label="读牌步骤"><span>提问</span><i>✦</i><span>抽牌</span><i>✦</i><span>解读</span></div>`;
}

function assistantBubble(text) {
  return `<div class="message assistant"><span class="message-avatar" aria-hidden="true">☾</span><p>${safe(text)}</p></div>`;
}
function visitorBubble(text) {
  return `<div class="message visitor"><p>${safe(text)}</p></div>`;
}

function progress() {
  const active = ['clarify','spread'].includes(session.stage) ? 0
    : ['shuffle','cut','pick','reveal'].includes(session.stage) ? 1 : 2;
  return `<ol class="progress" aria-label="当前读牌步骤">${['提问','抽牌','解读'].map((label, index) => (
    `<li class="${index < active ? 'done' : ''}" ${index === active ? 'aria-current="step"' : ''}><span></span>${label}</li>`
  )).join('')}</ol>`;
}

function cardBack() {
  return '<span class="card-frame" aria-hidden="true"><span class="card-orbit"></span><span class="card-moon">☾</span><span class="card-spark north">✦</span><span class="card-spark south">✧</span></span>';
}

function clarifyView() {
  const topic = classify(session.question).topic;
  const [, examples] = prompts[topic];
  return `<h1 tabindex="-1">把问题说得更具体</h1>
    <p class="section-copy">一个清楚的问题能帮我们选择更合适的牌阵。你也可以沿用原问题。</p>
    <form class="clarify-form" data-form="clarify">
      <label for="clarification">你这次最想弄清楚什么？</label>
      <textarea id="clarification" name="text" rows="3" maxlength="480" placeholder="补充你想看的重点…" required></textarea>
      <div class="examples">${examples.map(example => `<button class="topic" data-action="example" data-value="${safe(example)}" type="button">${safe(example)}</button>`).join('')}</div>
      <div class="action-row"><button class="primary" type="submit">确认问题</button><button type="button" class="outline" data-action="keep">沿用原问题</button></div>
    </form>`;
}

function spreadView() {
  return `<h1 tabindex="-1">为你的问题选一个牌阵</h1>
    <p class="section-copy">本次提问 <strong>${safe(session.question)}</strong></p>
    <form data-form="spread">
      <fieldset class="spread-options">
        <legend class="sr-only">牌阵</legend>
        ${Object.entries(spreads).map(([key, spread]) => `<label class="spread-option">
          <input type="radio" name="spread" value="${key}" ${key === session.spread ? 'checked' : ''}>
          <span><b>${spread.name}</b><span class="spread-description">${spread.description}</span></span>
          <span class="spread-count">${spread.positions.length} 张</span>
        </label>`).join('')}
      </fieldset>
      <label class="switch-row"><input name="reversals" type="checkbox" ${session.allowReversals ? 'checked' : ''}>使用逆位</label>
      <div class="action-row"><button class="primary" type="submit">确认牌阵</button><button class="outline" type="button" data-action="edit">修改问题</button></div>
    </form>`;
}

function ritualView() {
  const shuffling = session.stage === 'shuffle';
  return `<h1 tabindex="-1">${shuffling ? '洗牌' : '切牌'}</h1>
    <p class="section-copy">${shuffling
      ? '把注意力放回刚才的问题。准备好时，打乱整副牌。'
      : '选择一个位置切开并重新叠起牌组。也可以直接进入选牌。'}</p>
    <div class="ritual-cards ${shuffling ? 'shuffle' : ''}">
      ${[0, 1, 2].map(index => shuffling
        ? `<div class="card-back decorative-card">${cardBack()}</div>`
        : `<button class="card-back cut-button" data-action="cut" data-index="${index}" aria-label="在第 ${index + 1} 个位置切牌">${cardBack()}</button>`).join('')}
    </div>
    <div class="action-row centered room-actions">${shuffling
      ? '<button class="primary" data-action="shuffle">洗牌</button>'
      : '<button class="outline" data-action="skip-cut">跳过切牌</button>'}
      <button class="plain room-only" data-action="room-chat">读牌对话</button></div>`;
}

function cardMarkup(item, flipped) {
  if (!flipped) return `<span class="card-back table-card">${cardBack()}</span>`;
  const card = cards.find(candidate => candidate.id === item.id);
  return `<span class="face table-card ${item.reversed ? 'reversed' : ''}"><img src="./cards/${card.id}.jpg" alt="${card.name} · ${item.reversed ? '逆位' : '正位'}"></span>`;
}

function board() {
  const spread = spreads[session.spread];
  const picking = session.stage === 'pick';
  const revealing = session.stage === 'reveal';
  return `<div class="placemat spread-${session.spread}" aria-label="${spread.name}">${spread.positions.map(([position], index) => {
    const item = session.selected[index];
    const flipped = session.flipped.includes(index);
    const card = item ? cards.find(candidate => candidate.id === item.id) : null;
    return `<div class="position place-${index + 1}">
      ${!item ? `<span class="table-card empty-position" aria-hidden="true">✧</span>`
        : revealing && !flipped ? `<button class="flip" data-action="flip" data-index="${index}" aria-label="翻开${position}牌">${cardMarkup(item, false)}</button>`
        : flipped && card ? `<button class="flip" data-action="inspect" data-index="${index}" aria-label="查看${card.name}牌面">${cardMarkup(item, true)}</button>`
        : cardMarkup(item, false)}
      <span class="position-label">${position}</span>
      ${flipped && card ? `<span class="position-name">${card.name} · ${item.reversed ? '逆位' : '正位'}</span>` : ''}
    </div>`;
  }).join('')}</div>
  ${picking ? `<div class="deck-strip" aria-label="可选的 78 张牌">${session.pile.map((item, index) => {
    const selected = session.selected.some(card => card.id === item.id);
    return `<button class="card-back pick-card" data-action="pick" data-index="${index}" aria-label="选第 ${index + 1} 张牌" ${selected ? 'disabled' : ''}>${cardBack()}</button>`;
  }).join('')}</div>` : ''}`;
}

function drawView() {
  const picking = session.stage === 'pick';
  const amount = spreads[session.spread].positions.length;
  const allFlipped = session.flipped.length === amount;
  const page = Math.min(session.deckPage, deckPageCount(session.pile) - 1);
  const pageLabel = (page * TABLE_PAGE_SIZE + 1) + '–' + Math.min((page + 1) * TABLE_PAGE_SIZE, session.pile.length);
  return `<h1 tabindex="-1">${picking ? '选择你的牌' : '翻开你的牌'}</h1>
    <p class="section-copy">${picking
      ? '从下方牌组中选牌，系统会按顺序将牌放入对应位置。已选 ' + session.selected.length + ' / ' + amount + ' 张。'
      : '点击牌背依次翻牌，看看每张牌落在什么位置。'}</p>
    ${board()}
    <div class="action-row room-actions">${picking
      ? `<div class="deck-pages room-only" aria-label="浏览牌堆">
          <button class="plain" data-action="previous-page" aria-label="上一组牌" ${page === 0 ? 'disabled' : ''}>‹</button>
          <span aria-live="polite">${pageLabel} / 78</span>
          <button class="plain" data-action="next-page" aria-label="下一组牌" ${page === deckPageCount(session.pile)-1 ? 'disabled' : ''}>›</button>
        </div><button class="primary" data-action="auto">帮我抽取剩余牌</button>`
      : `<button class="primary" data-action="${allFlipped ? 'interpret' : 'flip-all'}">${allFlipped ? '开始解读' : '翻开全部'}</button>`}
      <button class="plain room-only" data-action="room-chat">读牌对话</button></div>`;
}

function readingAnalysis() {
  const note = session.reading;
  if (!note) return '<p class="section-copy" role="status">正在按照牌位整理这次读牌…</p>';
  return `<section class="reading-note"><h2>抽到的牌</h2><ul class="drawn-card-list" role="list">${note.entries.map(entry => `<li><strong>${safe(entry.card)}</strong> · ${safe(entry.orientation)}</li>`).join('')}</ul></section>
    <section class="reading-note card-notes"><h2>牌面解读</h2>${note.entries.map((entry,index) => `<div class="card-note">
      <h3>${safe(cardReadingTitle(entry,index))}<span>${safe(entry.card)}（${safe(entry.orientation)}）</span></h3>
      <p>${safe(entry.detail ?? ('这个位置看' + entry.purpose + '。这张牌在这里提示你留意' + entry.meaning + '。'))}</p>
    </div>`).join('')}</section>
    <section class="reading-note"><h2>整体总结</h2><p>${safe(note.overview)}</p></section>
    <section class="reading-note"><h2>可以怎么做</h2><p>${safe(note.next)}</p></section>`;
}

function readingView(inRoom) {
  const ready = Boolean(session.reading);
  return `<h1 tabindex="-1">${ready ? '你的牌阵解读' : '正在准备解读'}</h1>
    <p class="section-copy">${ready ? `<strong>${safe(session.question)}</strong>` : '正在按照牌位整理这次读牌…'}</p>
    ${board()}
    ${inRoom || !ready ? '' : readingAnalysis()}
    <div class="action-row room-actions">${ready
      ? `${inRoom ? '<button class="primary" data-action="room-analysis">查看解读</button><button class="outline" data-action="room-chat">继续追问</button>' : ''}
         <button class="${inRoom ? 'plain' : 'primary'}" data-action="report" ${waiting ? 'disabled' : ''}>查看读牌报告</button>`
      : '<button class="plain room-only" data-action="room-chat">读牌对话</button>'}</div>`;
}

function reportView() {
  return `<h1 tabindex="-1">读牌报告</h1>
    <p class="section-copy">报告包含这次的牌阵、解读和追问，可复制内容或保存到设备。</p>
    <pre class="report">${safe(formatReport(session))}</pre>
    <div class="action-row">
      <button class="primary" data-action="copy">复制报告</button>
      <button class="outline" data-action="download">下载文本</button>
      <button class="plain" data-action="back">返回对话</button>
    </div>
    <p id="report-feedback" role="status"></p>`;
}

function chatPanel() {
  const stage = session.stage;
  const directions = {
    clarify: prompts[classify(session.question).topic][0],
    spread: '我建议用' + (spreads[classify(session.question).suggested]?.name ?? '三张牌阵') + '。抽牌前先确认每张牌要看的位置。',
    shuffle: '牌阵已确定。带着刚才确认的问题，准备好就开始洗牌。',
    cut: '洗好了。切一下牌，或者直接开始选牌。',
    pick: '按你的节奏选牌。每张牌会依次进入对应的牌位。',
    reveal: '选牌完成。翻牌后，我们先逐张解读，再把牌放在一起看。',
    reading: session.reading ? '解读已完成。你可以追问一张牌，或聊聊这次牌阵里与你最有关的一点。' : '牌面已经确定，我正在整理它们和你问题的联系。',
  };
  const lines = session.replies.map((item,index) => visitorBubble(item.question)
    + (waiting === 'followup' && index === session.replies.length - 1 ? '' : assistantBubble(item.answer))).join('');
  return `<aside class="dialogue" aria-labelledby="chat-heading">
    <h2 id="chat-heading">读牌对话</h2>
    <div class="dialogue-scroll" aria-live="polite">${visitorBubble(session.firstQuestion || session.question)}
      ${session.firstQuestion && session.firstQuestion !== session.question ? visitorBubble(session.question) : ''}
      ${assistantBubble(stage === 'clarify' && session.guidance ? session.guidance : directions[stage])}
      ${lines}${waiting ? assistantBubble(waiting === 'clarify' ? '正在整理你的问题…' : waiting === 'followup' ? '正在回复…' : '正在看这次的牌阵…') : ''}
    </div>
    ${stage === 'reading' && session.reading ? `<form data-form="followup" class="followup-form">
      <label for="followup" class="sr-only">继续追问</label>
      <textarea id="followup" name="text" rows="1" maxlength="480" placeholder="追问这次的牌阵…" required ${waiting ? 'disabled' : ''}></textarea>
      <button class="outline" type="submit" ${waiting ? 'disabled' : ''}>发送</button>
    </form>` : ''}
    ${modelFallback ? '<p class="mode-label" role="status">本次使用内置牌义继续解读</p>' : ''}
    ${stage === 'reading' && session.reading && !modelFallback
      ? `<p class="mode-label">${session.usedModel ? '模型解读' : '本地牌义解读'}</p>` : ''}
  </aside>`;
}

function render() {
  const stage = session.stage;
  const canShowRoom = roomStages.has(stage) && !roomUnavailable;
  const inRoom = canShowRoom && roomWanted && Boolean(table);
  modeButton.hidden = !canShowRoom;
  modeButton.textContent = inRoom ? '立体牌桌' : '平面牌桌';
  modeButton.setAttribute('aria-pressed', String(inRoom));
  document.body.classList.toggle('in-room',inRoom);
  roomLayer.hidden = !inRoom;
  table?.setEnabled(inRoom);
  if (canShowRoom && roomWanted && !table) prepareRoom();
  if (inRoom) table.update(tableState(session, stage === 'shuffle' ? 'washing' : stage));
  if (stage === 'home') { app.innerHTML = landscape(); return; }
  const work = {
    clarify: clarifyView, spread: spreadView, shuffle: ritualView, cut: ritualView, pick: drawView,
    reveal: drawView, reading: readingView, report: reportView,
  }[stage](inRoom);
  const contentSheet = inRoom && openSheet && (openSheet !== 'analysis' || stage === 'reading')
    ? `<section class="room-sheet" aria-label="${openSheet === 'analysis' ? '牌阵分析' : '读牌对话'}">
        <button class="outline close-sheet" data-action="close-sheet" aria-label="收起面板">收起</button>
        ${openSheet === 'analysis' ? readingAnalysis() : chatPanel()}
        ${openSheet === 'analysis' && session.reading ? '<button class="outline sheet-follow" data-action="room-chat">继续追问</button>' : ''}
      </section>` : '';
  app.innerHTML = `<div class="session-shell">${progress()}<div class="workbench ${stage === 'report' ? 'report-layout' : ''}">
    <section class="workspace">${work}</section>${inRoom ? contentSheet : stage === 'report' ? '' : chatPanel()}
  </div></div>`;
  const visibleChat = app.querySelector('.dialogue-scroll');
  if (stage === 'reading' && visibleChat) visibleChat.scrollTop = visibleChat.scrollHeight;
}

function reset() {
  generation++;
  waiting = '';
  modelFallback = false;
  openSheet = '';
  session = fresh();
  show('home');
}

function openDialog(content) {
  dialog.innerHTML = content;
  dialog.showModal();
}

async function consult(kind, data) {
  if (!apiBase && !modelEnabled) return null;
  try {
    const response = await fetch(apiUrl('consult'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials:'omit', body: JSON.stringify({ kind, ...data }),
      signal: AbortSignal.timeout(apiBase ? 97_000 : modelOnDevice ? 66_000 : 28_000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function apiUrl(name) {
  return apiBase ? new URL('/api/' + name,apiBase).href : './api/' + name;
}

async function startReading() {
  const current = ++generation;
  const base = composeReading(session);
  waiting = modelEnabled || apiBase ? 'reading' : '';
  openSheet = '';
  show('reading');
  const result = await consult('reading', { question: session.question, background: session.firstQuestion, spread: session.spread, entries: base.entries });
  if (current !== generation) return;
  if (result?.overview && result?.next && result?.details?.length === base.entries.length) {
    session.reading = { overview: result.overview, next: result.next, entries: base.entries.map((entry, index) => ({ ...entry, detail: result.details[index] })) };
    session.usedModel = true;
    modelFallback = false;
  } else {
    session.reading = base;
    modelFallback = Boolean(modelEnabled || apiBase);
  }
  waiting = '';
  openSheet = 'analysis';
  show('reading', '牌阵解读已完成。');
}

async function clarifyIfPossible() {
  if (!apiBase && !modelEnabled) return;
  const current = ++generation;
  waiting = 'clarify';
  render();
  const result = await consult('clarify', { question: session.question });
  if (current !== generation || session.stage !== 'clarify') return;
  waiting = '';
  if (result?.text) session.guidance = result.text;
  else modelFallback = true;
  save();
  // Preserve any answer typed while the guidance was loading.
  const box = app.querySelector('#clarification');
  const value = box?.value;
  const hadFocus = document.activeElement === box;
  render();
  const updated = app.querySelector('#clarification');
  if (updated && value) updated.value = value;
  if (hadFocus) updated?.focus();
}

async function followup(question) {
  const request = supplementRequest(question);
  const finalText = answer => {
    session.replies.push({ question, answer });
    save(); render(); announce('追问已回答。'); focusAfterRender('#followup');
  };
  const conversational = conversationalReply(question);
  if (conversational) {
    finalText(conversational);
    return;
  }
  if (session.waitingForSupplementFocus && /不补了|取消补牌|算了/.test(question)) {
    session.waitingForSupplementFocus = false;
    finalText('好，我们接着看刚才那组牌。');
    return;
  }
  if (request === '') {
    session.waitingForSupplementFocus = true;
    finalText('你想用这张补牌澄清哪一点？可以说一个具体困惑，或说想追问哪张牌。');
    return;
  }
  const purpose = request ?? (session.waitingForSupplementFocus ? question : '');
  let supplement;
  if (purpose) {
    session.waitingForSupplementFocus = false;
    supplement = drawSupplement(session,purpose);
    if (!supplement) {
      finalText('这副牌已经抽完，可以继续用桌上的牌来梳理这个问题。');
      return;
    }
    session.supplements.push(supplement);
  }
  const cardPositions = session.reading.entries;
  const focused = focusedEntry(cardPositions, question);
  if (!supplement && cardNumber(question) !== null && !focused) {
    finalText(answerFollowup(session, question));
    return;
  }
  const current = ++generation;
  const opening = supplement ? supplement.position + '｜' + supplement.card + ' · ' + supplement.orientation + '\n\n' : '';
  const fallback = supplement
    ? opening + '围绕「' + purpose + '」，可以留意' + supplement.meaning + '。这张牌补充的是当前问题，桌上的原牌位保持原样。'
    : answerFollowup(session, question);
  const previous = session.replies.slice(-6);
  const next = { question, answer: fallback };
  session.replies.push(next);
  save();
  if (modelEnabled || apiBase) {
    waiting = 'followup';
    render();
    const { overview, next: firstAction } = session.reading;
    const result = await consult('followup', {
      question: session.question, background: session.firstQuestion, followup: question,
      entries: cardPositions, previous, context: { overview, next: firstAction },
      supplemental: supplement, earlierSupplements: session.supplements.slice(0, supplement ? -1 : undefined),
    });
    if (generation !== current) return;
    const namedCard = supplement?.card ?? focused?.card;
    if (result?.text && (!namedCard || result.text.includes(namedCard))) {
      next.answer = opening + result.text;
      modelFallback = false;
    }
    else modelFallback = true;
  }
  waiting = '';
  save();
  render();
  announce('追问已回答。');
  focusAfterRender('#followup');
}

function continueToSpread(question) {
  generation++;
  waiting = '';
  session.question = question;
  session.spread = classify(question).suggested;
  show('spread');
}

function selectCard(index) {
  const limit = spreads[session.spread].positions.length;
  const next = choose(session.pile, session.selected, index, limit);
  if (next === session.selected) return;
  session.selected = next;
  if (next.length === limit) { show('reveal', '选牌完成，可以翻牌。'); return; }
  const oldStrip = app.querySelector('.deck-strip');
  const scroll = oldStrip.scrollLeft;
  render();
  save();
  app.querySelector('.deck-strip').scrollLeft = scroll;
  if (!document.body.classList.contains('in-room')) focusAfterRender('.pick-card[data-index="' + (index + 1) + '"]:not(:disabled)');
  announce('已选 ' + next.length + ' 张牌。');
}

function inspectCard(index) {
  const item = session.selected[index];
  if (!item || !session.flipped.includes(index)) return;
  const card = cards.find(entry => entry.id === item.id);
  const orientation = item.reversed ? '逆位' : '正位';
  table?.setFocus(index);
  openDialog(`<h2>${card.name} · ${orientation}</h2>
    <img class="inspect-image ${item.reversed ? 'is-reversed' : ''}" src="./cards/${card.id}.jpg" alt="${card.name} · ${orientation}">
    <p>${safe(session.reading?.entries[index]?.detail ?? (item.reversed ? card.reversed : card.upright))}</p>
    <form method="dialog" class="action-row"><button class="outline">关闭</button>
      ${session.reading ? `<button type="button" class="primary" data-action="ask-card" data-index="${index}">追问这张牌</button>` : ''}
    </form>`);
}

dialog.addEventListener('close', () => table?.setFocus(-1));

function downloadReport() {
  const file = new Blob(['\uFEFF', formatReport(session)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: '月汐塔罗-读牌报告.txt' });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  announce('已请求下载读牌报告。');
}

document.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, value } = button.dataset;
  const index = Number(button.dataset.index);
  switch (action) {
    case 'room-mode': roomWanted = !roomWanted; render(); modeButton.focus(); break;
    case 'room-analysis': openSheet = 'analysis'; render(); focusAfterRender('.close-sheet'); break;
    case 'room-chat': openSheet = 'chat'; render(); focusAfterRender(session.reading ? '#followup' : '.close-sheet'); break;
    case 'close-sheet': {
      const previous = openSheet;
      openSheet = ''; render(); focusAfterRender('[data-action="room-' + previous + '"]'); break;
    }
    case 'previous-page':
    case 'next-page':
      session.deckPage = Math.max(0,Math.min(deckPageCount(session.pile)-1,session.deckPage + (action === 'next-page' ? 1 : -1)));
      save(); render();
      focusAfterRender('[data-action="' + action + '"]:not(:disabled)');
      break;
    case 'inspect': inspectCard(index); break;
    case 'ask-card':
      dialog.close();
      openSheet = 'chat';
      render();
      app.querySelector('#followup').value = '第 ' + (index + 1) + ' 张牌想提醒我什么？';
      focusAfterRender('#followup');
      break;
    case 'help':
      openDialog(`<h2>读牌说明</h2><p>月汐塔罗按韦特–史密斯读牌。先聚焦问题，再按牌位、正逆位和牌之间的呼应解读。追问时继续看同一组牌。</p>
        <p>模式：${modelOnDevice ? '本机模型解读。问题和相关牌阵信息由本机模型处理。'
          : modelEnabled || apiBase ? '在线模型解读。问题和相关牌阵信息会发送给模型服务。'
          : '本地牌义解读。对话内容保存在当前浏览器。'}</p>
        <p>塔罗可以作为整理想法的方式。涉及现实决定时，请以可核实的事实为依据。</p>
        <form method="dialog"><button class="primary">关闭</button></form>`);
      break;
    case 'new':
      if (session.stage === 'home' && !session.draft) { focusAfterRender('#opening-question'); break; }
      openDialog('<h2>开始新的读牌？</h2><p>开始后会清除当前浏览器里的本次会话。你可以先保存报告。</p><form method="dialog" class="action-row"><button class="outline">继续本次</button><button type="button" class="primary" data-action="confirm-new">开始新的读牌</button></form>');
      break;
    case 'confirm-new': dialog.close(); reset(); focusAfterRender('#opening-question'); break;
    case 'topic': {
      const input = app.querySelector('#opening-question');
      const examples = { 感情: '我想问感情', 工作: '我想问工作', 选择: '我正在考虑一个选择' };
      input.value = examples[value];
      app.querySelectorAll('.topic').forEach(topic => topic.classList.toggle('active', topic === button));
      session.draft = input.value;
      save();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      break;
    }
    case 'example': {
      const input = app.querySelector('#clarification');
      input.value = value;
      input.focus();
      break;
    }
    case 'keep': continueToSpread(session.question); break;
    case 'edit': session.guidance = ''; show('clarify'); break;
    case 'shuffle': session.pile = deal(session.allowReversals); session.deckPage = 0; show('cut', '洗牌完成。'); break;
    case 'cut': {
      const at = [19, 39, 58][index];
      session.pile = [...session.pile.slice(at), ...session.pile.slice(0, at)];
      show('pick', '切牌完成。');
      break;
    }
    case 'skip-cut': show('pick'); break;
    case 'pick':
      selectCard(index);
      if (event.detail === 0 && document.body.classList.contains('in-room')) {
        const nextAction = session.stage === 'reveal' ? 'flip' : 'pick';
        roomControls.querySelector('[data-action="' + nextAction + '"]')?.focus({ preventScroll:true });
      }
      break;
    case 'auto': {
      const chosen = new Set(session.selected.map(item => item.id));
      const left = spreads[session.spread].positions.length - session.selected.length;
      session.selected = [...session.selected, ...session.pile.filter(item => !chosen.has(item.id)).slice(0, left)];
      show('reveal', '选牌完成，可以翻牌。');
      break;
    }
    case 'flip':
      session.flipped.push(index);
      save();
      render();
      const nextFlip = document.querySelector('.in-room #room-controls [data-action="flip"]') ?? app.querySelector('[data-action="flip"]');
      if (nextFlip) nextFlip.focus({ preventScroll:true });
      else focusAfterRender('[data-action="interpret"]');
      announce(spreads[session.spread].positions[index][0] + '牌已翻开。');
      break;
    case 'flip-all': session.flipped = session.selected.map((_, position) => position); show('reveal', '全部牌已翻开。'); focusAfterRender('[data-action="interpret"]'); break;
    case 'interpret': await startReading(); break;
    case 'report': show('report'); break;
    case 'back': show('reading'); break;
    case 'copy':
      try {
        await navigator.clipboard.writeText(formatReport(session));
        app.querySelector('#report-feedback').textContent = '已复制报告。';
      } catch {
        app.querySelector('#report-feedback').textContent = '无法访问剪贴板，可以用「下载文本」保存。';
      }
      break;
    case 'download': downloadReport(); break;
  }
});

app.addEventListener('input', event => {
  if (event.target.id === 'opening-question') { session.draft = event.target.value; save(); }
});

app.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const text = String(data.get('text') ?? '').trim();
  switch (form.dataset.form) {
    case 'start':
      if (!text) { focusAfterRender('#opening-question'); return; }
      session.firstQuestion = text;
      session.question = text;
      if (classify(text).needsClarification) { show('clarify'); await clarifyIfPossible(); }
      else continueToSpread(text);
      break;
    case 'clarify': if (text) continueToSpread(text); break;
    case 'spread':
      session.spread = data.get('spread');
      session.allowReversals = data.has('reversals');
      show('shuffle');
      break;
    case 'followup': if (text && !waiting) { form.reset(); await followup(text); } break;
  }
});

render();
fetch(apiUrl('status'),{credentials:'omit',signal:AbortSignal.timeout(6500)}).then(response => response.ok ? response.json() : null).then(settings => {
  modelEnabled = settings?.mode === 'model';
  modelOnDevice = !apiBase && settings?.provider === 'device';
}).catch(() => {}).finally(() => {
  if (session.stage === 'reading' && !session.reading && !waiting) void startReading();
});
