#!/usr/bin/env node
// Compute high-yield Hebrew bigrams/trigrams from the OpenSubtitles sample.
import fs from 'node:fs';
const lines = fs.readFileSync('data/os_sample.txt', 'utf8').split('\n');

// keep only Hebrew-letter runs (strips punctuation, latin, digits, dashes)
const toks = (line) => line.replace(/[^א-ת]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const ok = (t) => t.length >= 2; // drop stray single letters (orphan prefixes)

const uni = new Map(), bi = new Map(), tri = new Map();
let N = 0;
const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);

for (const line of lines) {
  const t = toks(line);
  for (let i = 0; i < t.length; i++) {
    if (ok(t[i])) { inc(uni, t[i]); N++; }
    if (i + 1 < t.length && ok(t[i]) && ok(t[i + 1])) inc(bi, t[i] + ' ' + t[i + 1]);
    if (i + 2 < t.length && ok(t[i]) && ok(t[i + 1]) && ok(t[i + 2])) inc(tri, t[i] + ' ' + t[i + 1] + ' ' + t[i + 2]);
  }
}
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

console.log(`tokens ${N.toLocaleString()} | uni ${uni.size.toLocaleString()} | bi ${bi.size.toLocaleString()} | tri ${tri.size.toLocaleString()}`);

console.log('\n===== TOP 45 BIGRAMS (raw frequency = highest coverage) =====');
for (const [k, c] of top(bi, 45)) console.log(String(c).padStart(7), k);

console.log('\n===== TOP 40 TRIGRAMS (raw frequency) =====');
for (const [k, c] of top(tri, 40)) console.log(String(c).padStart(7), k);

console.log('\n===== TOP 30 BIGRAMS by PMI (min count 250 = sticky collocations / idioms) =====');
const pmi = [];
for (const [k, c] of bi) {
  if (c < 250) continue;
  const [a, b] = k.split(' ');
  const p = Math.log2((c / N) / ((uni.get(a) / N) * (uni.get(b) / N)));
  pmi.push([k, c, p]);
}
pmi.sort((x, y) => y[2] - x[2]);
for (const [k, c, p] of pmi.slice(0, 30)) console.log(`pmi ${p.toFixed(1).padStart(5)}  c=${String(c).padStart(5)}  ${k}`);
