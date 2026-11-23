import { spreads, focusedEntry } from './public/reading.mjs';
import { conversationMethod, readingInstructions, readingMethod } from './tarot-method.mjs';

function validString(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }

function entryOf(entry) {
  if (!entry || !['position','purpose','card','orientation','meaning'].every(key => validString(entry[key],key === 'purpose' ? 480 : 200))) return null;
  const { position, purpose, card, orientation, meaning } = entry;
  return { position, purpose, card, orientation, meaning };
}

export function inputsOf(data) {
  if (!data || typeof data !== 'object' || !Object.hasOwn(readingInstructions, data.kind) || !validString(data.question, 480)) return null;
  const { kind, question, spread, entries, followup, previous, background, context, supplemental, earlierSupplements } = data;
  if (kind === 'clarify') return { kind, question };
  const readingBackground = validString(background,480) && background !== question ? { background } : {};
  if (!Array.isArray(entries) || ![1,3,5,10].includes(entries.length)) return null;
  const safeEntries = entries.map(entryOf);
  if (safeEntries.some(entry => entry === null)) return null;
  if (kind === 'reading' && typeof spread === 'string' && Object.hasOwn(spreads,spread) && spreads[spread].positions.length === entries.length) {
    return { kind, question, ...readingBackground, spread, entries:safeEntries };
  }
  if (kind === 'followup' && validString(followup, 480)) {
    const history = Array.isArray(previous) ? previous.slice(-6).filter(item => (
      item && validString(item.question, 480) && validString(item.answer, 1500)
    )).map(({ question, answer }) => ({ question, answer })) : [];
    const initialReading = validString(context?.overview,1800) && validString(context?.next,1200)
      ? { initialReading: { overview:context.overview, next:context.next } } : {};
    const extra = entryOf(supplemental);
    const past = Array.isArray(earlierSupplements) ? earlierSupplements.slice(-3).map(entryOf).filter(Boolean) : [];
    return {
      kind, question, ...readingBackground, followup, entries:safeEntries, previous:history, ...initialReading,
      ...(extra ? { supplemental:extra } : {}), ...(past.length ? { earlierSupplements:past } : {}),
    };
  }
  return null;
}

export function extractOutput(parsed, inputs) {
  if (inputs.kind !== 'reading') {
    if (!validString(parsed?.text,1500)) return null;
    const text = parsed.text.trim();
    if (inputs.kind === 'followup') {
      const normalize = value => value.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'');
      const reply = normalize(text);
      if (reply.length >= 12 && inputs.previous?.some(turn => normalize(turn.answer) === reply)) return null;
    }
    return { text };
  }
  const { overview, details, next } = parsed ?? {};
  if (!validString(overview, 1800) || !validString(next, 1200) || !Array.isArray(details)
    || details.length !== inputs.entries.length || details.some(detail => !validString(detail, 1000))) return null;
  return { overview, details, next };
}

export function offlineFormat(inputs) {
  const string = { type: 'string' };
  const properties = inputs.kind === 'reading'
    ? { overview: string, details: { type: 'array', items: string, minItems: inputs.entries.length, maxItems: inputs.entries.length }, next: string }
    : { text: string };
  return {
    type: 'json_schema',
    json_schema: { name: 'tarot_response', strict: true, schema: {
      type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
    } },
  };
}

export function completionBudget(inputs) {
  if (inputs.kind === 'reading') return 1100 + 190 * inputs.entries.length;
  return inputs.kind === 'followup' ? 1150 : 350;
}

export function modelMessages(inputs) {
  const focus = inputs.kind === 'followup' ? inputs.supplemental ?? focusedEntry(inputs.entries,inputs.followup) : null;
  const method = inputs.kind === 'followup' ? conversationMethod : readingMethod;
  const latestUserQuestion = inputs.previous?.at(-1)?.question;
  const task = focus
    ? readingInstructions.followup + ' 本轮聚焦一张牌。用 targetCard.card 的准确牌名，并结合这张牌的牌位和方向。相关的时间或预算以用户最后说的为准，在回答里明确写出。围绕 focusQuestion 深入解释。'
    : readingInstructions[inputs.kind];
  const { followup,...background } = inputs;
  const payload = focus ? {
    question:inputs.question, focusQuestion:inputs.supplemental?.purpose ?? followup,
    targetCard:focus, ...(inputs.background ? { background:inputs.background } : {}),
    ...(latestUserQuestion ? { latestUserQuestion } : {}),
    previous:inputs.previous, ...(inputs.initialReading ? { initialReading:inputs.initialReading } : {}),
  } : background;
  return [
    { role:'system', content:method + '\n此次任务：' + task },
    { role:'user', content:JSON.stringify(payload) },
    ...(inputs.kind === 'followup' ? [{role:'user',content:followup}] : []),
  ];
}
