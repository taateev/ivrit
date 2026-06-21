#!/usr/bin/env node
// Preview the consolidation/review pool: every SEEN word still in active rotation (box < 5,
// i.e. not yet shelved), ignoring exact due-timing. This is what spaced review will keep serving.
import fs from 'node:fs';
const ROOT = '/Users/dlesky/hebrew';
const words = JSON.parse(fs.readFileSync(`${ROOT}/data/words.json`, 'utf8')).words;
const events = fs.readFileSync(`${ROOT}/data/reviews.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const NOTES = `${ROOT}/data/notes.json`;
const coachNotes = fs.existsSync(NOTES) ? (JSON.parse(fs.readFileSync(NOTES, 'utf8')).notes || {}) : {};
const CONF_RETIRE = 0.8;

const evById = new Map();
for (const e of events) { if (!evById.has(e.id)) evById.set(e.id, []); evById.get(e.id).push(e); }
function fold(evs) {
  evs = [...evs].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  let box = 1; const missed = new Set();
  for (const e of evs) {
    if (e.grade === 'again') { box = 1; missed.add(e.session); }
    else if (e.grade === 'good') box = (typeof e.confidence === 'number' && e.confidence >= CONF_RETIRE && !missed.has(e.session)) ? 5 : Math.min(5, box + 1);
  }
  return { box, seen: evs.length > 0 };
}
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function distractors(w, n = 3) {
  const pool = shuffle(words.filter(x => x.bare !== w.bare && x.gloss !== w.gloss).map(x => x.gloss));
  const out = [], seen = new Set([w.gloss]);
  for (const g of pool) { if (out.length >= n) break; if (!seen.has(g)) { seen.add(g); out.push(g); } }
  return out;
}
function notesFor(id) {
  const user = (evById.get(id) ?? []).filter(e => e.note).map(e => ({ by: 'user', text: e.note, t: e.t }));
  const coach = (coachNotes[id] ?? []).map(nn => ({ by: 'coach', text: nn.text, t: nn.t }));
  return [...user, ...coach].sort((a, b) => Date.parse(a.t || 0) - Date.parse(b.t || 0));
}

const state = new Map(words.map(w => [w.bare, fold(evById.get(w.bare) ?? [])]));
const pool = words.filter(w => w.rank >= 81 && state.get(w.bare).seen && state.get(w.bare).box < 5)
  .sort((a, b) => state.get(a.bare).box - state.get(b.bare).box || a.rank - b.rank);

// box distribution across all seen frontier words
const dist = {}; for (const w of words) { if (w.rank >= 81 && state.get(w.bare).seen) { const b = state.get(w.bare).box; dist[b] = (dist[b] || 0) + 1; } }
console.error(`box distribution (seen frontier): ${Object.entries(dist).sort().map(([b, n]) => `box${b}:${n}`).join('  ')}`);
console.error(`review pool (box<5, the keepers): ${pool.length} words`);
console.error(pool.map((w, i) => `${String(i + 1).padStart(2)}. box${state.get(w.bare).box} ${w.bare.padEnd(9)} ${w.gloss}`).join('\n'));

const cards = pool.map(w => ({
  id: w.bare, bare: w.bare, niqqud: w.niqqud, translit: w.translit, gloss: w.gloss,
  shoresh: w.shoresh ?? null, grammar: w.grammar ?? null, examples: w.examples ?? [],
  distractors: distractors(w), phrase: false, box: state.get(w.bare).box, isNew: false, notes: notesFor(w.bare),
}));
const session = {
  sessionId: 'review-preview', generatedAt: '2026-06-21', mode: 'review',
  newCount: 0, dueCount: cards.length, cards,
};
fs.writeFileSync(`${ROOT}/data/session.js`, `window.__SESSION = ${JSON.stringify(session, null, 2)};\n`);
console.error(`\nwrote ${cards.length}-card review session → data/session.js (hard-reload to drill)`);
