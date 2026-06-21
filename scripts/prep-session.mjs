#!/usr/bin/env node
// Coach scheduler: fold reviews.jsonl -> Leitner state -> pick due + new cards
// (strata/frequency order, confusable-cohesive), order for contrastive drilling,
// write data/session.js for the quiz player to load.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = '/Users/dlesky/hebrew';
const WORDS = `${ROOT}/data/words.json`;
const REVIEWS = `${ROOT}/data/reviews.jsonl`;
const OUT = `${ROOT}/data/session.js`;

const NEW_PER_SESSION = 10;
const MAX_SESSION = 18;
const BOX_INTERVAL_DAYS = [0, 1, 2, 4, 8, 16]; // index = box (1..5)

// Visually/semantically confusable sets: introduce together, drill adjacent.
const CONFUSABLE = [
  ['הוא', 'היא'],
  ['זה', 'זו', 'זאת'],
  ['אותו', 'אותי', 'אותך', 'אותה'],
  ['שלי', 'שלך', 'שלו'],
  ['לי', 'לו', 'לה'],
];

// ---- load ----
const words = JSON.parse(readFileSync(WORDS, 'utf8')).words;
const byId = new Map(words.map(w => [w.bare, w])); // id === bare
const events = existsSync(REVIEWS)
  ? readFileSync(REVIEWS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : [];

// ---- fold per-id Leitner state ----
const evById = new Map();
for (const e of events) (evById.get(e.id) ?? evById.set(e.id, []).get(e.id)).push(e);

function fold(evs) {
  evs = [...evs].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  let box = 1; // first exposure lands in box 1
  for (const e of evs) {
    if (e.grade === 'again') box = 1;          // fail -> reset
    else if (e.peeked) { /* hold: needed the hint, don't promote */ }
    else if (e.grade === 'good') box = Math.min(5, box + 1);
    else if (e.grade === 'easy') box = Math.min(5, box + 2);
    // 'hard' (unpeeked): stay
  }
  return { box, lastSeen: evs.at(-1)?.t ?? null, count: evs.length, seen: evs.length > 0 };
}
const state = new Map(words.map(w => [w.bare, fold(evById.get(w.bare) ?? [])]));

const now = Date.now();
const isDue = (id) => {
  const s = state.get(id);
  if (!s.seen) return false;
  return (now - Date.parse(s.lastSeen)) >= (BOX_INTERVAL_DAYS[s.box] ?? 16) * 86400000;
};

const groupOf = new Map();
CONFUSABLE.forEach((g, gi) => g.forEach(id => groupOf.set(id, gi)));

// ---- pick NEW: unseen invariant/derivable by rank, pulling in confusable partners ----
const picked = new Set();
const newCards = [];
const addNew = (w) => { if (w && !picked.has(w.bare)) { picked.add(w.bare); newCards.push(w); } };
const candidates = words
  .filter(w => !state.get(w.bare).seen && (w.type === 'invariant' || w.type === 'derivable'))
  .sort((a, b) => a.rank - b.rank);
for (const w of candidates) {
  if (newCards.length >= NEW_PER_SESSION) break;
  addNew(w);
  const gi = groupOf.get(w.bare);
  if (gi != null) for (const id of CONFUSABLE[gi]) if (!state.get(id)?.seen) addNew(byId.get(id));
}

// ---- due cards ----
const dueCards = words.filter(w => isDue(w.bare)).sort((a, b) => a.rank - b.rank);

// ---- assemble, cap, then contrastive ordering (group members adjacent) ----
const pool = [...dueCards, ...newCards].slice(0, MAX_SESSION).sort((a, b) => a.rank - b.rank);
const inSession = new Set(pool.map(w => w.bare));
const ordered = [];
const seenOut = new Set();
const emitted = new Set();
for (const w of pool) {
  if (seenOut.has(w.bare)) continue;
  const gi = groupOf.get(w.bare);
  if (gi != null && !emitted.has(gi)) {
    emitted.add(gi);
    for (const id of CONFUSABLE[gi]) if (inSession.has(id) && !seenOut.has(id)) { ordered.push(byId.get(id)); seenOut.add(id); }
  } else if (gi == null) { ordered.push(w); seenOut.add(w.bare); }
}

// ---- multiple-choice distractors: prefer confusable siblings, then same type ----
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function distractorsFor(w, n = 3) {
  const sibs = [];
  const gi = groupOf.get(w.bare);
  if (gi != null) for (const id of CONFUSABLE[gi]) { const s = byId.get(id); if (s && s.bare !== w.bare) sibs.push(s.gloss); }
  const sameType = shuffle(words.filter(x => x.bare !== w.bare && x.type === w.type).map(x => x.gloss));
  const any = shuffle(words.filter(x => x.bare !== w.bare).map(x => x.gloss));
  const out = [], seen = new Set([w.gloss]);
  for (const g of [...sibs, ...sameType, ...any]) { if (out.length >= n) break; if (!seen.has(g)) { seen.add(g); out.push(g); } }
  return out;
}

const cards = ordered.map(w => ({
  id: w.bare, bare: w.bare, niqqud: w.niqqud, translit: w.translit,
  gloss: w.gloss, frame: w.frame ?? null, distractors: distractorsFor(w),
  box: state.get(w.bare).box, isNew: !state.get(w.bare).seen,
}));

const session = {
  sessionId: new Date().toISOString().replace(/[:.]/g, '-'),
  generatedAt: new Date().toISOString(),
  newCount: cards.filter(c => c.isNew).length,
  dueCount: cards.filter(c => !c.isNew).length,
  cards,
};
writeFileSync(OUT, `window.__SESSION = ${JSON.stringify(session, null, 2)};\n`);

// ---- report ----
console.log(`session → ${cards.length} cards  (${session.newCount} new, ${session.dueCount} due)\n`);
console.log(cards.map((c, i) =>
  `${String(i + 1).padStart(2)}. ${c.bare.padEnd(6)} ${c.translit.padEnd(14)} ${c.gloss}` +
  (c.isNew ? '  ·new' : `  ·box${c.box}`)).join('\n'));
console.log(`\nwrote ${OUT}`);
