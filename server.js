// server.js — couch-Hebrew app server (Railway).
//  · HTTP: static app + /api/rooms (foyer) + /healthz.
//  · WS (/ws): live CO-OP crossword, server-authoritative. Each room is bound to one themed
//    puzzle (from data/crosswords.json). Shared board, pooled score, presence, chat. Save on finish (GH_TOKEN).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ---------- puzzles ----------
const PUZZLES = new Map();   // id -> { puzzle, validCells }
let DEFAULT_PUZZLE = null;
function loadPuzzles() {
  try {
    const data = JSON.parse(fs.readFileSync(`${ROOT}/data/crosswords.json`, 'utf8'));
    PUZZLES.clear();
    for (const id of Object.keys(data.puzzles || {})) {
      const puzzle = data.puzzles[id];
      const validCells = new Set();
      for (const e of puzzle.entries) for (const c of e.cells) validCells.add(`${c.r},${c.c}`);
      PUZZLES.set(id, { puzzle, validCells });
    }
    DEFAULT_PUZZLE = (data.index && data.index[0] && data.index[0].id) || [...PUZZLES.keys()][0] || null;
    console.log(`loaded ${PUZZLES.size} crosswords: ${[...PUZZLES.keys()].join(', ')}`);
  } catch (e) { console.log('no crosswords loaded:', e.message); }
}
loadPuzzles();
const puzzleOf = (room) => PUZZLES.get(room.puzzleId) || PUZZLES.get(DEFAULT_PUZZLE) || null;

// ---------- static file server ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end('bad request'); return; }
  if (pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (pathname === '/api/rooms') {
    const now = Date.now();
    const list = [...rooms.values()]
      .filter(r => r.conns.size > 0 || now - r.lastMove < 24 * 3600 * 1000)
      .sort((a, b) => b.lastMove - a.lastMove)
      .map(r => {
        const P = puzzleOf(r);
        const active = new Set([...r.conns].map(c => c.player || '?'));
        const people = new Map();
        for (const [name, t] of r.contributors) people.set(name, { name, active: active.has(name), lastMove: t });
        for (const name of active) if (!people.has(name)) people.set(name, { name, active: true, lastMove: null });
        const peopleArr = [...people.values()].sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || (b.lastMove || 0) - (a.lastMove || 0));
        return { id: r.id, puzzle: r.puzzleId, title: P ? P.puzzle.title : null, count: active.size, people: peopleArr, solved: r.solved.size, total: P ? P.puzzle.entries.length : 0, lastMove: r.lastMove, done: !!r.finishedAt };
      });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({ rooms: list }));
    return;
  }
  if (pathname === '/api/stats') {   // a player's progress over time
    const player = (new URL(req.url, 'http://x').searchParams.get('player') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    const mine = savedLog.filter(r => r.player === player).sort((a, b) => b.ts - a.ts);
    const totals = mine.reduce((t, r) => ({ sessions: t.sessions + 1, cards: t.cards + r.cards, correct: t.correct + r.correct, score: t.score + r.score }), { sessions: 0, cards: 0, correct: 0, score: 0 });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({ player, totals, sessions: mine.slice(0, 60) }));
    return;
  }
  if (pathname === '/api/words') {   // a player's vocabulary, weighted by repetition + performance
    const player = (new URL(req.url, 'http://x').searchParams.get('player') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    const m = wordStats.get(player) || new Map();
    const words = [...m].map(([word, w]) => {
      const acc = w.seen ? w.correct / w.seen : 0;
      const conf = w.confN ? w.confSum / w.confN : null;
      const strength = conf != null ? acc * 0.5 + conf * 0.5 : acc;   // 0..1
      return { word, gloss: GLOSS.get(word) || '', seen: w.seen, correct: w.correct, acc, conf, lastTs: w.lastTs, strength };
    }).sort((a, b) => a.strength - b.strength || b.seen - a.seen);   // weakest (needs work) first
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({ player, count: words.length, words }));
    return;
  }
  if (pathname === '/api/drill') {   // build a quiz set on demand (theme / weak / new / review / random)
    const q = new URL(req.url, 'http://x').searchParams;
    const set = (q.get('set') || 'random').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
    const player = (q.get('player') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    const cards = shuf(pickSet(set, player)).map(b => cardFor(b, player)).filter(Boolean);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({ sessionId: set, set, cards }));
    return;
  }
  if (req.method === 'POST' && pathname === '/api/results') {   // drill results — server saves them (no per-device token)
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', async () => {
      let d; try { d = JSON.parse(body); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"ok":false,"error":"bad json"}'); return; }
      const r = await saveResult(d);
      res.writeHead(r.ok ? 200 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r));
    });
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT + path.sep) || pathname.split('/').some(s => s.startsWith('.'))) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.html') headers['Cache-Control'] = 'no-cache';
    res.writeHead(200, headers); res.end(data);
  });
});

// ---------- co-op crossword engine ----------
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const norm = (ch) => FINALS[ch] || ch;
const ekey = (e) => e.num + e.dir[0];

const rooms = new Map();
const getRoom = (id) => {
  if (!rooms.has(id)) rooms.set(id, { id, puzzleId: null, cells: new Map(), solvedCells: new Set(), solved: new Set(), score: 0, conns: new Set(), startedAt: null, finishedAt: null, lastMove: Date.now(), contributors: new Map(), chat: [] });
  return rooms.get(id);
};
const resetRoom = (room) => { room.cells.clear(); room.solvedCells.clear(); room.solved.clear(); room.score = 0; room.startedAt = Date.now(); room.finishedAt = null; room.lastMove = Date.now(); room.contributors.clear(); };

function checkAll(room) {
  const P = puzzleOf(room); if (!P) return;
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of P.puzzle.entries) {
      if (room.solved.has(ekey(e))) continue;
      const ok = e.cells.every((c, i) => { const v = room.cells.get(`${c.r},${c.c}`); return v && norm(v) === norm(e.answer[i]); });
      if (!ok) continue;
      room.solved.add(ekey(e));
      e.cells.forEach((c, i) => { const k = `${c.r},${c.c}`; room.cells.set(k, e.answer[i]); room.solvedCells.add(k); });
      room.score += e.points;
      changed = true;
    }
  }
  if (room.solved.size === P.puzzle.entries.length && !room.finishedAt) { room.finishedAt = Date.now(); persist(room); }
}

function stateMsg(room) {
  const P = puzzleOf(room);
  return JSON.stringify({
    t: 'state', puzzle: room.puzzleId, title: P ? P.puzzle.title : null,
    cells: Object.fromEntries(room.cells), solved: [...room.solved], solvedCells: [...room.solvedCells],
    score: room.score, players: [...room.conns].map(c => c.player || '?'),
    total: P ? P.puzzle.entries.length : 0, done: !!room.finishedAt, startedAt: room.startedAt, finishedAt: room.finishedAt,
  });
}
const broadcast = (room) => { const m = stateMsg(room); for (const c of room.conns) if (c.readyState === 1) c.send(m); };

async function persist(room) {
  const P = puzzleOf(room);
  const players = [...new Set([...room.conns].map(c => c.player).filter(Boolean))];
  const ms = room.finishedAt - (room.startedAt || room.finishedAt);
  console.log(`co-op crossword done: room=${room.id} puzzle=${room.puzzleId} players=${players.join('+')} score=${room.score} ${Math.round(ms / 1000)}s`);
  const token = process.env.GH_TOKEN;
  if (!token || !P) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const body = { t: new Date().toISOString(), kind: 'crossword', mode: 'coop', room: room.id, puzzle: room.puzzleId, players, score: room.score, ms, solved: [...room.solved] };
  try {
    const res = await fetch(`https://api.github.com/repos/taateev/ivrit/contents/data/results/crossword--${room.id}--${stamp}.json`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `crossword co-op: ${room.id} (${room.puzzleId}) · ${room.score}pt`, content: Buffer.from(JSON.stringify(body, null, 2)).toString('base64') }),
    });
    console.log('crossword save:', res.status);
  } catch (e) { console.log('crossword save failed:', e.message); }
}

// ---------- drill results + per-player progress tracking ----------
let WORDS = [], byBare = new Map(), THEMES = [];
try { WORDS = JSON.parse(fs.readFileSync(`${ROOT}/data/words.json`, 'utf8')).words; byBare = new Map(WORDS.map(w => [w.bare, w])); } catch (e) {}
try { THEMES = JSON.parse(fs.readFileSync(`${ROOT}/data/themes.json`, 'utf8')).themes || []; } catch (e) {}
const GLOSS = new Map(WORDS.map(w => [w.bare, w.gloss]));   // bare → gloss, for the vocab list
const COACH_NOTES = (() => { try { return JSON.parse(fs.readFileSync(`${ROOT}/data/notes.json`, 'utf8')).notes || {}; } catch (e) { return {}; } })();
const USER_NOTES = (() => { const m = {}; try { for (const l of fs.readFileSync(`${ROOT}/data/reviews.jsonl`, 'utf8').split('\n')) { if (!l) continue; const e = JSON.parse(l); if (e.note) (m[e.id] = m[e.id] || []).push({ by: 'user', text: e.note, t: e.t }); } } catch (e) {} return m; })();
const notesFor = (id) => [...(USER_NOTES[id] || []), ...((COACH_NOTES[id] || []).map(n => ({ by: 'coach', text: n.text, t: n.t })))].sort((a, b) => Date.parse(a.t || 0) - Date.parse(b.t || 0));
const shuf = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// build a quiz card for a word (3 distractor glosses, niqqud/translit/shoresh/grammar/examples/notes)
function cardFor(bare, player) {
  const w = byBare.get(bare); if (!w) return null;
  const distractors = [], used = new Set([w.gloss]);
  for (const x of shuf(WORDS)) { if (distractors.length >= 3) break; if (x.gloss && !used.has(x.gloss)) { used.add(x.gloss); distractors.push(x.gloss); } }
  const seen = (wordStats.get(player) || new Map()).has(bare);
  return { id: w.bare, bare: w.bare, niqqud: w.niqqud || '', translit: w.translit || '', gloss: w.gloss, shoresh: w.shoresh || null, grammar: w.grammar || null, examples: w.examples || [], distractors, phrase: false, isNew: !seen, notes: notesFor(w.bare) };
}
// pick the word ids for a named set
function pickSet(set, player) {
  const theme = THEMES.find(t => t.id === set);
  if (theme) return theme.pool.filter(b => byBare.has(b)).slice(0, 14);
  const ws = wordStats.get(player) || new Map();
  if (set === 'weak') return [...ws].filter(([id, w]) => w.seen >= 1 && byBare.has(id)).map(([id, w]) => [id, (w.confN ? w.confSum / w.confN : 0) * 0.5 + (w.seen ? w.correct / w.seen : 0) * 0.5]).sort((a, b) => a[1] - b[1]).slice(0, 12).map(([id]) => id);
  if (set === 'new') return WORDS.filter(w => w.rank >= 81 && !ws.has(w.bare)).sort((a, b) => a.rank - b.rank).slice(0, 12).map(w => w.bare);
  if (set === 'review') return [...ws].filter(([id]) => byBare.has(id)).sort((a, b) => a[1].lastTs - b[1].lastTs).slice(0, 12).map(([id]) => id);
  return shuf(WORDS.filter(w => w.rank >= 81)).slice(0, 12).map(w => w.bare);   // random
}

const savedLog = [];   // { player, session, ts, cards, correct, score }
const wordStats = new Map();   // player → Map(word → { seen, correct, confSum, confN, lastTs })
function ingest(player, events, ts) {   // one count per word per session (first look)
  if (!wordStats.has(player)) wordStats.set(player, new Map());
  const m = wordStats.get(player), seenIds = new Set();
  for (const ev of events) {
    if (!ev || !ev.id || !ev.grade || seenIds.has(ev.id)) continue;
    seenIds.add(ev.id);
    const w = m.get(ev.id) || { seen: 0, correct: 0, confSum: 0, confN: 0, lastTs: 0 };
    w.seen++; if (ev.grade === 'good') w.correct++;
    if (typeof ev.confidence === 'number') { w.confSum += ev.confidence; w.confN++; }
    w.lastTs = Math.max(w.lastTs, ts || 0);
    m.set(ev.id, w);
  }
}
const summarize = (player, session, events, ts) => {
  const fl = events.filter(e => e && e.points !== undefined);   // first-look (scored) events
  const base = fl.length ? fl : events;
  return { player, session, ts, cards: base.length, correct: base.filter(e => e && e.grade && e.grade !== 'again').length, score: fl.reduce((s, e) => s + (e.points || 0), 0) };
};
const seededFiles = new Set();   // dedupe across disk + repo seeding
const parseStamp = (name) => { const s = (name.replace(/\.jsonl$/, '').split('--')[2] || '').replace(/T(\d\d)-(\d\d)-(\d\d)-(\d{1,3})Z$/, 'T$1:$2:$3.$4Z'); return Date.parse(s) || null; };
function seedOne(name, player, session, events, ts) {
  if (seededFiles.has(name) || !events.length) return;
  seededFiles.add(name);
  savedLog.push(summarize(player || 'anon', session || 'session', events, ts));
  ingest(player || 'anon', events, ts);
}
function seedStats() {   // fast local seed from the deploy snapshot
  try {
    const dir = `${ROOT}/data/results`;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.jsonl') || !f.includes('--')) continue;
      const [session, player] = f.replace(/\.jsonl$/, '').split('--');
      let events; try { events = fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { continue; }
      seedOne(f, player, session, events, parseStamp(f) || fs.statSync(`${dir}/${f}`).mtimeMs);
    }
    savedLog.sort((a, b) => a.ts - b.ts);
    console.log(`seeded ${savedLog.length} results from disk`);
  } catch (e) { console.log('stats seed (disk):', e.message); }
}
async function seedFromRepo() {   // authoritative: pull the latest committed results from the repo (survives sleep/wake)
  try {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'ivrit' };
    if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
    const r = await fetch('https://api.github.com/repos/taateev/ivrit/contents/data/results', { headers });
    if (!r.ok) { console.log('seedFromRepo list:', r.status); return; }
    let added = 0;
    for (const f of await r.json()) {
      if (seededFiles.has(f.name) || !f.name.endsWith('.jsonl') || !f.name.includes('--')) continue;
      try {
        const cr = await fetch(f.download_url, { headers: { 'User-Agent': 'ivrit' } });
        if (!cr.ok) continue;
        const events = (await cr.text()).split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        const [session, player] = f.name.replace(/\.jsonl$/, '').split('--');
        seedOne(f.name, player, session, events, parseStamp(f.name) || Date.now());
        added++;
      } catch (e) {}
    }
    savedLog.sort((a, b) => a.ts - b.ts);
    if (added) console.log(`seedFromRepo: +${added} results (total ${savedLog.length})`);
  } catch (e) { console.log('seedFromRepo:', e.message); }
}
function seedReviews() {   // dan's canonical merged history lives in reviews.jsonl, grouped by session
  try {
    const bySession = new Map();
    for (const l of fs.readFileSync(`${ROOT}/data/reviews.jsonl`, 'utf8').split('\n')) {
      if (!l) continue;
      let e; try { e = JSON.parse(l); } catch { continue; }
      const sk = e.session || 'reviews';
      if (!bySession.has(sk)) bySession.set(sk, []);
      bySession.get(sk).push(e);
    }
    let n = 0;
    for (const [session, events] of bySession) {
      const fkey = `reviews:${session}`;
      if (seededFiles.has(fkey)) continue;
      seededFiles.add(fkey);
      const ts = Math.max(0, ...events.map(e => Date.parse(e.t) || 0));
      const first = new Map();   // distinct words, first-look grade
      for (const e of events) if (e.id && !first.has(e.id)) first.set(e.id, e);
      const cards = first.size;
      const correct = [...first.values()].filter(e => e.grade && e.grade !== 'again').length;
      const score = events.reduce((s, e) => s + (e.points || 0), 0);
      savedLog.push({ player: 'dan', session, ts, cards, correct, score });
      ingest('dan', events, ts);
      n++;
    }
    savedLog.sort((a, b) => a.ts - b.ts);
    console.log(`seeded ${n} dan sessions from reviews.jsonl`);
  } catch (e) { console.log('seedReviews:', e.message); }
}
seedStats();
seedReviews();
seedFromRepo();

function saveResult(d) {
  const player = String(d.player || 'anon').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'anon';
  const session = String(d.session || 'session').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 60) || 'session';
  const events = Array.isArray(d.events) ? d.events.slice(0, 600) : [];
  if (!events.length) return { ok: false, error: 'no events' };
  const summary = summarize(player, session, events, Date.now());
  savedLog.push(summary);   // tracked immediately so progress always works
  ingest(player, events, summary.ts);
  const token = process.env.GH_TOKEN;   // durable commit to the repo — best-effort, doesn't block the result
  if (token) {
    const text = events.map(e => JSON.stringify(e)).join('\n') + '\n';
    const name = `${session}--${player}--${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    fetch(`https://api.github.com/repos/taateev/ivrit/contents/data/results/${name}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `drill: ${player} · ${session} · ${events.length} reviews`, content: Buffer.from(text).toString('base64') }),
    }).then(r => console.log(`saved drill ${name}: ${r.status}`)).catch(e => console.log('drill commit failed:', e.message));
  }
  return { ok: true, summary, durable: !!token };
}

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://x').pathname !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (m.t === 'join') {
      ws.room = String(m.room || 'main').slice(0, 40); ws.player = String(m.player || 'guest').slice(0, 40);
      const room = getRoom(ws.room);
      if (!room.puzzleId) room.puzzleId = PUZZLES.has(String(m.puzzle)) ? String(m.puzzle) : DEFAULT_PUZZLE;  // first joiner binds the theme
      if (!room.startedAt) room.startedAt = Date.now();
      room.lastMove = Date.now();
      room.conns.add(ws); ws.send(stateMsg(room)); broadcast(room);
      ws.send(JSON.stringify({ t: 'chathist', messages: room.chat }));
    } else if (m.t === 'fill' && ws.room) {
      const room = getRoom(ws.room); const P = puzzleOf(room); if (!P) return;
      const key = `${m.r},${m.c}`;
      if (!P.validCells.has(key) || room.solvedCells.has(key)) return;
      const ch = typeof m.ch === 'string' ? [...m.ch][0] || '' : '';
      if (ch) { room.cells.set(key, ch); room.contributors.set(ws.player, Date.now()); } else room.cells.delete(key);
      room.lastMove = Date.now();
      checkAll(room); broadcast(room);
    } else if (m.t === 'reset' && ws.room) {
      const room = getRoom(ws.room); resetRoom(room); broadcast(room);
    } else if (m.t === 'chat' && ws.room) {
      const text = String(m.text || '').trim().slice(0, 280);
      if (!text) return;
      const room = getRoom(ws.room);
      const msg = { from: ws.player || 'guest', text, ts: Date.now() };
      room.chat.push(msg); if (room.chat.length > 60) room.chat.shift();
      const out = JSON.stringify({ t: 'chat', msg });
      for (const c of room.conns) if (c.readyState === 1) c.send(out);
    }
  });
  ws.on('close', () => { if (ws.room && rooms.has(ws.room)) { const room = rooms.get(ws.room); room.conns.delete(ws); broadcast(room); } });
});
setInterval(() => {
  for (const ws of wss.clients) { if (ws.isAlive === false) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (e) {} }
  const now = Date.now();
  for (const [id, r] of rooms) if (r.conns.size === 0 && now - r.lastMove > 24 * 3600 * 1000) rooms.delete(id);
}, 30000);

server.listen(PORT, () => console.log(`couch-hebrew listening on :${PORT}`));
