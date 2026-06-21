#!/usr/bin/env node
// Lay the latest drilled session on a confidence axis: least confident (left) -> most (right).
// Confidence signal = where on the wide button you clicked (0 = far left, 1 = far right).
// Self-rated confidence drives the ordering; ✓/✗ shows whether you were actually right.
import fs from 'node:fs';
const ROOT = '/Users/dlesky/hebrew';
const REVIEWS = `${ROOT}/data/reviews.jsonl`;
const chunks = JSON.parse(fs.readFileSync(`${ROOT}/data/chunks.json`, 'utf8')).chunks;
const words = JSON.parse(fs.readFileSync(`${ROOT}/data/words.json`, 'utf8')).words;
const glossOf = new Map([...words.map(w => [w.bare, w.gloss]), ...chunks.map(c => [c.text, c.gloss])]);
const AFK_MS = 60000; // longer than this = walked away; time is noise

const events = fs.readFileSync(REVIEWS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
if (!events.length) { console.log('no events'); process.exit(0); }

// latest session = the one whose newest event is newest overall.
const newest = new Map();
for (const e of events) {
  const cur = newest.get(e.session);
  if (!cur || Date.parse(e.t) > Date.parse(cur)) newest.set(e.session, e.t);
}
const sid = [...newest].sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))[0][0];
const rows = events.filter(e => e.session === sid);

// confidence axis = the click position. unknown (keyboard) sorts leftmost.
const score = (e) => typeof e.confidence === 'number' ? e.confidence : -1;
rows.sort((a, b) => score(a) - score(b)); // ascending: least confident first (left)

const fmt = (e) => {
  const g = glossOf.get(e.id) ?? '?';
  const mark = e.grade === 'again' ? '✗' : '✓';
  const conf = typeof e.confidence === 'number' ? `${Math.round(e.confidence * 100)}%` : '—';
  const ms = typeof e.tookMs !== 'number' ? '—' : (e.tookMs > AFK_MS ? 'afk' : `${e.tookMs}ms`);
  return { id: e.id, g, mark, conf, ms };
};
const f = rows.map(fmt);

console.log(`session ${sid}  ·  ${rows.length} cards`);
console.log('\n  ← least confident                                       most confident →\n');
// horizontal strip of glosses (English, LTR-clean). ✗ = answered wrong.
const strip = f.map(x => `${x.mark}${x.g}`).join('   ·   ');
console.log('  ' + strip + '\n');
// detail, least confident at top. confidently-wrong (✗ with high conf) is the row to watch.
console.log('  ' + 'gloss'.padEnd(28) + ' conf    time   chunk');
for (const x of f) console.log('  ' + `${x.mark} ${x.g}`.padEnd(28) + `${x.conf.padStart(4)}  ${x.ms.padStart(6)}   ${x.id}`);
