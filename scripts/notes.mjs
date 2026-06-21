#!/usr/bin/env node
// List all notes per word (user notes from reviews.jsonl + coach notes from notes.json).
// Flags words that have a user note but no coach enrichment yet — the queue for me to answer.
import fs from 'node:fs';
const ROOT = '/Users/dlesky/hebrew';
const events = fs.existsSync(`${ROOT}/data/reviews.jsonl`)
  ? fs.readFileSync(`${ROOT}/data/reviews.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const coach = JSON.parse(fs.readFileSync(`${ROOT}/data/notes.json`, 'utf8')).notes || {};
const words = JSON.parse(fs.readFileSync(`${ROOT}/data/words.json`, 'utf8')).words;
const glossOf = new Map(words.map(w => [w.bare, w.gloss]));

const userByWord = new Map();
for (const e of events) if (e.note) { if (!userByWord.has(e.id)) userByWord.set(e.id, []); userByWord.get(e.id).push(e); }

const ids = new Set([...userByWord.keys(), ...Object.keys(coach)]);
if (!ids.size) { console.log('no notes yet'); process.exit(0); }

let needEnrich = 0;
for (const id of ids) {
  const u = userByWord.get(id) ?? [], c = coach[id] ?? [];
  const pending = u.length && !c.length;
  if (pending) needEnrich++;
  console.log(`\n${id}  ${glossOf.get(id) ? '— ' + glossOf.get(id) : ''}${pending ? '   ⟵ needs coach reply' : ''}`);
  for (const e of u) console.log(`  you:   ${e.note}`);
  for (const n of c) console.log(`  coach: ${n.text}`);
}
console.log(`\n${ids.size} word(s) with notes · ${needEnrich} awaiting coach enrichment`);
