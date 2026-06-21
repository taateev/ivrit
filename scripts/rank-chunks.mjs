#!/usr/bin/env node
// Deterministic master ranking of all chunks (bi+tri) by corpus frequency.
// Writes the full ranked list, and prints the next batch not yet glossed in chunks.json.
import fs from 'node:fs';
const ROOT = '/Users/dlesky/hebrew';
const lines = fs.readFileSync(`${ROOT}/data/os_sample.txt`, 'utf8').split('\n');
const toks = (l) => l.replace(/[^א-ת]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const ok = (t) => t.length >= 2;

const bi = new Map(), tri = new Map();
const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);
for (const line of lines) {
  const t = toks(line);
  for (let i = 0; i < t.length; i++) {
    if (i + 1 < t.length && ok(t[i]) && ok(t[i + 1])) inc(bi, t[i] + ' ' + t[i + 1]);
    if (i + 2 < t.length && ok(t[i]) && ok(t[i + 1]) && ok(t[i + 2])) inc(tri, t[i] + ' ' + t[i + 1] + ' ' + t[i + 2]);
  }
}
// merge, rank by frequency (deterministic; tie-break alphabetical for stability)
const ranked = [
  ...[...bi].map(([k, c]) => ({ text: k, n: 2, freq: c })),
  ...[...tri].map(([k, c]) => ({ text: k, n: 3, freq: c })),
].filter(x => x.freq >= 200).sort((a, b) => b.freq - a.freq || a.text.localeCompare(b.text));

fs.writeFileSync(`${ROOT}/data/chunks_ranked.tsv`,
  'text\tn\tfreq\n' + ranked.map(x => `${x.text}\t${x.n}\t${x.freq}`).join('\n') + '\n');

const glossed = new Set(JSON.parse(fs.readFileSync(`${ROOT}/data/chunks.json`, 'utf8')).chunks.map(c => c.text));
const next = ranked.filter(x => !glossed.has(x.text)).slice(0, 30);
console.log(`master list: ${ranked.length} chunks (freq>=200) -> data/chunks_ranked.tsv`);
console.log(`already glossed: ${glossed.size}\n=== NEXT 30 BY FREQUENCY (to gloss) ===`);
for (const x of next) console.log(`${String(x.freq).padStart(6)}  n${x.n}  ${x.text}`);
