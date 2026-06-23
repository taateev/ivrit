#!/usr/bin/env node
// Generate themed interlocking Hebrew crosswords → data/crosswords.json
//   { index: [{id,title,words,variants:[id...]}], puzzles: { id: {id,title,rows,cols,entries:[...]} } }
// RTL across (letter[0] = rightmost). Most themes = 1 puzzle; "verbs" = 4 variants, each a random
// sample of one inflected form per verb (paradigm trainer). Points scale w/ rarity+length.
import fs from 'node:fs';
const ROOT = '/Users/dlesky/hebrew';
const words = JSON.parse(fs.readFileSync(`${ROOT}/data/words.json`, 'utf8')).words;
const byBare = new Map(words.map(w => [w.bare, w]));
const THEMES = JSON.parse(fs.readFileSync(`${ROOT}/data/themes.json`, 'utf8')).themes;   // shared with the quiz
const INFL = JSON.parse(fs.readFileSync(`${ROOT}/data/inflections.json`, 'utf8')).verbs;
const TARGET = 9, VERB_VARIANTS = 4;

const HINTS = {
  'דווקא': 'Aramaic — root ד־ו־ק, "exactness"', 'מעולם': 'from עוֹלָם "world/eternity"', 'בטח': 'root ב־ט־ח "trust"',
  'אפילו': 'emphatic particle — no Semitic root', 'בקרוב': 'from קָרוֹב "near" — root ק־ר־ב', 'כמעט': 'from מְעַט "a little"',
  'מאוד': 'intensifier — root מ־א־ד', 'לכן': 'connector "therefore"; cf. כֵּן "so"', 'מיד': 'מ + יָד "hand" → at once',
  'לאט': 'adverb; לְאַט-לְאַט = "gradually"', 'בעצם': 'from עֶצֶם "essence" — "in essence"', 'בערך': 'from עֵרֶךְ "value"',
  'במיוחד': 'from מְיוּחָד "special"', 'בוודאי': 'from וַדַּאי "certain"', 'פתאום': 'from פֶּתַע "sudden"', 'מזמן': 'from זְמַן "time"',
};
// per-inflection clue tag + teaching note (consistent across the pa'al verbs in the set)
const FORM_META = {
  past3ms: { tag: 'he · past', note: "pa'al past, 3ms — the plain 3-letter base" },
  past3fs: { tag: 'she · past', note: "past 3fs — base + the ־ָה ending" },
  presMs: { tag: 'present · m.', note: "present m.sg — the CoCeC (o–e) participle pattern" },
  inf: { tag: 'infinitive', note: "infinitive — the לְ… dictionary form" },
  past1cs: { tag: 'I · past', note: "past 1cs — base + ־ְתִּי" },
};
const formTag = (w) => {
  const g = w && w.grammar; if (!g) return null;
  if (/infinitive/i.test(g)) return 'infinitive';
  const m = g.match(/(present|past|future|imperative)(?:\s+(m\.|f\.)(sg|pl))?/i);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
};
const hintFor = (b) => {
  const w = byBare.get(b);
  if (w && w.type === 'verb' && w.grammar) return w.grammar;   // teach the inflection
  return HINTS[b] || (w && w.grammar) || (w && w.shoresh ? `root ${w.shoresh}` : null);
};
const pointsFor = (w) => Math.min(70, Math.max(10, Math.round((((w.rank || 500) / 45) + [...w.bare].length * 3) / 5) * 5));

// vocab map (bare → {clue,niqqud,translit,hint,points}) for the two kinds of theme
function lexVocab(pool) {
  const m = new Map();
  for (const b of pool) { const w = byBare.get(b); if (!w) continue;
    m.set(b, { clue: w.gloss + (w.type === 'verb' && formTag(w) ? ` · ${formTag(w)}` : ''), niqqud: w.niqqud || b, translit: w.translit || '', hint: hintFor(b), points: pointsFor(w) }); }
  return m;
}
function inflVocab(forms) {
  const m = new Map();
  for (const f of forms) { const fm = FORM_META[f.type] || { tag: '', note: '' };
    m.set(f.bare, { clue: `${f.gloss} · ${fm.tag}`, niqqud: f.niqqud, translit: f.translit || '', hint: `${fm.note}${f.shoresh ? ` — root ${f.shoresh}` : ''}`, points: pointsFor({ rank: 550, bare: f.bare }) }); }
  return m;
}
function verbVariant() {   // pick one random form per verb
  return INFL.map(v => { const types = Object.keys(v.forms); const t = types[Math.floor(Math.random() * types.length)]; const [bare, niqqud, translit] = v.forms[t]; return { bare, niqqud, translit, gloss: v.gloss, shoresh: v.shoresh, type: t }; });
}

const key = (r, c) => `${r},${c}`;
const cellsFor = (ls, dir, aR, aC, aIdx) => ls.map((letter, i) => ({ r: dir === 'across' ? aR : aR + (i - aIdx), c: dir === 'across' ? aC + (aIdx - i) : aC, letter }));
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const area = (occ) => { const rs = [...occ.keys()].map(k => +k.split(',')[0]), cs = [...occ.keys()].map(k => +k.split(',')[1]); return (Math.max(...rs) - Math.min(...rs)) * (Math.max(...cs) - Math.min(...cs)); };

function build(order, has) {
  const occupied = new Map(), placed = [];
  const tryPlace = (ls, dir, aR, aC, aIdx) => {
    const cells = cellsFor(ls, dir, aR, aC, aIdx); let crossings = 0;
    for (const { r, c, letter } of cells) {
      if (occupied.has(key(r, c))) { if (occupied.get(key(r, c)) !== letter) return null; crossings++; }
      else { const perp = dir === 'across' ? [[r - 1, c], [r + 1, c]] : [[r, c - 1], [r, c + 1]]; for (const [pr, pc] of perp) if (occupied.has(key(pr, pc))) return null; }
    }
    const head = dir === 'across' ? [cells[0].r, cells[0].c + 1] : [cells[0].r - 1, cells[0].c];
    const tail = dir === 'across' ? [cells.at(-1).r, cells.at(-1).c - 1] : [cells.at(-1).r + 1, cells.at(-1).c];
    if (occupied.has(key(...head)) || occupied.has(key(...tail))) return null;
    if (ls.length > 1 && placed.length > 0 && crossings === 0) return null;
    return cells;
  };
  const commit = (bare, dir, cells) => { for (const c of cells) occupied.set(key(c.r, c.c), c.letter); placed.push({ bare, dir, cells }); };
  for (const bare of order) {
    if (placed.length >= TARGET) break;
    if (!has(bare)) continue;
    const ls = [...bare];
    if (placed.length === 0) { commit(bare, 'across', cellsFor(ls, 'across', 0, 0, 0)); continue; }
    let done = false;
    for (const [k, ol] of [...occupied]) { const [r, c] = k.split(',').map(Number);
      for (let i = 0; i < ls.length && !done; i++) { if (ls[i] !== ol) continue; for (const dir of ['across', 'down']) { const cs = tryPlace(ls, dir, r, c, i); if (cs) { commit(bare, dir, cs); done = true; break; } } }
      if (done) break;
    }
  }
  return { placed, occupied };
}

function generatePuzzle(id, title, poolBares, vocab) {
  const present = [...new Set(poolBares)].filter(b => vocab.has(b));
  const has = (b) => vocab.has(b);
  const anchor = [...present].sort((a, b) => [...b].length - [...a].length)[0];
  const rest = present.filter(b => b !== anchor);
  let best = null;
  for (let t = 0; t < 600; t++) { const r = build([anchor, ...shuffle(rest)], has); const sc = r.placed.length * 1000 - area(r.occupied); if (!best || sc > best.sc) best = { ...r, sc }; }
  const { placed } = best;
  const rs = placed.flatMap(p => p.cells.map(c => c.r)), cs = placed.flatMap(p => p.cells.map(c => c.c));
  const minR = Math.min(...rs), minC = Math.min(...cs);
  const rows = Math.max(...rs) - minR + 1, cols = Math.max(...cs) - minC + 1;
  for (const p of placed) p.cells = p.cells.map(c => ({ r: c.r - minR, c: c.c - minC, letter: c.letter }));
  const sorted = [...placed].sort((a, b) => a.cells[0].r - b.cells[0].r || a.cells[0].c - b.cells[0].c || (a.dir === 'across' ? 0 : 1) - (b.dir === 'across' ? 0 : 1));
  let num = 0; const numAt = new Map();
  for (const p of sorted) { const s = p.cells[0]; const k = key(s.r, s.c); if (!numAt.has(k)) numAt.set(k, ++num); p.num = numAt.get(k); }
  const entries = placed.map(p => { const m = vocab.get(p.bare); return {
    num: p.num, dir: p.dir, answer: [...p.bare], len: [...p.bare].length, cells: p.cells.map(c => ({ r: c.r, c: c.c })),
    clue: m.clue, niqqud: m.niqqud || p.bare, translit: m.translit || '', hint: m.hint, points: m.points,
  }; }).sort((a, b) => a.num - b.num || (a.dir === 'across' ? -1 : 1));
  return { id, title, rows, cols, entries };
}

const out = { index: [], puzzles: {} };
for (const theme of THEMES) {
  if (theme.id === 'verbs') {   // paradigm trainer — N variants, each a random form-sample
    const variants = []; let words = 0;
    for (let k = 0; k < VERB_VARIANTS; k++) {
      const id = k === 0 ? 'verbs' : `verbs-${k + 1}`;
      const forms = verbVariant();
      const p = generatePuzzle(id, theme.title, forms.map(f => f.bare), inflVocab(forms));
      out.puzzles[id] = { id, title: p.title, rows: p.rows, cols: p.cols, entries: p.entries };
      variants.push(id); words = p.entries.length;
      console.log(`${id.padEnd(9)} ${p.entries.length}w ${p.rows}×${p.cols}   ${p.entries.map(e => e.answer.join('')).join(' ')}`);
    }
    out.index.push({ id: 'verbs', title: theme.title, words, variants });
  } else {
    const p = generatePuzzle(theme.id, theme.title, theme.pool, lexVocab(theme.pool));
    out.puzzles[p.id] = { id: p.id, title: p.title, rows: p.rows, cols: p.cols, entries: p.entries };
    out.index.push({ id: p.id, title: p.title, rows: p.rows, cols: p.cols, words: p.entries.length, variants: [p.id] });
    const missing = theme.pool.filter(b => !byBare.has(b));
    console.log(`${p.id.padEnd(9)} "${p.title}"  ${p.entries.length}w ${p.rows}×${p.cols}` + (missing.length ? `  (not in lexicon: ${missing.join(' ')})` : ''));
  }
}
fs.writeFileSync(`${ROOT}/data/crosswords.json`, JSON.stringify(out, null, 2) + '\n');
console.log(`\nwrote data/crosswords.json — ${out.index.length} themes, ${Object.keys(out.puzzles).length} puzzles`);
