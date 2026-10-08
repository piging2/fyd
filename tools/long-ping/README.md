# Long Ping production pipeline

Deterministic machinery for The Long Ping podcast: plan, stages, metric, acquisition.

## Layout

| Tool | Purpose |
|---|---|
| `content_plan.py` | Deterministic ContentPlan: parses `episode-topic-registry.md`, enforces the no-core-topic-reuse rule, emits canonical `ContentPlan.json` |
| `stage_ledger.py` | Per-episode stage state machine: research → treatment → script → record → master → package → publish |
| `metrics.py` | `PODCAST_READY_MINUTES_24H`: registers mastered audio (ffprobe duration), reports trailing-24h and calendar-day totals against the 120 min/day target |
| `rss_adapter.py` | RSS/Atom acquisition: fetches feeds, normalizes items, dedupes by content hash into `research-inbox.jsonl` |

State artifacts live in `~/workspace/ping-content/long-ping/` (not in this repo):
`ContentPlan.json`, `pipeline-state.json`, `metrics/podcast-ready-minutes.jsonl`,
`research-inbox.jsonl`.

## Stage contract

Stages advance in order. A stage cannot be marked done while an earlier stage
is unfinished. Publishing is authorization-gated: `stage_ledger.py publish`
refuses without `--authorize "<who> <date>: <reason>"`, and nothing in this
pipeline advances to publish on its own. Publishing stays a human decision.

## Metric

A podcast-ready minute is one minute of mastered episode audio. Register each
master with `metrics.py record-master`; check the daily target with
`metrics.py report`. Target: 120 minutes per calendar day.

## Tests

```sh
cd tools/long-ping
for t in tests/test_*.py; do python3 "$t"; done
```

## Episode 1 proof chain

Episode 1 exercises RSS → objects → evidence → search → Ask FYD: research
items acquired by `rss_adapter.py` become PING objects with evidence, are
searchable, and are answerable through Ask FYD with the visibility model.
