/**
 * Task: checkScoreHealth
 *
 * Validates NOUS Score engine integrity.
 * Checks score component consistency — GitHub + Solana should sum to total.
 * Flags agents stuck in pending for > 24h.
 * Detects score drift across cycles by comparing to last snapshot.
 */

import fetch from 'node-fetch';
import fs from 'fs';

export async function checkScoreHealth({ log, API_URL, state }) {
  const { agents } = state;
  let anomalies = 0;
  const issues  = [];

  for (const agent of agents) {
    const detail = agent.score_detail || {};
    const score  = agent.nous_score ?? 0;

    // Check component sum consistency
    if (detail.github !== undefined && detail.solana !== undefined) {
      const sum = (detail.github || 0) + (detail.solana || 0);
      if (Math.abs(sum - score) > 2) {
        const msg = `score mismatch — ${agent.public_key?.slice(0,8)}... components sum ${sum} vs stored ${score}`;
        log(`score-health: ⚠ ${msg}`);
        issues.push(msg);
        anomalies++;
      }
    }

    // Flag stuck pending agents
    if (agent.status === 'pending' && agent.created_at) {
      const age = Date.now() - new Date(agent.created_at).getTime();
      if (age > 24 * 60 * 60 * 1000) {
        const msg = `stuck pending — ${agent.public_key?.slice(0,8)}... registered ${Math.round(age/3600000)}h ago`;
        log(`score-health: ⚠ ${msg}`);
        issues.push(msg);
        anomalies++;
      }
    }
  }

  // Compare with previous snapshot
  if (fs.existsSync('./score-health.json')) {
    try {
      const prev = JSON.parse(fs.readFileSync('./score-health.json'));
      const drift = Math.abs((prev.avgScore || 0) - (state.agents.reduce((s,a) => s+(a.nous_score||0), 0) / (state.agents.length||1)));
      if (drift > 10) {
        log(`score-health: ⚠ score drift detected — ${drift.toFixed(1)}pt avg change since last cycle`);
        anomalies++;
      }
    } catch {}
  }

  const avgScore = agents.length
    ? agents.reduce((s, a) => s + (a.nous_score || 0), 0) / agents.length
    : 0;

  const report = { timestamp: new Date().toISOString(), agentsChecked: agents.length, anomalies, issues, avgScore: parseFloat(avgScore.toFixed(2)) };
  fs.writeFileSync('./score-health.json', JSON.stringify(report, null, 2));

  log(`score-health: ${anomalies === 0 ? '✓ engine healthy' : `⚠ ${anomalies} anomalies`} — ${agents.length} agents checked`);
  return `chore(score): health check — ${agents.length} agents, ${anomalies} anomalies${anomalies > 0 ? ' — investigating' : ''}`;
}
