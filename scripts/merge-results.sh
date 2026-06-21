#!/usr/bin/env bash
# Merge drilling results from the Chrome download inbox into the canonical log.
# Idempotent: each results file is appended once, then archived to processed/.
set -euo pipefail
ROOT="/Users/dlesky/hebrew"
INBOX="$ROOT/data/inbox"
LOG="$ROOT/data/reviews.jsonl"
PROCESSED="$INBOX/processed"
mkdir -p "$PROCESSED"
shopt -s nullglob
files=("$INBOX"/hebrew-results-*.jsonl)
if [ ${#files[@]} -eq 0 ]; then
  echo "no new results in inbox"
  exit 0
fi
n=0
for f in "${files[@]}"; do
  cat "$f" >> "$LOG"
  lines=$(grep -c . "$f" || true)
  echo "merged $(basename "$f")  (+${lines} events)"
  mv "$f" "$PROCESSED/"
  n=$((n + 1))
done
echo "---"
echo "merged ${n} file(s); reviews.jsonl now has $(grep -c . "$LOG") total events"
