#!/usr/bin/env node
// Serve frontier vocabulary (single content words) by corpus frequency.
// Confidence-based retirement: a word you click >=80% sure AND get right jumps to the
// top box (16-day shelf) instead of cycling back the next day. The drill self-prunes.
import fs from 'node:fs';
const ROOT = '/Users/dlesky/hebrew';
const words = JSON.parse(fs.readFileSync(`${ROOT}/data/words.json`, 'utf8')).words;
const REVIEWS = `${ROOT}/data/reviews.jsonl`;
const events = fs.existsSync(REVIEWS)
  ? fs.readFileSync(REVIEWS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

const NEW_PER_SESSION = 30, MAX_SESSION = 35;
const FRONTIER_MIN = 81;       // ranks below this are your known core; don't re-teach them
const CONF_RETIRE = 0.8;       // clicked this sure + correct -> shelve it
const BOX_INTERVAL_DAYS = [0, 1, 2, 4, 8, 16];

const evById = new Map();
for (const e of events) { if (!evById.has(e.id)) evById.set(e.id, []); evById.get(e.id).push(e); }

// Notes: user notes ride along in review events (e.note); coach enrichments live in notes.json.
// They surface on a card behind the `n` toggle the next time the word appears.
const NOTES = `${ROOT}/data/notes.json`;
const coachNotes = fs.existsSync(NOTES) ? (JSON.parse(fs.readFileSync(NOTES, 'utf8')).notes || {}) : {};
function notesFor(id) {
  const user = (evById.get(id) ?? []).filter(e => e.note).map(e => ({ by: 'user', text: e.note, t: e.t }));
  const coach = (coachNotes[id] ?? []).map(n => ({ by: 'coach', text: n.text, t: n.t }));
  return [...user, ...coach].sort((a, b) => Date.parse(a.t || 0) - Date.parse(b.t || 0));
}

function fold(evs) {
  evs = [...evs].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  let box = 1;
  const missedSession = new Set();   // sessions where this id was missed
  for (const e of evs) {
    if (e.grade === 'again') { box = 1; missedSession.add(e.session); }   // missed -> back to soon
    else if (e.grade === 'good') {
      const freshMiss = missedSession.has(e.session);  // a post-reveal requeue answer isn't durable
      if (typeof e.confidence === 'number' && e.confidence >= CONF_RETIRE && !freshMiss) box = 5; // knew it cold -> shelve
      else box = Math.min(5, box + 1);                                // unsure / just-missed -> creep up
    }
  }
  return { box, lastSeen: evs.at(-1)?.t ?? null, seen: evs.length > 0 };
}
const state = new Map(words.map(w => [w.bare, fold(evById.get(w.bare) ?? [])]));
const now = Date.now();
const isDue = (id) => {
  const s = state.get(id);
  return s.seen && (now - Date.parse(s.lastSeen)) >= (BOX_INTERVAL_DAYS[s.box] ?? 16) * 86400000;
};

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function distractors(w, n = 3) {
  const pool = shuffle(words.filter(x => x.bare !== w.bare && x.gloss !== w.gloss).map(x => x.gloss));
  const out = [], seen = new Set([w.gloss]);
  for (const g of pool) { if (out.length >= n) break; if (!seen.has(g)) { seen.add(g); out.push(g); } }
  return out;
}

// Known core (rank < FRONTIER_MIN) is never re-served, even if an old session left it "due".
const due = words.filter(w => w.rank >= FRONTIER_MIN && isDue(w.bare)).sort((a, b) => a.rank - b.rank);
const fresh = words.filter(w => !state.get(w.bare).seen && w.rank >= FRONTIER_MIN)
  .sort((a, b) => a.rank - b.rank).slice(0, NEW_PER_SESSION);
const pool = [...due, ...fresh].slice(0, MAX_SESSION);

const cards = pool.map(w => ({
  id: w.bare, bare: w.bare, niqqud: w.niqqud, translit: w.translit, gloss: w.gloss,
  shoresh: w.shoresh ?? null, grammar: w.grammar ?? null, examples: w.examples ?? [],
  distractors: distractors(w), phrase: false, box: state.get(w.bare).box, isNew: !state.get(w.bare).seen,
  notes: notesFor(w.bare),
}));

const session = {
  sessionId: new Date().toISOString().replace(/[:.]/g, '-'), generatedAt: new Date().toISOString(),
  mode: 'words', newCount: cards.filter(c => c.isNew).length, dueCount: cards.filter(c => !c.isNew).length, cards,
};
fs.writeFileSync(`${ROOT}/data/session.js`, `window.__SESSION = ${JSON.stringify(session, null, 2)};\n`);

console.log(`word session → ${cards.length} cards (${session.newCount} new, ${session.dueCount} due)\n`);
console.log(cards.map((c, i) => `${String(i + 1).padStart(2)}. ${c.bare.padEnd(10)} — ${c.gloss}`).join('\n'));
