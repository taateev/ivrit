#!/usr/bin/env node
// Generate an interlocking Hebrew crossword from studied vocab. RTL: across words read
// right-to-left (letter[0] = rightmost cell). Clue = English gloss; hint = etymology/root
// (the root consonants double as a spelling scaffold). Points scale with rarity + length.
// Writes data/crossword.json + prints an ASCII grid to verify interlock. Usage: node crossword.mjs [id]
import fs from 'node:fs';
const ROOT = '/Users/dlesky/hebrew';
const ID = process.argv[2] || 'xw-1';
const words = JSON.parse(fs.readFileSync(`${ROOT}/data/words.json`, 'utf8')).words;
const byBare = new Map(words.map(w => [w.bare, w]));

// pool: studied words, hardest/anchor first so דווקא + the adverbs get in and earn hints.
const POOL = ['דווקא', 'מעולם', 'בקרוב', 'אפילו', 'מאוד', 'אוכל', 'כמעט', 'בטח', 'מלך',
              'כלב', 'לפני', 'עיר', 'סיבה', 'מיד', 'לכן', 'יד', 'מים', 'לאט'];
const TARGET = 9;

// etymology hints (override); fallback to the word's shoresh from words.json
const HINTS = {
  'דווקא': 'Aramaic — root ד־ו־ק, "exactness"',
  'מעולם': 'from עוֹלָם "world/eternity" — lit. "from [the start of] time"',
  'בטח': 'root ב־ט־ח "trust" (cf. בִּיטָּחוֹן "security")',
  'אפילו': 'emphatic particle "even" — no Semitic root',
  'בקרוב': 'from קָרוֹב "near" — root ק־ר־ב',
  'כמעט': 'from מְעַט "a little" — root מ־ע־ט',
  'מאוד': 'intensifier "very" — root מ־א־ד',
  'לכן': 'connector "therefore"; cf. כֵּן "yes/so"',
  'מיד': 'מ + יָד "hand" → "from hand", i.e. at once',
  'לאט': 'adverb "slowly"; לְאַט-לְאַט = "gradually"',
};
const hintFor = (bare) => HINTS[bare] || (byBare.get(bare)?.shoresh ? `root ${byBare.get(bare).shoresh}` : null);
const pointsFor = (w) => { const rank = w.rank || 500; return Math.min(70, Math.max(10, Math.round((rank / 45 + w.bare.length * 3) / 5) * 5)); };

const key = (r, c) => `${r},${c}`;
const cellsFor = (letters, dir, aR, aC, aIdx) => letters.map((letter, i) => ({
  r: dir === 'across' ? aR : aR + (i - aIdx),
  c: dir === 'across' ? aC + (aIdx - i) : aC,            // across: i↑ → c↓ (leftward = RTL)
  letter,
}));

// one greedy build for a given word order; returns {placed, occupied} (placed as many as fit)
function build(order) {
  const occupied = new Map(), placed = [];
  const tryPlace = (letters, dir, aR, aC, aIdx) => {
    const cells = cellsFor(letters, dir, aR, aC, aIdx);
    let crossings = 0;
    for (const { r, c, letter } of cells) {
      if (occupied.has(key(r, c))) {
        if (occupied.get(key(r, c)) !== letter) return null;
        crossings++;
      } else {
        const perp = dir === 'across' ? [[r - 1, c], [r + 1, c]] : [[r, c - 1], [r, c + 1]];
        for (const [pr, pc] of perp) if (occupied.has(key(pr, pc))) return null;
      }
    }
    const head = dir === 'across' ? [cells[0].r, cells[0].c + 1] : [cells[0].r - 1, cells[0].c];
    const tail = dir === 'across' ? [cells.at(-1).r, cells.at(-1).c - 1] : [cells.at(-1).r + 1, cells.at(-1).c];
    if (occupied.has(key(...head)) || occupied.has(key(...tail))) return null;
    if (letters.length > 1 && placed.length > 0 && crossings === 0) return null;
    return cells;
  };
  const commit = (bare, dir, cells) => { for (const c of cells) occupied.set(key(c.r, c.c), c.letter); placed.push({ bare, dir, cells }); };
  for (const bare of order) {
    if (placed.length >= TARGET) break;
    if (!byBare.has(bare)) continue;
    const letters = [...bare];
    if (placed.length === 0) { commit(bare, 'across', cellsFor(letters, 'across', 0, 0, 0)); continue; }
    let done = false;
    for (const [k, occLetter] of [...occupied]) {
      const [r, c] = k.split(',').map(Number);
      for (let idx = 0; idx < letters.length && !done; idx++) {
        if (letters[idx] !== occLetter) continue;
        for (const dir of ['across', 'down']) { const cells = tryPlace(letters, dir, r, c, idx); if (cells) { commit(bare, dir, cells); done = true; break; } }
      }
      if (done) break;
    }
  }
  return { placed, occupied };
}
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const area = (occ) => { const rs = [...occ.keys()].map(k => +k.split(',')[0]), cs = [...occ.keys()].map(k => +k.split(',')[1]); return (Math.max(...rs) - Math.min(...rs)) * (Math.max(...cs) - Math.min(...cs)); };

// try many orderings (דווקא always anchors first), keep the densest = most words, then most crossings
const ANCHOR = 'דווקא', rest = POOL.filter(b => b !== ANCHOR);
let best = null;
for (let t = 0; t < 400; t++) {
  const r = build([ANCHOR, ...shuffle(rest)]);
  const crossings = [...r.occupied].length;                 // proxy; denser overlap = lower area per word
  const sc = r.placed.length * 1000 - area(r.occupied);     // maximize words, then compactness
  if (!best || sc > best.sc) best = { ...r, sc };
}
const { placed, occupied } = best;
const skipped = POOL.filter(b => byBare.has(b) && !placed.some(p => p.bare === b));

// normalize coordinates to 0-based
const rs = placed.flatMap(p => p.cells.map(c => c.r)), cs = placed.flatMap(p => p.cells.map(c => c.c));
const minR = Math.min(...rs), minC = Math.min(...cs);
const rows = Math.max(...rs) - minR + 1, cols = Math.max(...cs) - minC + 1;
for (const p of placed) p.cells = p.cells.map(c => ({ r: c.r - minR, c: c.c - minC, letter: c.letter }));

// crossword numbering: a cell that starts an across or down entry gets a number
const startKey = new Map();
const sorted = [...placed].sort((a, b) => a.cells[0].r - b.cells[0].r || a.cells[0].c - b.cells[0].c
  || (a.dir === 'across' ? 0 : 1) - (b.dir === 'across' ? 0 : 1));
let num = 0; const numAt = new Map();
for (const p of sorted) {
  const s = p.cells[0]; const k = key(s.r, s.c);
  if (!numAt.has(k)) numAt.set(k, ++num);
  p.num = numAt.get(k);
}

const entries = placed.map(p => {
  const w = byBare.get(p.bare);
  return {
    num: p.num, dir: p.dir, answer: [...p.bare], len: p.bare.length,
    cells: p.cells.map(c => ({ r: c.r, c: c.c })),
    clue: w.gloss, niqqud: w.niqqud || p.bare, translit: w.translit || '',
    hint: hintFor(p.bare), points: pointsFor(w),
  };
}).sort((a, b) => a.num - b.num || (a.dir === 'across' ? -1 : 1));

const puzzle = { id: ID, rows, cols, entries };
fs.writeFileSync(`${ROOT}/data/crossword.json`, JSON.stringify(puzzle, null, 2) + '\n');

// ---- verify: ASCII grid + entry list ----
const grid = Array.from({ length: rows }, () => Array(cols).fill('·'));
for (const [k, l] of occupied) { const [r, c] = k.split(',').map(Number); grid[r - minR][c - minC] = l; }
console.log(`${ID}: ${entries.length} words placed, ${skipped.length ? 'skipped ' + skipped.join(' ') : 'all placed'} · grid ${rows}×${cols}\n`);
for (const row of grid) console.log('  ' + row.join(' '));
console.log();
for (const e of entries) console.log(`  ${String(e.num).padStart(2)}${e.dir === 'across' ? 'A' : 'D'}  ${e.answer.join('')}  (${e.points}pt) — ${e.clue}${e.hint ? '   [' + e.hint + ']' : ''}`);
