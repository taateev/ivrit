#!/usr/bin/env node
// Find readable real example sentences from the OpenSubtitles corpus for given target words.
// A sentence is good when the target appears and (nearly) everything else is already known —
// an i+1 example. Prints the top few candidates per word for the coach to hand-pick + translate.
// Usage: node mine-examples.mjs <word> [word ...]
import fs from 'node:fs';
const ROOT = '/Users/dlesky/hebrew';
const targets = process.argv.slice(2);
const tgtSet = new Set(targets);

const words = JSON.parse(fs.readFileSync(`${ROOT}/data/words.json`, 'utf8')).words;
const freq = fs.readFileSync(`${ROOT}/data/he_full.txt`, 'utf8').split('\n').map(l => l.split(' ')[0]);
const known = new Set();
for (const w of words) known.add(w.bare);
for (let i = 0; i < 2500; i++) known.add(freq[i]);
for (const t of targets) known.add(t);                 // the target itself doesn't count as "unknown"

const PFX = new Set([...'והבלכמש']);
const peel = (t) => { const o = [t]; if (PFX.has(t[0])) o.push(t.slice(1)); if (PFX.has(t[0]) && PFX.has(t[1])) o.push(t.slice(2)); if (t.startsWith('את')) o.push(t.slice(2)); return o; };
const isKnown = (t) => peel(t).some(c => c.length >= 1 && known.has(c));
const toks = (s) => s.replace(/[^א-ת]+/g, ' ').trim().split(/\s+/).filter(t => t.length >= 2 && t.length <= 11);
const hitsTarget = (token) => peel(token).find(c => tgtSet.has(c));

const cand = new Map(targets.map(t => [t, []]));
const lines = fs.readFileSync(`${ROOT}/data/os_sample.txt`, 'utf8').split('\n');
for (const raw of lines) {
  const line = raw.trim();
  if (!line) continue;
  const tk = toks(line);
  if (tk.length < 4 || tk.length > 11) continue;
  let tgt = null;
  for (const token of tk) { const h = hitsTarget(token); if (h) { tgt = h; break; } }
  if (!tgt) continue;
  const knownN = tk.filter(isKnown).length;
  const cov = knownN / tk.length;
  if (cov < 0.78) continue;
  const arr = cand.get(tgt);
  arr.push({ line, cov, n: tk.length });
}
for (const t of targets) {
  const arr = cand.get(t).sort((a, b) => b.cov - a.cov || a.n - b.n);
  // dedupe identical lines, keep top 4
  const seen = new Set(), top = [];
  for (const c of arr) { if (seen.has(c.line)) continue; seen.add(c.line); top.push(c); if (top.length >= 4) break; }
  console.log(`\n### ${t}  (${cand.get(t).length} candidates)`);
  for (const c of top) console.log(`  [${Math.round(c.cov * 100)}%] ${c.line}`);
}
