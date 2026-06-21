#!/usr/bin/env node
// Build a drill session straight from chunks.json (bigrams/trigrams), no word ceremony.
// Same Leitner fold over reviews.jsonl; distractors are other chunk glosses.
import fs from 'node:fs';
const ROOT = '/Users/dlesky/hebrew';
const chunks = JSON.parse(fs.readFileSync(`${ROOT}/data/chunks.json`, 'utf8')).chunks;
const REVIEWS = `${ROOT}/data/reviews.jsonl`;
const events = fs.existsSync(REVIEWS)
  ? fs.readFileSync(REVIEWS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

const NEW_PER_SESSION = 30, MAX_SESSION = 35;
const BOX_INTERVAL_DAYS = [0, 1, 2, 4, 8, 16];

const evById = new Map();
for (const e of events) (evById.get(e.id) ?? evById.set(e.id, []).get(e.id)).push(e);
function fold(evs) {
  evs = [...evs].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  let b = 1;
  const missedSession = new Set();
  for (const e of evs) {
    if (e.grade === 'again') { b = 1; missedSession.add(e.session); }
    else if (e.peeked) {}
    else if (e.grade === 'good') b = (typeof e.confidence === 'number' && e.confidence >= 0.8 && !missedSession.has(e.session)) ? 5 : Math.min(5, b + 1);
    else if (e.grade === 'easy') b = Math.min(5, b + 2);
  }
  return { box: b, lastSeen: evs.at(-1)?.t ?? null, seen: evs.length > 0 };
}
const state = new Map(chunks.map(c => [c.text, fold(evById.get(c.text) ?? [])]));
const now = Date.now();
const isDue = (t) => {
  const s = state.get(t);
  return s.seen && (now - Date.parse(s.lastSeen)) >= (BOX_INTERVAL_DAYS[s.box] ?? 16) * 86400000;
};

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function distractors(c, n = 3) {
  const pool = shuffle(chunks.filter(x => x.text !== c.text && x.gloss !== c.gloss).map(x => x.gloss));
  const out = [], seen = new Set([c.gloss]);
  for (const g of pool) { if (out.length >= n) break; if (!seen.has(g)) { seen.add(g); out.push(g); } }
  return out;
}

const due = chunks.filter(c => isDue(c.text)).sort((a, b) => b.freq - a.freq);
const fresh = chunks.filter(c => !state.get(c.text).seen).sort((a, b) => b.freq - a.freq).slice(0, NEW_PER_SESSION);
const pool = [...due, ...fresh].slice(0, MAX_SESSION);

const cards = pool.map(c => ({
  id: c.text, bare: c.text, niqqud: c.niqqud, translit: c.translit, gloss: c.gloss,
  distractors: distractors(c), phrase: true, box: state.get(c.text).box, isNew: !state.get(c.text).seen,
}));

const session = {
  sessionId: new Date().toISOString().replace(/[:.]/g, '-'), generatedAt: new Date().toISOString(),
  mode: 'chunks', newCount: cards.filter(c => c.isNew).length, dueCount: cards.filter(c => !c.isNew).length, cards,
};
fs.writeFileSync(`${ROOT}/data/session.js`, `window.__SESSION = ${JSON.stringify(session, null, 2)};\n`);

console.log(`chunk session → ${cards.length} cards (${session.newCount} new, ${session.dueCount} due)\n`);
console.log(cards.map((c, i) => `${String(i + 1).padStart(2)}. ${c.bare.padEnd(18)} — ${c.gloss}`).join('\n'));
