# Couch Hebrew — design

A drilling program to teach a relative beginner to **read** casual modern Hebrew
(texts from friends, dialogue, everyday stuff) by recognizing the most common
words as whole shapes — "ideograms" — rather than by learning grammar.

## Learner assumptions (already known)
- The 22 letters, including final forms and the confusable pairs.
- The one-letter prefixes/prepositions (ו ה ב ל כ מ ש) and how to peel them off.
- The attached pronoun-suffix paradigm (לי, לך, שלי, אותו …) is therefore mostly free.

## Method
- **Pure drilling.** No grammar instruction, no conjugation tables. Each word is
  a shape to recognize, mapped to a meaning. (Tables may come back *much later* as
  consolidation of patterns the learner already feels — never as an upfront rule.)
- **Verbs are drilled per surface form**, treated as unrelated shapes. אמר / אומר /
  אמרו are three separate cards. No root-spotting (it fails on the irregular
  high-frequency verbs anyway). The card's gloss carries the tense/person, e.g.
  אמר → "said (he)", אומר → "says (m.sg)". Frequency-ranking prevents an explosion:
  rare conjugations simply never enter the deck.

## Niqqud
- **Hidden by default.** The bare, unpointed form is what gets drilled — that's what
  real text looks like.
- Niqqud (+ transliteration) lives on each card as a **revealable hint**, summoned on
  first contact or when stuck, then dropped. "Hidden" = suppressed-but-available,
  not absent. End state: fluent reading of bare text.

## Context frames
- A bare skeleton is ambiguous in isolation (ספר = sefer / sapar / siper / safar).
  **Context is the load-bearing replacement for the vowels we removed**, not an extra.
- Words are drilled inside short frames that disambiguate the target while using
  **only words already drilled** (i+1). The context-drill *is* the reading practice.
- Caveat: context disambiguates among readings you already know; it cannot *teach* a
  reading you've never heard. Hence the revealable hint on first contact.
- Homographs become a *feature*: drill דבר as "davar" (thing) in one frame and
  "diber" (he spoke) in another to show the shape is stable, context moves meaning.

## Ordering (dependency / topological sort)
- A word is teachable-by-context only once its framing words are known, so the **seed
  tier must be context-free-learnable** = the invariant words. Then expand outward.
- Drive primarily by frequency, modulated by: invariance (seed-able cold?) and
  framing-utility (how many later frames need it?). At the very top these coincide.
- The data shows ~75% of the top ~33 are cold-drillable invariants, ~18% derivable
  from known affixes, ~9% genuine homographs — so the deck runs ~25–30 words deep on
  pure cold drilling before frames are even required.

## Homographs to flag (the short, nameable exception list)
- את  — et (object marker, precedes a definite object) / at ("you" f., stands alone)
- עם  — im (with) / am (a people)
- אם  — im (if) / em (mother)
- אל  — el (to) / al (don't)
- שם  — sham (there) / shem (name)
- דבר — davar (thing) / diber (he spoke) / dever (plague)
את is #2 in frequency yet disambiguates trivially → introduced early regardless.

## Corpus
- OpenSubtitles modern Hebrew (hermitdave/FrequencyWords, 2018), **wordform/token**
  frequencies (NOT lemmatized — surface forms ranked individually, which is what the
  ideogram method needs). Colloquial register by design.

## Architecture (plan of record)

Two loops, two surfaces, one rule.

- **Deterministic inner loop — the quiz (browser).** A self-contained HTML/JS page
  runs the drill: bare word → flip to reveal gloss → a "peek niqqud" button →
  self-grade (again/hard/good/easy) → Leitner box math → contrastive ordering. All
  logic is frozen JS. It owns the *interaction*; it owns no durable state.
- **Generative outer loop — the coach (this terminal, Claude).** Owns durable truth on
  disk: words.json, reviews.jsonl, SRS state, the strata / partial-order logic.
  Between sessions only: fold the log → pick due + new cards → generate frames → prep
  the next session. After each session: read results → merge → analyze → adapt.
- **The rule:** Claude is NEVER in the per-card loop — only at session boundaries.
  Keeps drilling fast, deterministic, auditable, and context-cheap.

### Surfaces
One terminal (Claude, coach) + one browser tab (the quiz). No second terminal, no
long-running server.

### Session handoff (both directions sandbox-safe)
- **In — launch + seed (Chrome extension):** Claude `navigate`s the extension to the
  local quiz page, then `javascript_tool` calls `startSession({cards, frames,
  interleave})`, injecting the prepped session as a JS literal. The page never reads a
  file → sidesteps file:// fetch/CORS limits.
- **Out — results (download):** on finish the page bundles its review events into a
  blob and downloads `hebrew-results-<ISO-timestamp>.jsonl` to ~/Downloads. The page
  never writes to a path → sandbox-safe. Claude reads the newest such file and merges
  it into the canonical data/reviews.jsonl, then re-derives SRS state.

### Grading — multiple choice (Hebrew → meaning)
Bare Hebrew word + 4 English options; pick one. Objective and deterministic — the page
checks the choice, no LLM judging, no synonym-matching (which is why MC beats typed
recall here). Distractors prefer **confusable siblings** (שלי offers your/his), pushing
the contrastive principle into the answers. Grades: correct → `good`, wrong → `again`
(requeues within the session). No `easy`: in MC, response time is dominated by
option-scanning, so speed isn't a mastery signal. The niqqud + transliteration reveal
in the post-answer feedback (commit to meaning first, then learn the reading) — so
`peeked` stays false in MC. Recall/typed "hard mode" could reintroduce `easy` later.

### Persistence
Durable truth = data/reviews.jsonl on disk, owned by the terminal side. The browser
page is stateless per session: session injected as JS, results emitted as download.

### Decoupling / fallback
The page must also run standalone (open it, drill the last prepped session), so
drilling is never blocked on a live Claude session. The extension is a convenience
launcher, not a dependency.

### Open plumbing (settle in the PoC, don't assume)
- Whether the extension can drive a `file://` page (needs file-URL permission) or we
  fall back to a self-contained `data:text/html` URL.
- Confirm download naming/location and that the newest file is reliably readable.

### Gotchas (learned in PoC)
- **Disable browser auto-translation.** `<html lang="he">` makes Chrome translate the
  page to the user's language — converting the Hebrew we want them to *read* into
  English. Fix: `<html lang="en">`, `<meta name="google" content="notranslate">`, and
  `translate="no" lang="he"` on the Hebrew word/niqqud elements specifically.

- **Coach can't read ~/Downloads (macOS TCC).** The terminal/shell has no rights to
  Downloads (Desktop, Documents too) — `Operation not permitted`, not overridable by
  disabling the tool sandbox. So results must land in the **project dir** (not TCC-
  protected), via one of: (a) grant the terminal app Downloads access in System
  Settings (keeps normal download UX), (b) point the browser's download dir at
  ~/hebrew/inbox, or (c) File System Access API writing straight into the project.

### Build order
1. **Round-trip PoC** — extension opens the page + injects one card; user clicks a
   grade; page downloads a results file; Claude reads it and appends to reviews.jsonl.
   Proves the entire architecture end to end.
2. Real quiz UI (Hebrew webfont, peek-niqqud, contrastive ordering).
3. Coach side: log fold → SRS state → session prep + frame generation.
4. (Later) font pass; (optional) React front-end over the same files.

## Example frames (built only from earlier-ranked words)
- את (et):  אני רוצה את זה        "I want this"        — et precedes the object זה
- את (at):  את יודעת              "you (f.) know"      — at stands alone as subject
- אם (if):  אם זה טוב             "if this is good"
