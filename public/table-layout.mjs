import { cards, spreads } from './reading.mjs';

export const TABLE_PAGE_SIZE = 9;
const byId = new Map(cards.map(card => [card.id, card]));

export function deckPageCount(pile) {
  return Math.max(1, Math.ceil(pile.length / TABLE_PAGE_SIZE));
}

export function tableState(session, stage) {
  const lastPage = deckPageCount(session.pile) - 1;
  const page = Math.max(0,Math.min(lastPage,session.deckPage ?? 0));
  const start = page * TABLE_PAGE_SIZE;
  return {
    stage, spread: session.spread,
    deck: session.pile.slice(start,start + TABLE_PAGE_SIZE).map((item, local) => ({ ...item, index:start + local })),
    selected: session.selected.map((item,index) => ({
      ...item, name:byId.get(item.id)?.name, flipped:session.flipped.includes(index),
    })),
    positions: (spreads[session.spread]?.positions ?? []).map(([name]) => name),
  };
}

export function cardPositions(spread, compact) {
  const far = compact ? -1.58 : -.97;
  if (spread === 'celtic') {
    const x = 1.44;
    const row = compact ? 1.32 : .91;
    const z = compact ? -1.82 : -1.05;
    const scale = compact ? .65 : .56;
    return [[0,0],[1,0],[0,-1],[0,1],[-1,0],[-2,0],[2,1.5],[2,.5],[2,-.5],[2,-1.5]]
      .map(([column,line]) => ({ x:column * x, z:z + line * row, scale }));
  }
  const count = spreads[spread]?.positions.length ?? 0;
  const gap = count === 5 ? (compact ? 1.35 : 1.57) : 1.82;
  const scale = count === 5 ? .83 : 1;
  return Array.from({ length:count },(_,index) => ({x:(index - (count - 1)/2)*gap,z:far,scale}));
}
