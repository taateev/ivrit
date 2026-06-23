# Binyan & inflection-pattern frequencies (couch-Hebrew corpus)

Empirical frequencies of Hebrew verb patterns in our corpus, to drive a **frequency-ordered
morphology curriculum** (learn the patterns you'll actually meet, in order).

## Method
- **Corpus:** `data/os_sample.txt` — a ~5.4M-token sample of the OpenSubtitles Hebrew corpus
  (casual/dialogue register; see the frequency-list provenance note). 8,000 random sentences sampled (seed 42).
- **Tagger:** [stanza](https://stanfordnlp.github.io/stanza/) Hebrew model (trained on UD Hebrew-HTB),
  which emits `HebBinyan` + Tense + Person + Gender + Number per token. **8,513 verb tokens** analyzed.
- **Note:** Hebrew present tense is a participle with **no person marking** (אני/אתה/הוא כותב are all כותב),
  so present-tense person is collapsed below — those splits aren't real learnable forms.
- Reproduce: `scripts/binyan-freq.py` (needs a venv with `stanza`; `python3.12 -m venv … && pip install stanza`).

## Binyan distribution (share of verb tokens)
| binyan | all verbs | of *identified* |
|---|---|---|
| **Pa'al / Qal** | 51.6% | 61% |
| **Hif'il** | 14.2% | 17% |
| **Pi'el** | 7.7% | 9% |
| **Hitpa'el** | 5.4% | 6% |
| **Nif'al** | 4.9% | 6% |
| Pu'al | 0.7% | <1% |
| Huf'al | 0.3% | <1% |
| *(untagged: היה + ambiguous)* | 15.3% | — |

## Tense / form
Present **29%** · Past **23%** · Future **18%** · Infinitive **16%** · Participle 3%.
(Future + infinitive ≈ a third of all verbs — not just past/present.)

## The pattern space is steeply Zipfian
152 distinct patterns (after collapsing present-person). Coverage of all verb usage:

| to cover | patterns needed |
|---|---|
| **50%** | **12** |
| **80%** | **35** |
| **90%** | 54 |
| **95%** | 72 |

So the ~100-pattern intuition is right for full coverage, but **12 patterns = half of every verb you read.**

## Tier 1 — the 50% core (top 12, model verb כתב "write")
| # | pattern | example | share |
|---|---|---|---|
| 1 | Pa'al · present (m.sg) | כּוֹתֵב | 11.8% |
| 2 | Pa'al · infinitive | לִכְתֹּב | 8.4% |
| 3 | Pa'al · past · 1sg | כָּתַבְתִּי | 4.8% |
| 4 | *(untagged — היה etc.)* | — | 4.5% |
| 5 | Pa'al · past · 3ms (he) | כָּתַב | 3.6% |
| 6 | Hif'il · infinitive | לְהַסְבִּיר | 2.7% |
| 7 | Pi'el · infinitive | לְדַבֵּר | 2.7% |
| 8 | Pa'al · present (m.pl) | כּוֹתְבִים | 2.6% |
| 9 | Hif'il · present (m.sg) | מַסְבִּיר | 2.6% |
| 10 | Pa'al · present (f.sg) | כּוֹתֶבֶת | 2.5% |
| 11 | Pa'al · future · 2ms (you) | תִּכְתֹּב | 2.3% |
| 12 | Pa'al · future · 1sg (I) | אֶכְתֹּב | 2.2% |

## Tier 2 — 50% → 80% (ranks 13–35), three moves
**A. Complete the Pa'al persons** (past: she כָּתְבָה, you כָּתַבְתָּ, they כָּתְבוּ, we כָּתַבְנוּ; future: he יִכְתֹּב, she/you-f תִּכְתֹּב, we נִכְתֹּב) + **imperative** (כְּתֹב!).
**B. Present tense of every active binyan** — Pi'el מְדַבֵּר, Nif'al נִמְצָא/נִרְאֶה, Hitpa'el מַתְחִיל (Hif'il present already in Tier 1).
**C. Hif'il's other tenses** — future (תַּסְבִּיר/נַסְבִּיר/אַסְבִּיר/יַסְבִּיר) + past (הִסְבִּיר), plus **Hitpa'el infinitive** לְהַתְחִיל.

## Curriculum shape (the takeaway)
- **~12 patterns → 50%:** the Pa'al spine (present sg/pl/f, past he/I, future you/I, infinitive) + the Hif'il/Pi'el infinitives + Hif'il present.
- **~35 patterns → 80%:** the *complete* Pa'al table + *every* binyan's present + Hif'il future/past.
- **80% → 100%:** the long tail — Pi'el/Nif'al/Hitpa'el past & future, plurals, feminines, Pu'al/Huf'al, and the weak-root (gizra) variants.

## Caveats
- **15% of verbs untagged** ("?") — mostly היה "to be" (auxiliary) + genuinely ambiguous unvocalized forms. Doesn't change the binyan ranking.
- **Register:** OpenSubtitles is dialogue, so 1st/2nd-person and infinitive ("want to…") forms are over-represented vs a literary/news corpus — but that's exactly the couch-Hebrew target.
- **Single tagger, no gold check:** stanza on unvocalized text has error (esp. the untagged bucket); treat shares as ±1–2 points, the ranking as solid.
- **Gizra (weak-root class) not measured** — would need lemma+root analysis; this is binyan × tense × person/gender/number only.
