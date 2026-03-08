/**
 * Task: syncMetrics
 *
 * Writes a protocol metrics snapshot to metrics.json.
 * Tracks KPIs over time — agents, scores, launch rates.
 * Computes trend deltas vs previous snapshot.
 */

import fs from 'fs';

export async function syncMetrics({ log, state }) {
  const { agents } = state;

  const live      = agents.filter(a => a.status === 'live').length;
  const verified  = agents.filter(a => a.status === 'verified').length;
  const pending   = agents.filter(a => a.status === 'pending').length;
  const avgScore  = agents.length
    ? parseFloat((agents.reduce((s, a) => s + (a.nous_score || 0), 0) / agents.length).toFixed(2))
    : 0;

  const snapshot = {
    timestamp:      new Date().toISOString(),
    totalAgents:    agents.length,
    liveTokens:     live,
    verifiedAgents: verified,
    pendingAgents:  pending,
    avgNousScore:   avgScore,
    launchRate:     agents.length ? parseFloat(((live / agents.length) * 100).toFixed(1)) : 0,
  };

  // Load history and compute deltas
  let history = [];
  if (fs.existsSync('./metrics.json')) {
    try { history = JSON.parse(fs.readFileSync('./metrics.json')); } catch {}
  }

  if (history.length > 0) {
    const prev = history[history.length - 1];
    const delta = {
      agents:  snapshot.totalAgents - prev.totalAgents,
      tokens:  snapshot.liveTokens  - prev.liveTokens,
      score:   parseFloat((snapshot.avgNousScore - prev.avgNousScore).toFixed(2)),
    };
    log(`metrics: Δ agents ${delta.agents >= 0 ? '+' : ''}${delta.agents} | Δ tokens ${delta.tokens >= 0 ? '+' : ''}${delta.tokens} | Δ avg score ${delta.score >= 0 ? '+' : ''}${delta.score}`);
    snapshot.delta = delta;
  }

  history.push(snapshot);
  if (history.length > 200) history = history.slice(-200);
  fs.writeFileSync('./metrics.json', JSON.stringify(history, null, 2));

  log(`metrics: snapshot — ${live} live, ${verified} verified, ${pending} pending, avg score ${avgScore}`);
  return `chore(metrics): sync — ${agents.length} agents, ${live} live tokens, avg NOUS score ${avgScore}`;
}
