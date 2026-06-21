#!/usr/bin/env node
// Scan a YouTube json3 caption file: overall coverage, most-comprehensible (i+1) windows,
// and a word→timestamp index for the learner's lexicon. Usage: node yt-scan.mjs <json3> <videoId>
import fs from 'node:fs';
const ROOT = '/Users/dlesky/hebrew';
const file = process.argv[2], vid = process.argv[3] || '';

const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const lines = [];
for (const e of (j.events || [])) {
  if (!e.segs) continue;
  const text = e.segs.map(s => s.utf8 || '').join('').replace(/\s+/g, ' ').trim();
  if (text) lines.push({ t: Math.round((e.tStartMs || 0) / 1000), text });
}

const words = JSON.parse(fs.readFileSync(`${ROOT}/data/words.json`, 'utf8')).words;
const glossOf = new Map(words.map(w => [w.bare, w.gloss]));
const lex = new Set(words.filter(w => w.rank >= 81).map(w => w.bare));
const events = fs.readFileSync(`${ROOT}/data/reviews.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const freq = fs.readFileSync(`${ROOT}/data/he_full.txt`, 'utf8').split('\n').map(l => l.split(' ')[0]);
const known = new Set();
for (const w of words) known.add(w.bare);
for (const e of events) if (e.grade === 'good') known.add(e.id);
for (let i = 0; i < 250; i++) known.add(freq[i]);

const PREF = new Set([...'והבלכמש']);
const cands = (t) => { const o = [t]; if (PREF.has(t[0])) o.push(t.slice(1)); if (PREF.has(t[0]) && PREF.has(t[1])) o.push(t.slice(2)); if (t.startsWith('את')) o.push(t.slice(2)); return o; };
const isKnown = (t) => cands(t).some(c => c.length >= 1 && known.has(c));
const toks = (s) => s.replace(/[^א-ת]+/g, ' ').trim().split(/\s+/).filter(t => t.length >= 2);
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

let allTok = 0, allKnown = 0;
for (const l of lines) for (const t of toks(l.text)) { allTok++; if (isKnown(t)) allKnown++; }
console.log(`video ${vid} | lines: ${lines.length} | tokens: ${allTok} | OVERALL coverage: ${Math.round(allKnown / allTok * 100)}%`);
const dur = lines.length ? lines.at(-1).t : 0; console.log(`length: ~${fmt(dur)}\n`);

// merge lines into ~30s windows
const windows = []; let cur = null;
for (const l of lines) {
  if (!cur) { cur = { start: l.t, text: l.text }; continue; }
  if (l.t - cur.start <= 30) cur.text += ' ' + l.text;
  else { windows.push(cur); cur = { start: l.t, text: l.text }; }
}
if (cur) windows.push(cur);
for (const w of windows) { const tk = toks(w.text); w.tok = tk.length; w.cov = tk.length ? tk.filter(isKnown).length / tk.length : 0; w.newWords = [...new Set(tk.filter(t => !isKnown(t)))]; }
const good = windows.filter(w => w.tok >= 6 && w.cov >= 0.8).sort((a, b) => b.cov - a.cov);
console.log(`=== most comprehensible windows (≥80% known) : ${good.length} of ${windows.length} ===`);
for (const w of good.slice(0, 10)) {
  console.log(`[${fmt(w.start)}] ${Math.round(w.cov * 100)}%  ${w.text.slice(0, 64)}`);
  console.log(`   new: ${w.newWords.slice(0, 6).join(' ') || '—'}   ▶ https://youtu.be/${vid}?t=${w.start}`);
}

const hits = new Map();
for (const l of lines) for (const t of toks(l.text)) for (const c of cands(t)) if (lex.has(c)) {
  if (!hits.has(c)) hits.set(c, []); if (hits.get(c).length < 3) hits.get(c).push(l.t);
}
console.log(`\n=== your lexicon words spoken here (word → timestamps) : ${hits.size} found ===`);
for (const [w, ts] of [...hits].sort((a, b) => b[1].length - a[1].length).slice(0, 22))
  console.log(`  ${w.padEnd(9)} ${('(' + (glossOf.get(w) || '') + ')').padEnd(30)} ${ts.map(fmt).join(', ')}`);
