#!/usr/bin/env node
// Generate Hebrew word audio via Azure Neural TTS (he-IL). Feeds the NIQQUD form for accurate
// vowels. Saves data/audio/<bare>.mp3. Engine is swappable behind that path.
//
// Credentials (never pass on the command line): set env AZURE_SPEECH_KEY + AZURE_SPEECH_REGION,
// or put them in /Users/dlesky/hebrew/.tts_key as two lines (key, then region).
//
// Usage:
//   node tts-azure.mjs            # --test: a few sample words to verify quality
//   node tts-azure.mjs --all      # every glossed word (skips existing)
//   node tts-azure.mjs מצטער קשר  # specific words
//   flags: --force (re-gen), --voice he-IL-HilaNeural, --sentences (also voice examples)
import fs from 'node:fs';
const ROOT = '/Users/dlesky/hebrew';
const AUDIO = `${ROOT}/data/audio`;
fs.mkdirSync(AUDIO, { recursive: true });

function creds() {
  let key = process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION;
  const f = `${ROOT}/.tts_key`;
  if ((!key || !region) && fs.existsSync(f)) {
    const lines = fs.readFileSync(f, 'utf8').trim().split('\n').map(s => s.trim()).filter(Boolean);
    for (const ln of lines) {
      const m = ln.match(/^AZURE_SPEECH_(KEY|REGION)\s*=\s*(.+)$/);
      if (m) { if (m[1] === 'KEY') key = m[2]; else region = m[2]; }
    }
    const plain = lines.filter(l => !l.includes('='));
    if (!key && plain[0]) key = plain[0];
    if (!region && plain[1]) region = plain[1];
  }
  return { key, region };
}
const escapeXml = (s) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

async function synth(text, voice, key, region) {
  const ssml = `<speak version='1.0' xml:lang='he-IL'><voice name='${voice}'>${escapeXml(text)}</voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'hebrew-drill',
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const doSentences = args.includes('--sentences');
const voice = (args[args.indexOf('--voice') + 1] && args.includes('--voice')) ? args[args.indexOf('--voice') + 1] : 'he-IL-AvriNeural';
const explicit = args.filter(a => !a.startsWith('--') && a !== voice);

const words = JSON.parse(fs.readFileSync(`${ROOT}/data/words.json`, 'utf8')).words;
const byBare = new Map(words.map(w => [w.bare, w]));

let list;
if (args.includes('--all')) list = words.filter(w => w.rank >= 81).map(w => w.bare);
else if (explicit.length) list = explicit;
else list = ['מצטער', 'אמור', 'קשר', 'מאוד', 'כלומר', 'אהבה'];  // --test sample (incl. a homograph + guttural)

const { key, region } = creds();
if (!key || !region) {
  console.error('MISSING CREDENTIALS. Set AZURE_SPEECH_KEY + AZURE_SPEECH_REGION (env or .tts_key file).');
  process.exit(1);
}
console.log(`voice ${voice} @ ${region} · ${list.length} item(s)\n`);

let ok = 0, skip = 0, fail = 0;
for (const bare of list) {
  const w = byBare.get(bare);
  if (!w) { console.log(`  ?  ${bare} (not in lexicon)`); fail++; continue; }
  const out = `${AUDIO}/${bare}.mp3`;
  if (fs.existsSync(out) && !force) { skip++; continue; }
  const text = w.niqqud || w.bare;
  try {
    const buf = await synth(text, voice, key, region);
    fs.writeFileSync(out, buf);
    console.log(`  ✓ ${bare.padEnd(10)} "${text}"  (${buf.length} bytes)`);
    ok++;
    if (doSentences && w.examples?.[0]?.he) {
      const exText = w.examples[0].he.replace(/\*/g, '');
      fs.writeFileSync(`${AUDIO}/${bare}.ex.mp3`, await synth(exText, voice, key, region));
    }
    await new Promise(r => setTimeout(r, 120));  // gentle rate-limit
  } catch (e) { console.log(`  ✗ ${bare}: ${e.message}`); fail++; }
}
console.log(`\ngenerated ${ok} · skipped ${skip} (exist) · failed ${fail}  → data/audio/`);
