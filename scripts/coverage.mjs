#!/usr/bin/env node
// Score a Hebrew text for the learner's reading level: % of tokens known + the new words.
// Known = words demonstrated correct in reviews ∪ glossed lexicon ∪ top-frequency core.
// Peels the single-letter prefixes the learner already owns (ו ה ב ל כ מ ש) + את.
// Usage: node coverage.mjs <textfile>     (or pipe text on stdin)
import fs from 'node:fs';
const ROOT = '/Users/dlesky/hebrew';

const words = JSON.parse(fs.readFileSync(`${ROOT}/data/words.json`, 'utf8')).words;
const glossOf = new Map(words.map(w => [w.bare, w.gloss]));
const events = fs.readFileSync(`${ROOT}/data/reviews.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const freq = fs.readFileSync(`${ROOT}/data/he_full.txt`, 'utf8').split('\n').map(l => l.split(' ')[0]);
const rankOf = new Map(); freq.forEach((w, i) => { if (!rankOf.has(w)) rankOf.set(w, i + 1); });

// known vocabulary
const known = new Set();
for (const w of words) known.add(w.bare);                          // everything we've glossed
for (const e of events) if (e.grade === 'good') known.add(e.id);    // demonstrated correct
for (let i = 0; i < 250; i++) known.add(freq[i]);                   // assumed high-frequency core

const PREF = new Set([...'והבלכמש']);
function candidates(t) {
  const out = [t];
  if (PREF.has(t[0])) out.push(t.slice(1));
  if (PREF.has(t[0]) && PREF.has(t[1])) out.push(t.slice(2));
  if (t.startsWith('את')) out.push(t.slice(2));
  return out;
}
const isKnown = (t) => candidates(t).some(c => c.length >= 1 && known.has(c));

const text = fs.readFileSync(process.argv[2] || 0, 'utf8');
const toks = text.replace(/[^א-ת]+/g, ' ').trim().split(/\s+/).filter(t => t.length >= 2);
let knownN = 0; const unknown = new Map();
for (const t of toks) { if (isKnown(t)) knownN++; else unknown.set(t, (unknown.get(t) || 0) + 1); }

const cov = toks.length ? Math.round(knownN / toks.length * 100) : 0;
console.log(`tokens: ${toks.length} | known: ${knownN} | coverage: ${cov}%`);
const band = cov >= 95 ? 'easy (drillable / i+1)' : cov >= 85 ? 'i+1 sweet spot — a few new words' : cov >= 70 ? 'stretch' : 'too hard for now';
console.log(`level: ${band}\n`);
const sorted = [...unknown].sort((a, b) => b[1] - a[1]);
console.log(`new/unknown words (${unknown.size} distinct), by count in text:`);
for (const [w, n] of sorted.slice(0, 30)) {
  const r = rankOf.get(w); const g = glossOf.get(w);
  console.log(`  ${String(n).padStart(2)}× ${w.padEnd(12)} ${r ? `freq#${r}`.padEnd(10) : 'rare/infl '.padEnd(10)} ${g ? '— ' + g : ''}`);
}
