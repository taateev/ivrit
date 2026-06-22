#!/usr/bin/env node
// Build a fixed-size match batch for the game/drill: fresh frontier words first, then top up
// with the least-learned seen words (early review) when new words run low. Writes data/session.js.
// Usage: node batch.mjs [size=10] [sessionId=batch]
import fs from 'node:fs';
const ROOT = '/Users/dlesky/hebrew';
const SIZE = parseInt(process.argv[2] || '10', 10);
const SID = process.argv[3] || 'batch';
const MODE = (process.argv[4] || 'new').toLowerCase();   // 'new' = fresh first; 'review' = due/shaky first

const words = JSON.parse(fs.readFileSync(`${ROOT}/data/words.json`, 'utf8')).words;
const events = fs.existsSync(`${ROOT}/data/reviews.jsonl`)
  ? fs.readFileSync(`${ROOT}/data/reviews.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const FRONTIER_MIN = 81, CONF_RETIRE = 0.8;

const evById = new Map();
for (const e of events) { if (!evById.has(e.id)) evById.set(e.id, []); evById.get(e.id).push(e); }
const NOTES = `${ROOT}/data/notes.json`;
const coachNotes = fs.existsSync(NOTES) ? (JSON.parse(fs.readFileSync(NOTES, 'utf8')).notes || {}) : {};
function notesFor(id) {
  const user = (evById.get(id) ?? []).filter(e => e.note).map(e => ({ by: 'user', text: e.note, t: e.t }));
  const coach = (coachNotes[id] ?? []).map(n => ({ by: 'coach', text: n.text, t: n.t }));
  return [...user, ...coach].sort((a, b) => Date.parse(a.t || 0) - Date.parse(b.t || 0));
}
// same Leitner fold as prep.mjs
function fold(evs) {
  evs = [...evs].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  let box = 1; const missed = new Set();
  for (const e of evs) {
    if (e.grade === 'again') { box = 1; missed.add(e.session); }
    else if (e.grade === 'good') {
      const fm = missed.has(e.session);
      if (typeof e.confidence === 'number' && e.confidence >= CONF_RETIRE && !fm) box = 5;
      else box = Math.min(5, box + 1);
    }
  }
  return { box, lastSeen: evs.at(-1)?.t ?? null, seen: evs.length > 0 };
}
const state = new Map(words.map(w => [w.bare, fold(evById.get(w.bare) ?? [])]));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function distractors(w, n = 3) {
  const pool = shuffle(words.filter(x => x.bare !== w.bare && x.gloss !== w.gloss).map(x => x.gloss));
  const out = [], seen = new Set([w.gloss]);
  for (const g of pool) { if (out.length >= n) break; if (!seen.has(g)) { seen.add(g); out.push(g); } }
  return out;
}

const frontier = words.filter(w => w.rank >= FRONTIER_MIN);
const fresh = frontier.filter(w => !state.get(w.bare).seen).sort((a, b) => a.rank - b.rank);
const review = frontier.filter(w => state.get(w.bare).seen && state.get(w.bare).box < 5)
  .sort((a, b) => state.get(a.bare).box - state.get(b.bare).box
    || Date.parse(state.get(a.bare).lastSeen) - Date.parse(state.get(b.bare).lastSeen));

const pick = [];
const order = MODE === 'review' ? [review, fresh] : [fresh, review];   // review mode: shaky words first
for (const grp of order) for (const w of grp) { if (pick.length >= SIZE) break; if (!pick.includes(w)) pick.push(w); }
if (pick.length < SIZE)  // still short: light review of any seen frontier word, by rank
  for (const w of frontier.filter(w => state.get(w.bare).seen).sort((a, b) => a.rank - b.rank)) {
    if (pick.length >= SIZE) break; if (!pick.includes(w)) pick.push(w);
  }

const cards = pick.map(w => ({
  id: w.bare, bare: w.bare, niqqud: w.niqqud, translit: w.translit, gloss: w.gloss,
  shoresh: w.shoresh ?? null, grammar: w.grammar ?? null, examples: w.examples ?? [],
  distractors: distractors(w), phrase: false, box: state.get(w.bare).box, isNew: !state.get(w.bare).seen,
  notes: notesFor(w.bare),
}));
const session = {
  sessionId: SID, generatedAt: new Date().toISOString(), mode: MODE === 'review' ? 'review' : 'match',
  newCount: cards.filter(c => c.isNew).length, dueCount: cards.filter(c => !c.isNew).length, cards,
};
fs.writeFileSync(`${ROOT}/data/session.js`, `window.__SESSION = ${JSON.stringify(session, null, 2)};\n`);
console.log(`${SID}: ${cards.length} cards (${session.newCount} new, ${session.dueCount} review) · fresh pool left after this: ${Math.max(0, fresh.length - session.newCount)}`);
console.log(cards.map((c, i) => `${String(i + 1).padStart(2)}. ${c.bare.padEnd(10)} ${c.isNew ? 'NEW ' : 'rev '} — ${c.gloss}`).join('\n'));
