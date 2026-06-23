#!/usr/bin/env node
// Generate themed interlocking Hebrew crosswords from the studied lexicon → data/crosswords.json
//   { index: [{id,title,rows,cols,words}], puzzles: { id: {id,rows,cols,entries:[...]} } }
// RTL across (letter[0] = rightmost). Clue = gloss; hint = etymology/root. Points scale w/ rarity+length.
import fs from 'node:fs';
const ROOT = '/Users/dlesky/hebrew';
const words = JSON.parse(fs.readFileSync(`${ROOT}/data/words.json`, 'utf8')).words;
const byBare = new Map(words.map(w => [w.bare, w]));

const THEMES = [
  { id: 'time', title: 'time · זמן', pool: ['זמן', 'פעם', 'שבוע', 'דקה', 'היום', 'מחר', 'לילה', 'בוקר', 'ערב', 'שעה', 'יום', 'רגע', 'מזמן', 'בקרוב', 'חצי', 'תמיד', 'מהר', 'לאט', 'עדיין', 'שוב', 'ימים'] },
  { id: 'people', title: 'people & body · אנשים', pool: ['משפחה', 'אישה', 'גבר', 'ילד', 'ילדה', 'חבר', 'בחור', 'איש', 'ראש', 'פנים', 'יד', 'גוף', 'לב', 'עין', 'מלך', 'נשים', 'בנאדם', 'חברה'] },
  { id: 'home', title: 'home & things · בבית', pool: ['בית', 'דלת', 'חדר', 'מים', 'אוכל', 'קפה', 'טלפון', 'כסף', 'ספר', 'סרט', 'מקום', 'דרך', 'כלב'] },
  { id: 'verbs', title: 'verbs · פעלים', pool: ['לראות', 'לדבר', 'לדעת', 'בוא', 'אומר', 'הולך', 'נראה', 'קורה', 'מבין', 'מקווה', 'מתכוון', 'מנסה', 'רואה', 'מגיע', 'נמצא', 'לצאת', 'לומר', 'אוהב'] },
  { id: 'adverbs', title: 'adverbs · תארי הפועל', pool: ['דווקא', 'אפילו', 'בטח', 'מעולם', 'לפחות', 'כמעט', 'מיד', 'לכן', 'בקרוב', 'בערך', 'במיוחד', 'בעצם', 'לאט', 'בוודאי', 'פתאום', 'מזמן', 'אחר', 'כזה', 'מאוד'] },
  { id: 'ideas', title: 'world & ideas · רעיונות', pool: ['עיר', 'ארץ', 'מדינה', 'מקום', 'עולם', 'סיבה', 'עניין', 'מצב', 'רעיון', 'מושג', 'אהבה', 'שאלה', 'חיים', 'פחד', 'כוח', 'חברה', 'חדשות', 'פרק'] },
  { id: 'fresh', title: 'new words · מילים חדשות', pool: ['ראשון', 'אופן', 'צודק', 'לפגוש', 'שווה', 'שתיים', 'להאמין', 'שמחה', 'מיוחד', 'ארבע', 'לדאוג', 'לתפוס', 'מנהל', 'אור', 'לרדת', 'עייף', 'רשמי', 'גשם', 'להצליח', 'ליפול', 'לטעות', 'כבוי'] },
];
const TARGET = 9;

const HINTS = {
  'דווקא': 'Aramaic — root ד־ו־ק, "exactness"', 'מעולם': 'from עוֹלָם "world/eternity"', 'בטח': 'root ב־ט־ח "trust"',
  'אפילו': 'emphatic particle — no Semitic root', 'בקרוב': 'from קָרוֹב "near" — root ק־ר־ב', 'כמעט': 'from מְעַט "a little"',
  'מאוד': 'intensifier — root מ־א־ד', 'לכן': 'connector "therefore"; cf. כֵּן "so"', 'מיד': 'מ + יָד "hand" → at once',
  'לאט': 'adverb; לְאַט-לְאַט = "gradually"', 'בעצם': 'from עֶצֶם "essence" — "in essence"', 'בערך': 'from עֵרֶךְ "value"',
  'במיוחד': 'from מְיוּחָד "special"', 'בוודאי': 'from וַדַּאי "certain"', 'פתאום': 'from פֶּתַע "sudden"', 'מזמן': 'from זְמַן "time"',
};
const hintFor = (b) => HINTS[b] || (byBare.get(b)?.shoresh ? `root ${byBare.get(b).shoresh}` : null);
const pointsFor = (w) => Math.min(70, Math.max(10, Math.round((( (w.rank || 500) / 45) + [...w.bare].length * 3) / 5) * 5));

const key = (r, c) => `${r},${c}`;
const cellsFor = (ls, dir, aR, aC, aIdx) => ls.map((letter, i) => ({ r: dir === 'across' ? aR : aR + (i - aIdx), c: dir === 'across' ? aC + (aIdx - i) : aC, letter }));
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const area = (occ) => { const rs = [...occ.keys()].map(k => +k.split(',')[0]), cs = [...occ.keys()].map(k => +k.split(',')[1]); return (Math.max(...rs) - Math.min(...rs)) * (Math.max(...cs) - Math.min(...cs)); };

function build(order) {
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
    if (!byBare.has(bare)) continue;
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

function generatePuzzle(theme) {
  const present = theme.pool.filter(b => byBare.has(b));
  const anchor = [...present].sort((a, b) => [...b].length - [...a].length)[0];
  const rest = present.filter(b => b !== anchor);
  let best = null;
  for (let t = 0; t < 600; t++) { const r = build([anchor, ...shuffle(rest)]); const sc = r.placed.length * 1000 - area(r.occupied); if (!best || sc > best.sc) best = { ...r, sc }; }
  const { placed, occupied } = best;

  const rs = placed.flatMap(p => p.cells.map(c => c.r)), cs = placed.flatMap(p => p.cells.map(c => c.c));
  const minR = Math.min(...rs), minC = Math.min(...cs);
  const rows = Math.max(...rs) - minR + 1, cols = Math.max(...cs) - minC + 1;
  for (const p of placed) p.cells = p.cells.map(c => ({ r: c.r - minR, c: c.c - minC, letter: c.letter }));
  const sorted = [...placed].sort((a, b) => a.cells[0].r - b.cells[0].r || a.cells[0].c - b.cells[0].c || (a.dir === 'across' ? 0 : 1) - (b.dir === 'across' ? 0 : 1));
  let num = 0; const numAt = new Map();
  for (const p of sorted) { const s = p.cells[0]; const k = key(s.r, s.c); if (!numAt.has(k)) numAt.set(k, ++num); p.num = numAt.get(k); }
  const entries = placed.map(p => { const w = byBare.get(p.bare); return {
    num: p.num, dir: p.dir, answer: [...p.bare], len: [...p.bare].length, cells: p.cells.map(c => ({ r: c.r, c: c.c })),
    clue: w.gloss, niqqud: w.niqqud || p.bare, translit: w.translit || '', hint: hintFor(p.bare), points: pointsFor(w),
  }; }).sort((a, b) => a.num - b.num || (a.dir === 'across' ? -1 : 1));
  return { id: theme.id, title: theme.title, rows, cols, entries, skipped: present.length - placed.length, missing: theme.pool.filter(b => !byBare.has(b)) };
}

const out = { index: [], puzzles: {} };
for (const theme of THEMES) {
  const p = generatePuzzle(theme);
  out.puzzles[p.id] = { id: p.id, title: p.title, rows: p.rows, cols: p.cols, entries: p.entries };
  out.index.push({ id: p.id, title: p.title, rows: p.rows, cols: p.cols, words: p.entries.length });
  console.log(`${p.id.padEnd(8)} "${p.title}"  ${p.entries.length} words, ${p.rows}×${p.cols}` + (p.missing.length ? `  (not in lexicon: ${p.missing.join(' ')})` : ''));
  console.log('   ' + p.entries.map(e => e.answer.join('')).join(' '));
}
fs.writeFileSync(`${ROOT}/data/crosswords.json`, JSON.stringify(out, null, 2) + '\n');
console.log(`\nwrote data/crosswords.json — ${out.index.length} themed puzzles`);
