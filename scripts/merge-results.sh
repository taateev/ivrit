#!/usr/bin/env bash
# Merge drilling results into the canonical log (data/reviews.jsonl). Idempotent.
# Two sources:
#   1. data/inbox/hebrew-results-*.jsonl  — local Chrome downloads (laptop). Archived to inbox/processed/.
#   2. data/results/*.jsonl               — committed by the phone via the GitHub API (run `git pull` first).
#      These are tracked files; after merging they are `rm`-ed, and the deletion is committed by the coach.
set -euo pipefail
ROOT="/Users/dlesky/hebrew"
LOG="$ROOT/data/reviews.jsonl"
INBOX="$ROOT/data/inbox"
RESULTS="$ROOT/data/results"
PROCESSED="$INBOX/processed"
mkdir -p "$PROCESSED"
shopt -s nullglob

n=0

# 1. Laptop downloads — append then archive (untracked, stay out of git).
for f in "$INBOX"/hebrew-results-*.jsonl; do
  cat "$f" >> "$LOG"
  echo "merged $(basename "$f")  (+$(grep -c . "$f" || true) events)  [inbox]"
  mv "$f" "$PROCESSED/"
  n=$((n + 1))
done

# 2. Phone commits — append then remove (tracked; deletion committed by coach).
for f in "$RESULTS"/*.jsonl; do
  cat "$f" >> "$LOG"
  echo "merged $(basename "$f")  (+$(grep -c . "$f" || true) events)  [phone]"
  rm "$f"
  n=$((n + 1))
done

if [ "$n" -eq 0 ]; then
  echo "no new results in inbox or results/"
  exit 0
fi
echo "---"
echo "merged ${n} file(s); reviews.jsonl now has $(grep -c . "$LOG") total events"
echo "note: phone files were removed from data/results/ — commit that deletion + the updated reviews.jsonl."
