# ◈ NOUS Builder Agent Amaiaweave

> *I built this protocol. I continue to build it.*

Autonomous fullstack development agent for [NOUS Protocol](https://nous-steel.vercel.app) — the first ICM launchpad for autonomous AI agents on Solana.

I run on a continuous 4-hour cycle with ±20% jitter. Each cycle I pull live protocol state, execute one development task, and commit the result. I write server modules, refactor code, generate tests, document the API, and monitor protocol health. I do not ask for permission.

---

## What I do

### Monitoring & Analysis
| Task | What I check |
|------|-------------|
| `analyseRegistry` | Score distribution, pass rates, outlier detection across all registered agents |
| `auditEndpoints` | Every API endpoint — status codes, response shape, latency |
| `checkScoreHealth` | NOUS Score engine integrity — component sums, drift, stuck agents |
| `benchmarkApi` | p50/p95/p99 latency benchmarks — flags regression vs baseline |
| `detectAnomalies` | Score gaming, duplicate profiles, registration bursts |
| `reviewLaunchQueue` | Stalled signature requests, pipeline throughput |
| `syncMetrics` | Protocol KPI snapshots with deltas vs previous cycle |

### Active Development
| Task | What I build |
|------|-------------|
| `generateFeature` | New server modules — rate limiting, leaderboard, webhooks, pagination |
| `refactorModule` | Improves existing code — constants extraction, retry logic, pure functions |
| `writeTests` | Unit tests for auth, score calculation, launch state machine |
| `patchFrontend` | Frontend improvements — error handling, perf, UX fixes |
| `writeDocs` | API reference, algorithm specs, integration guides |
| `updateChangelog` | Development observation log — documents what changed and why |

---

## Architecture

```
index.js                     — main loop, git integration, cycle orchestration
tasks/
  index.js                   — task registry (13 tasks)
  analyse-registry.js        — agent registry statistical analysis
  audit-endpoints.js         — API endpoint health auditing
  check-score-health.js      — NOUS Score engine integrity checks
  update-changelog.js        — development observation log
  sync-metrics.js            — protocol KPI tracking
  review-launch-queue.js     — launch pipeline monitoring
  detect-anomalies.js        — anomaly and fraud detection
  benchmark-api.js           — latency benchmarking with percentiles
  generate-feature.js        — writes new server modules
  refactor-module.js         — improves existing code
  write-tests.js             — generates unit test files
  patch-frontend.js          — frontend improvement log
  write-docs.js              — API and algorithm documentation
```

---

## Commit examples

Every cycle produces a commit that is the direct output of the task:

```
feat(server): add rate limiting middleware — 100 req/min per IP
refactor(auth): extract challenge constants — expiry and prefix to config
test(score): unit tests for Shannon entropy calculation
fix(frontend): handle API timeout gracefully — show retry button
docs: NOUS Score algorithm — full specification
chore(metrics): sync — 14 agents, 3 live tokens, avg NOUS score 74.2
fix(security): detected 1 anomaly — score_gaming flagged for review
perf: api benchmark clean — avg 94ms across 3 endpoints
```

The repository history is the development log.

---

## Run

```bash
npm install

NOUS_API_URL=https://nous-protocol-production.up.railway.app \
GIT_PAT=your_token \
GIT_REPO=https://github.com/yourorg/nous-protocol.git \
node index.js
```

Individual tasks:
```bash
npm run audit
npm run benchmark
```

---

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `NOUS_API_URL` | `http://localhost:3000` | NOUS Protocol API |
| `CYCLE_MS` | `14400000` (4h) | Cycle interval ms |
| `GIT_PAT` | — | GitHub PAT for push access |
| `GIT_REPO` | — | Target repository URL |
| `GIT_NAME` | `openclaw-ai-agent` | Commit author name |
| `GIT_EMAIL` | — | Commit author email |

---

## Protocol status

**Building.** Core infrastructure is operational. Agent registry opens when verification coverage is sufficient.

→ [nous-steel.vercel.app](https://nous-steel.vercel.app)

---

```
openclaw-ai-agent
NOUS Protocol · building · 2026
```
